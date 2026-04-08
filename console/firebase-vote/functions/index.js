/**
 * submitVote（Callable）：校验投票码 → 写 Google 表 → 写审计 votes（source=vote-callable）
 * forwardVoteToSheet：兼容旧版前端直接 addDoc（source=vote-static-page）
 *
 * VOTE_CODES：DISABLED | __TICKETS__ | 内联逗号/换行列表（见 parseInlineCodes）
 * __TICKETS__ 时：Callable 须传 roundId（ALLOWED_ROUND_IDS）；Firestore tickets 用 usedRounds[roundId] 按轮扣次。
 *
 * VOTE_TEST_CODE（可选 String 参数，默认空）：非空时与该串（不分大小写）相等的投票码直接通过验票且不扣 Firestore 票，供联调；生产勿设。
 */
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret, defineString } = require("firebase-functions/params");
const admin = require("firebase-admin");
const crypto = require("crypto");

const voteIngestUrl = defineSecret("VOTE_INGEST_URL");
const voteCodesSecret = defineSecret("VOTE_CODES");
/** 非空则 Callable 须传 data.secret 且一致；留空则不校验发布（勿公开 index.html 链接） */
const staffPublishSecret = defineString("STAFF_PUBLISH_SECRET", {
  default: "",
  description:
    "可选。不设或空 = 无需密钥即可 publishVoteUi；设为非空则与调度页输入一致",
});
const voteIngestSecret = defineString("VOTE_INGEST_SECRET", {
  default: "",
  description: "与 Apps Script 脚本属性 VOTE_INGEST_SECRET 一致；未设脚本属性可留空",
});

/** 非空时：与该字符串（不分大小写）相等的投票码始终通过 Callable 验票，且不消耗 Firestore 票。生产务必留空。 */
const voteTestCode = defineString("VOTE_TEST_CODE", {
  default: "",
  description: "测试专用投票码；与 vote-config.js 的 testVoteCode 一致时使用",
});

if (!admin.apps.length) {
  admin.initializeApp();
}

/** 与 docs 中「每轮一票」约定一致；换轮改 voteRoundId 并重新部署投票页 */
const ROUND_IDS_ORDERED = [
  "round1_pk_1",
  "round1_pk_2",
  "round1_pk_3",
  "round1_pk_4",
  "round1_pk_5",
  "round2_revival",
  "final_perf_1",
  "final_perf_2",
  "final_perf_3",
  "final_perf_4",
  "final_perf_5",
  "final_perf_6",
];

const ALLOWED_ROUND_IDS = new Set(ROUND_IDS_ORDERED);

function assertAllowedRoundId(roundId) {
  if (!roundId || !ALLOWED_ROUND_IDS.has(roundId)) {
    throw new HttpsError("invalid-argument", "无效或不允许的投票轮次 roundId。");
  }
}

/** 去掉零宽字符等，避免 URL/复制带进 invisible 字符导致 round1 识别失败 */
function normalizeClientRoundId(raw) {
  return String(raw ?? "")
    .replace(/\u200b/g, "")
    .replace(/\ufeff/g, "")
    .trim()
    .toLowerCase();
}

/** round1_pk_1 → 表数据行 2 … round1_pk_5 → 行 6；非初赛返回 null */
function pairRowFromRound1PkRoundId(roundId) {
  const m = /^round1_pk_([1-5])$/.exec(normalizeClientRoundId(roundId));
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!Number.isInteger(n) || n < 1 || n > 5) return null;
  return n + 1;
}

const ALLOWED_CHOICE_IDS = new Set(["s1", "s2", "s3", "s4", "s5", "s6"]);
/** 初赛 PK 十人五组（1v2…9v10）submitVote 审计用 */
const ROUND1_PAIR_CHOICE_IDS = new Set([
  "s1",
  "s2",
  "s3",
  "s4",
  "s5",
  "s6",
  "s7",
  "s8",
  "s9",
  "s10",
]);
const ALLOWED_SHEET_ROWS = new Set([2, 3, 4, 5, 6, 7]);
/** publishVoteUi 允许更宽的行号，便于初赛两人占位与复活 2～7 共存校验 */
const PUBLISH_SHEET_ROWS = new Set([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

/** 与 firestore.rules / vote-config 一致时可收紧；含决赛第 6 人（s6 / 第 7 行） */
function assertAllowedVote(eventId, choiceId, sheetRow) {
  if (eventId !== "voiceofnyc-revival") {
    throw new HttpsError("invalid-argument", "不支持的活动。");
  }
  if (!ALLOWED_CHOICE_IDS.has(choiceId) || !ALLOWED_SHEET_ROWS.has(sheetRow)) {
    throw new HttpsError("invalid-argument", "选手数据无效。");
  }
}

/**
 * @param {unknown} arr
 * @returns {{ id: string, sheetRow: number, label: string, img: string }[]}
 */
function validateCandidatesForPublish(arr) {
  if (!Array.isArray(arr) || arr.length < 1 || arr.length > 6) {
    throw new HttpsError("invalid-argument", "candidates 须为 1～6 项的非空数组。");
  }
  const seenId = new Set();
  const seenRow = new Set();
  const out = [];
  for (const raw of arr) {
    const c = raw && typeof raw === "object" ? raw : {};
    const id = String(c.id || "").trim();
    const sheetRow = Number(c.sheetRow);
    const label = String(c.label || "").trim();
    const img = String(c.img != null ? c.img : "").trim();
    if (!ROUND1_PAIR_CHOICE_IDS.has(id)) {
      throw new HttpsError("invalid-argument", `无效的 choiceId：${id}`);
    }
    if (seenId.has(id)) {
      throw new HttpsError("invalid-argument", "choiceId 重复。");
    }
    if (!Number.isInteger(sheetRow) || !PUBLISH_SHEET_ROWS.has(sheetRow)) {
      throw new HttpsError("invalid-argument", `无效的 sheetRow：${c.sheetRow}`);
    }
    if (seenRow.has(sheetRow)) {
      /** 初赛两人同占 Round1Audience 一行（B/C），允许同一 sheetRow 两次，且仅 2 人、行 2～6 */
      const dupOkRound1Pair =
        arr.length === 2 &&
        out.length === 1 &&
        out[0].sheetRow === sheetRow &&
        sheetRow >= 2 &&
        sheetRow <= 6;
      if (!dupOkRound1Pair) {
        throw new HttpsError("invalid-argument", "sheetRow 重复。");
      }
    } else {
      seenRow.add(sheetRow);
    }
    if (label.length < 1 || label.length > 120) {
      throw new HttpsError("invalid-argument", "label 长度须在 1～120。");
    }
    if (img.length > 500) {
      throw new HttpsError("invalid-argument", "img 路径过长。");
    }
    seenId.add(id);
    out.push({ id, sheetRow, label, img });
  }
  return out;
}

/**
 * 按环节校验并规范化 voteUi.rounds[roundId]（空 candidates 仅标题也允许）。
 * 初赛 round1_pk_* 一旦有选手则须恰好 2 人。
 */
function validateOptionalRoundBlock(roundId, block) {
  const rid = String(roundId || "").trim();
  if (!ALLOWED_ROUND_IDS.has(rid)) {
    throw new HttpsError("invalid-argument", `无效的 roundId：${rid}`);
  }
  if (!block || typeof block !== "object" || Array.isArray(block)) {
    return { candidates: [], pageTitle: null, subtitle: null };
  }
  const pageTitle =
    block.pageTitle != null ? String(block.pageTitle).trim().slice(0, 120) : "";
  const subtitle =
    block.subtitle != null ? String(block.subtitle).trim().slice(0, 400) : "";
  const arr = block.candidates;
  if (!Array.isArray(arr) || arr.length === 0) {
    return {
      candidates: [],
      pageTitle: pageTitle || null,
      subtitle: subtitle || null,
    };
  }
  if (/^round1_pk_[1-5]$/.test(rid) && arr.length !== 2) {
    throw new HttpsError(
      "invalid-argument",
      `${rid} 须恰好 2 名选手（第 1 位左侧 / 第 2 位右侧）。`
    );
  }
  if (/^final_perf_[1-6]$/.test(rid) && arr.length !== 1) {
    throw new HttpsError(
      "invalid-argument",
      `${rid} 须恰好 1 名选手（决赛每唱一人）。`
    );
  }
  const candidates = validateCandidatesForPublish(arr);
  if (/^final_perf_[1-6]$/.test(rid)) {
    const m = /^final_perf_([1-6])$/.exec(rid);
    const wantRow = parseInt(m[1], 10) + 1;
    if (candidates[0].sheetRow !== wantRow) {
      throw new HttpsError(
        "invalid-argument",
        `${rid} 的选手表行必须为 ${wantRow}（与 vote 页 final_perf 规则一致）。`
      );
    }
  }
  return {
    candidates,
    pageTitle: pageTitle || null,
    subtitle: subtitle || null,
  };
}

/** 写入顶层 candidates 供旧版前端兜底 */
function legacyMirrorFromRounds(roundsOut) {
  const revival = roundsOut.round2_revival;
  if (revival && Array.isArray(revival.candidates) && revival.candidates.length) {
    return {
      candidates: revival.candidates,
      pageTitle: revival.pageTitle || null,
      subtitle: revival.subtitle || null,
    };
  }
  for (const rid of ROUND_IDS_ORDERED) {
    const b = roundsOut[rid];
    if (b && Array.isArray(b.candidates) && b.candidates.length) {
      return {
        candidates: b.candidates,
        pageTitle: b.pageTitle || null,
        subtitle: b.subtitle || null,
      };
    }
  }
  return { candidates: [], pageTitle: null, subtitle: null };
}

/** null = DISABLED；空 Set = Firestore 票；非空 Set = 内联口令 */
function parseInlineCodes(raw) {
  const t = String(raw || "").trim();
  if (/^disabled$/i.test(t)) return null;
  if (/^__tickets__$/i.test(t)) return new Set();
  return new Set(
    t
      .split(/[\n,]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
  );
}

/**
 * Firestore __TICKETS__：同一码在每个 roundId 下各可用一次。旧数据仅有 used:true 且无 usedRounds 时视为已耗尽（旧版全局一次）。
 * @returns {Promise<{ ok: true } | { ok: false, reason: string }>}
 */
async function tryConsumeTicket(eventId, rawCode, voteId, roundId) {
  const code = String(rawCode || "").trim().toUpperCase();
  const rid = String(roundId || "").trim();
  if (!code || !rid) {
    return { ok: false, reason: "请填写投票码。" };
  }
  const db = admin.firestore();
  const ref = db.collection("events").doc(eventId).collection("tickets").doc(code);
  try {
    await db.runTransaction(async (t) => {
      const doc = await t.get(ref);
      if (!doc.exists) {
        throw new Error("no_ticket");
      }
      const data = doc.data() || {};
      const usedRounds = data.usedRounds && typeof data.usedRounds === "object" ? data.usedRounds : {};
      if (usedRounds[rid] === true) {
        throw new Error("already_used_round");
      }
      if (data.used === true && Object.keys(usedRounds).length === 0) {
        throw new Error("already_used_legacy"); 
      }
      const nextRounds = { ...usedRounds, [rid]: true };
      t.update(ref, {
        used: true,
        usedRounds: nextRounds,
        usedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastRoundId: rid,
        lastVoteId: voteId,
      });
    });
    return { ok: true };
  } catch (e) {
    const msg = String(e && e.message ? e.message : e);
    if (msg === "no_ticket") {
      return {
        ok: false,
        reason:
          "票库中无此码（请确认 Firestore tickets 文档 ID 与输入一致，含横杠；或改用已配置的测试码并重新 deploy Functions）。",
      };
    }
    if (msg === "already_used_round") {
      return { ok: false, reason: "该投票码在本环节已使用过。" };
    }
    if (msg === "already_used_legacy") {
      return {
        ok: false,
        reason: "该码为旧版「全场单次」票，已标记为已使用；请换码或在 Firestore 重置该文档。",
      };
    }
    console.warn("ticket check failed", code.slice(0, 6) + "…", msg);
    return { ok: false, reason: "投票码校验失败（请稍后重试或联系工作人员）。" };
  }
}

/**
 * @returns {Promise<{ ok: true } | { ok: false, reason: string }>}
 */
async function voteCodeAllowsSheet(eventId, submitted, voteId, secretRaw, roundId) {
  const testWant = voteTestCode.value().trim();
  const sub = String(submitted || "").trim().toUpperCase();
  if (testWant && sub === testWant.toUpperCase()) {
    return { ok: true };
  }
  const inline = parseInlineCodes(secretRaw);
  if (inline === null) {
    return { ok: true };
  }
  if (!sub) {
    return { ok: false, reason: "请填写投票码。" };
  }
  if (inline.size > 0) {
    if (inline.has(sub)) return { ok: true };
    return {
      ok: false,
      reason:
        "投票码不在当前白名单内（Secret 内联列表）。若要用测试码，请设 VOTE_TEST_CODE 与 vote-config.testVoteCode 一致并重新部署 Functions。",
    };
  }
  return tryConsumeTicket(eventId, sub, voteId, roundId);
}

/**
 * @returns {Promise<{ ok: true, ambiguous?: boolean } | { error: string }>}
 */
async function postAddFinalVoteToSheet(row, url, ingestSecretStr) {
  const payload = {
    action: "addFinalVote",
    row,
    delta: 1,
  };
  if (ingestSecretStr) payload.secret = ingestSecretStr;

  const res = await fetch(url, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  const trimmed = text.trim();
  let parsed = null;
  if (trimmed.startsWith("{")) {
    try {
      parsed = JSON.parse(trimmed);
    } catch (_) {
      /* ignore */
    }
  }

  if (parsed && parsed.ok === false) {
    return { error: String(parsed.error || "写入表格被拒绝") };
  }
  if (parsed && parsed.ok === true) {
    return { ok: true };
  }
  return { ok: true, ambiguous: true };
}

/** 决赛轮次：写入 Round3Audience（与前端 final-reveal、vote-ingest addRound3Vote 一致） */
function isFinalPerfRoundId(rid) {
  return /^final_perf_[1-6]$/.test(normalizeClientRoundId(rid));
}

async function postAddRound3VoteToSheet(row, url, ingestSecretStr) {
  const payload = {
    action: "addRound3Vote",
    row,
    delta: 1,
  };
  if (ingestSecretStr) payload.secret = ingestSecretStr;

  const res = await fetch(url, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  const trimmed = text.trim();
  let parsed = null;
  if (trimmed.startsWith("{")) {
    try {
      parsed = JSON.parse(trimmed);
    } catch (_) {
      /* ignore */
    }
  }

  if (parsed && parsed.ok === false) {
    return { error: String(parsed.error || "写入 Round3 被拒绝") };
  }
  if (parsed && parsed.ok === true) {
    return { ok: true };
  }
  return { ok: true, ambiguous: true };
}

/** 决赛投票页：1–10 分 → Round3 H/I 累计，B 为公式均分 */
async function postAddRound3AudienceScoreToSheet(row, score, url, ingestSecretStr) {
  const payload = {
    action: "addRound3AudienceScore",
    row,
    score,
  };
  if (ingestSecretStr) payload.secret = ingestSecretStr;

  const res = await fetch(url, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  const trimmed = text.trim();
  let parsed = null;
  if (trimmed.startsWith("{")) {
    try {
      parsed = JSON.parse(trimmed);
    } catch (_) {
      /* ignore */
    }
  }

  if (parsed && parsed.ok === false) {
    return { error: String(parsed.error || "写入 Round3 观众分被拒绝") };
  }
  if (parsed && parsed.ok === true) {
    return { ok: true };
  }
  return { ok: true, ambiguous: true };
}

/**
 * Round1Audience：观众左 B 列 / 右 C 列累加（见 vote-ingest.gs addPairVote）
 * @returns {Promise<{ ok: true, ambiguous?: boolean } | { error: string }>}
 */
async function postAddPairVoteToSheet(pairRow, side, url, ingestSecretStr) {
  const payload = {
    action: "addPairVote",
    pairRow,
    side: side === "right" ? "right" : "left",
    part: "audience",
    delta: 1,
  };
  if (ingestSecretStr) payload.secret = ingestSecretStr;

  const res = await fetch(url, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  const trimmed = text.trim();
  let parsed = null;
  if (trimmed.startsWith("{")) {
    try {
      parsed = JSON.parse(trimmed);
    } catch (_) {
      /* ignore */
    }
  }

  if (parsed && parsed.ok === false) {
    return { error: String(parsed.error || "写入表格被拒绝") };
  }
  if (parsed && parsed.ok === true) {
    return { ok: true };
  }
  return { ok: true, ambiguous: true };
}

/** 初赛 PK 审计：只校验 choiceId / label，不写 Round2 行 */
function assertRound1PairVote(eventId, choiceId, label) {
  if (eventId !== "voiceofnyc-revival") {
    throw new HttpsError("invalid-argument", "不支持的活动。");
  }
  if (!ROUND1_PAIR_CHOICE_IDS.has(choiceId)) {
    throw new HttpsError("invalid-argument", "选手数据无效。");
  }
  if (!label || label.length > 120) {
    throw new HttpsError("invalid-argument", "显示名无效。");
  }
}

/** 工作人员发布投票页 UI 到 Firestore events/{eventId}/site/voteUi */
exports.publishVoteUi = onCall(
  {
    region: "us-east4",
    cors: true,
  },
  async (request) => {
    const data = request.data || {};
    const eventId = String(data.eventId || "").trim();
    const expected = (staffPublishSecret.value() || "").trim();
    if (eventId !== "voiceofnyc-revival") {
      throw new HttpsError("invalid-argument", "不支持的活动。");
    }
    if (expected) {
      const secret = String(data.secret || "").trim();
      if (secret !== expected) {
        throw new HttpsError("permission-denied", "发布密钥无效。");
      }
    }

    if (data.rounds && typeof data.rounds === "object" && !Array.isArray(data.rounds)) {
      const roundsOut = {};
      for (const rid of ROUND_IDS_ORDERED) {
        const sanitized = validateOptionalRoundBlock(rid, data.rounds[rid]);
        if (
          sanitized.candidates.length > 0 ||
          sanitized.pageTitle ||
          sanitized.subtitle
        ) {
          roundsOut[rid] = sanitized;
        }
      }
      const mirror = legacyMirrorFromRounds(roundsOut);
      await admin
        .firestore()
        .collection("events")
        .doc(eventId)
        .collection("site")
        .doc("voteUi")
        .set({
          voteUiVersion: 2,
          rounds: roundsOut,
          candidates: mirror.candidates,
          pageTitle: mirror.pageTitle,
          subtitle: mirror.subtitle,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      return { ok: true };
    }

    const candidates = validateCandidatesForPublish(data.candidates);
    const pageTitle =
      data.pageTitle != null ? String(data.pageTitle).trim().slice(0, 120) : "";
    const subtitle =
      data.subtitle != null ? String(data.subtitle).trim().slice(0, 400) : "";

    await admin
      .firestore()
      .collection("events")
      .doc(eventId)
      .collection("site")
      .doc("voteUi")
      .set({
        candidates,
        pageTitle: pageTitle || null,
        subtitle: subtitle || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    return { ok: true };
  }
);

exports.submitVote = onCall(
  {
    secrets: [voteIngestUrl, voteCodesSecret],
    region: "us-east4",
    cors: true,
  },
  async (request) => {
    const data = request.data || {};
    const eventId = String(data.eventId || "").trim();
    const choiceId = String(data.choiceId || "").trim();
    const sheetRow = Number(data.sheetRow);
    const label = String(data.label || "").trim();
    const voteCodeRaw = data.voteCode != null ? String(data.voteCode) : "";
    const roundIdNorm = normalizeClientRoundId(
      data.roundId != null ? data.roundId : data.round_id != null ? data.round_id : ""
    );
    let pairRow = pairRowFromRound1PkRoundId(roundIdNorm);
    const pairSideRaw = String(data.pairSide || "").trim().toLowerCase();
    const pairRowHint = Number(data.pairRow);

    if (!eventId || !choiceId || !label) {
      throw new HttpsError("invalid-argument", "缺少必填字段。");
    }

    if (pairRow != null && Number.isInteger(pairRowHint) && pairRowHint !== pairRow) {
      throw new HttpsError("invalid-argument", "初赛 pairRow 与 roundId 不一致。");
    }

    const isRound1Pair = pairRow != null;

    if (isRound1Pair) {
      assertRound1PairVote(eventId, choiceId, label);
      if (pairSideRaw !== "left" && pairSideRaw !== "right") {
        throw new HttpsError("invalid-argument", "初赛须指定 pairSide 为 left 或 right。");
      }
    } else {
      if (!Number.isInteger(sheetRow) || sheetRow < 2) {
        throw new HttpsError(
          "invalid-argument",
          "选手行号无效。初赛 PK 请使用 roundId=round1_pk_1～5 并部署最新 submitVote；复活/决赛需合法 sheetRow。"
        );
      }
      assertAllowedVote(eventId, choiceId, sheetRow);
      if (isFinalPerfRoundId(roundIdNorm)) {
        const as = Number(data.audienceScore);
        if (!Number.isInteger(as) || as < 1 || as > 10) {
          throw new HttpsError(
            "invalid-argument",
            "决赛须提交 audienceScore（1～10 的整数）。"
          );
        }
      }
    }

    const voteId = `call-${crypto.randomUUID()}`;
    const voteCode = voteCodeRaw.trim().toUpperCase();
    const inline = parseInlineCodes(voteCodesSecret.value());
    const needsTicketRound = inline && inline.size === 0;
    if (needsTicketRound) {
      assertAllowedRoundId(roundIdNorm);
    }

    const codeCheck = await voteCodeAllowsSheet(
      eventId,
      voteCode,
      voteId,
      voteCodesSecret.value(),
      roundIdNorm
    );
    if (!codeCheck.ok) {
      throw new HttpsError(
        "invalid-argument",
        codeCheck.reason || "投票码无效或已使用。"
      );
    }

    const url = voteIngestUrl.value().trim();
    if (!url) {
      throw new HttpsError("failed-precondition", "服务端未配置表格写入地址。");
    }

    const sec = (voteIngestSecret.value() || "").trim();
    let sheetResult;
    if (isRound1Pair) {
      sheetResult = await postAddPairVoteToSheet(pairRow, pairSideRaw, url, sec);
    } else if (isFinalPerfRoundId(roundIdNorm)) {
      sheetResult = await postAddRound3AudienceScoreToSheet(
        sheetRow,
        Number(data.audienceScore),
        url,
        sec
      );
    } else {
      sheetResult = await postAddFinalVoteToSheet(sheetRow, url, sec);
    }
    if (sheetResult.error) {
      throw new HttpsError("failed-precondition", `表格写入失败：${sheetResult.error}`);
    }

    const votePayload = {
      choiceId,
      label,
      voteCode,
      roundId: roundIdNorm || "",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      source: "vote-callable",
      clientSheetUncertain: sheetResult.ambiguous === true,
    };
    if (isRound1Pair) {
      votePayload.voteKind = "round1_pair";
      votePayload.pairRow = pairRow;
      votePayload.pairSide = pairSideRaw;
      votePayload.sheetRow = pairRow;
    } else {
      votePayload.sheetRow = sheetRow;
      if (isFinalPerfRoundId(roundIdNorm)) {
        votePayload.audienceScore = Number(data.audienceScore);
      }
    }

    await admin.firestore().collection("events").doc(eventId).collection("votes").add(votePayload);

    return {
      ok: true,
      sheetUncertain: sheetResult.ambiguous === true,
    };
  }
);

exports.forwardVoteToSheet = onDocumentCreated(
  {
    document: "events/{eventId}/votes/{voteId}",
    secrets: [voteIngestUrl, voteCodesSecret],
    region: "us-east4",
  },
  async (event) => {
    const snap = event.data;
    if (!snap?.exists) return;

    const d = snap.data();
    if (d.source !== "vote-static-page") return;

    const row = Number(d.sheetRow);
    if (!Number.isInteger(row) || row < 2) {
      console.warn("skip vote: bad sheetRow", d.sheetRow);
      return;
    }

    const eventId = event.params.eventId;
    const voteId = event.params.voteId;
    const roundId = String(d.roundId || "").trim();
    const inline = parseInlineCodes(voteCodesSecret.value());
    if (inline && inline.size === 0 && !ALLOWED_ROUND_IDS.has(roundId)) {
      console.warn("skip vote: roundId missing or not allowed for __TICKETS__");
      return;
    }
    const codeCheck = await voteCodeAllowsSheet(
      eventId,
      d.voteCode,
      voteId,
      voteCodesSecret.value(),
      roundId
    );
    if (!codeCheck.ok) {
      console.warn("skip vote: voteCode rejected", codeCheck.reason || "");
      return;
    }

    const url = voteIngestUrl.value().trim();
    if (!url) {
      console.error("VOTE_INGEST_URL is empty");
      return;
    }

    const sec = (voteIngestSecret.value() || "").trim();
    const useRound3 = isFinalPerfRoundId(roundId);
    const asStatic = Number(d.audienceScore);
    let sheetResult;
    if (useRound3) {
      if (Number.isInteger(asStatic) && asStatic >= 1 && asStatic <= 10) {
        sheetResult = await postAddRound3AudienceScoreToSheet(row, asStatic, url, sec);
      } else {
        sheetResult = await postAddRound3VoteToSheet(row, url, sec);
      }
    } else {
      sheetResult = await postAddFinalVoteToSheet(row, url, sec);
    }
    if (sheetResult.error) {
      console.error("vote-ingest rejected", sheetResult.error);
      throw new Error(`vote-ingest: ${sheetResult.error}`);
    }
    if (sheetResult.ok && !sheetResult.ambiguous) {
      console.log("vote-ingest ok");
      return;
    }
    console.warn("vote-ingest ambiguous (check sheet)", sheetResult);
  }
);
