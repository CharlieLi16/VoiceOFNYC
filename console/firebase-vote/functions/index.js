/**
 * submitVote（Callable）：校验投票码 → 写 Google 表 → 写审计 votes（source=vote-callable）
 * forwardVoteToSheet：兼容旧版前端直接 addDoc（source=vote-static-page）
 *
 * VOTE_CODES：DISABLED | __TICKETS__ | 内联逗号/换行列表（见 parseInlineCodes）
 */
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret, defineString } = require("firebase-functions/params");
const admin = require("firebase-admin");
const crypto = require("crypto");

const voteIngestUrl = defineSecret("VOTE_INGEST_URL");
const voteCodesSecret = defineSecret("VOTE_CODES");
const voteIngestSecret = defineString("VOTE_INGEST_SECRET", {
  default: "",
  description: "与 Apps Script 脚本属性 VOTE_INGEST_SECRET 一致；未设脚本属性可留空",
});

if (!admin.apps.length) {
  admin.initializeApp();
}

/** 与 firestore.rules / vote-config 一致时可收紧 */
function assertAllowedVote(eventId, choiceId, sheetRow) {
  if (eventId !== "voiceofnyc-revival") {
    throw new HttpsError("invalid-argument", "不支持的活动。");
  }
  const allowedChoice = new Set(["s1", "s2", "s3", "s4", "s5"]);
  const allowedRow = new Set([2, 3, 4, 5, 6]);
  if (!allowedChoice.has(choiceId) || !allowedRow.has(sheetRow)) {
    throw new HttpsError("invalid-argument", "选手数据无效。");
  }
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

async function tryConsumeTicket(eventId, rawCode, voteId) {
  const code = String(rawCode || "").trim().toUpperCase();
  if (!code) return false;
  const db = admin.firestore();
  const ref = db.collection("events").doc(eventId).collection("tickets").doc(code);
  try {
    await db.runTransaction(async (t) => {
      const doc = await t.get(ref);
      if (!doc.exists) {
        throw new Error("no_ticket");
      }
      const data = doc.data() || {};
      if (data.used === true) {
        throw new Error("already_used");
      }
      t.update(ref, {
        used: true,
        usedAt: admin.firestore.FieldValue.serverTimestamp(),
        voteId,
      });
    });
    return true;
  } catch (e) {
    console.warn("ticket check failed", code.slice(0, 6) + "…", e.message);
    return false;
  }
}

async function voteCodeAllowsSheet(eventId, submitted, voteId, secretRaw) {
  const inline = parseInlineCodes(secretRaw);
  if (inline === null) {
    return true;
  }
  const s = String(submitted || "").trim().toUpperCase();
  if (inline.size > 0) {
    return inline.has(s);
  }
  return tryConsumeTicket(eventId, s, voteId);
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

    if (!eventId || !choiceId || !label) {
      throw new HttpsError("invalid-argument", "缺少必填字段。");
    }
    if (!Number.isInteger(sheetRow) || sheetRow < 2) {
      throw new HttpsError("invalid-argument", "选手行号无效。");
    }

    assertAllowedVote(eventId, choiceId, sheetRow);

    const voteId = `call-${crypto.randomUUID()}`;
    const voteCode = voteCodeRaw.trim().toUpperCase();

    const okCode = await voteCodeAllowsSheet(
      eventId,
      voteCode,
      voteId,
      voteCodesSecret.value()
    );
    if (!okCode) {
      throw new HttpsError("invalid-argument", "投票码无效或已使用。");
    }

    const url = voteIngestUrl.value().trim();
    if (!url) {
      throw new HttpsError("failed-precondition", "服务端未配置表格写入地址。");
    }

    const sec = (voteIngestSecret.value() || "").trim();
    const sheetResult = await postAddFinalVoteToSheet(sheetRow, url, sec);
    if (sheetResult.error) {
      throw new HttpsError("failed-precondition", `表格写入失败：${sheetResult.error}`);
    }

    await admin
      .firestore()
      .collection("events")
      .doc(eventId)
      .collection("votes")
      .add({
        choiceId,
        sheetRow,
        label,
        voteCode,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        source: "vote-callable",
        clientSheetUncertain: sheetResult.ambiguous === true,
      });

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
    const okCode = await voteCodeAllowsSheet(
      eventId,
      d.voteCode,
      voteId,
      voteCodesSecret.value()
    );
    if (!okCode) {
      console.warn("skip vote: voteCode rejected (sheet unchanged)");
      return;
    }

    const url = voteIngestUrl.value().trim();
    if (!url) {
      console.error("VOTE_INGEST_URL is empty");
      return;
    }

    const sec = (voteIngestSecret.value() || "").trim();
    const sheetResult = await postAddFinalVoteToSheet(row, url, sec);
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
