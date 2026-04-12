/**
 * 现场投票 → Callable submitVote（校验投票码、写表成功后再提示成功）
 * 大屏仍读 Google 表；审计记录在 Firestore votes（source=vote-callable）
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getFunctions, httpsCallable, connectFunctionsEmulator } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";

const cfg = window.__VOTE_PAGE_CONFIG;

/** 须与 firebase-vote/functions/index.js 中 ALLOWED_ROUND_IDS 一致 */
const ALLOWED_ROUND_IDS = new Set([
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
]);

const gridEl = document.getElementById("vp-grid");
const bannerEl = document.getElementById("vp-banner");
const submitBtn = document.getElementById("vp-submit");
const rootEl = document.getElementById("vp-root");
const codeWrap = document.getElementById("vp-code-wrap");
const codeInput = document.getElementById("vp-code");

/** 与 `src/auth/staffPortal.ts` 中 SESSION_KEY / PERSIST_KEY 一致；仅在控台 `/login` 工作人员登录后写入 */
function isStaffPortalAuthedInBrowser() {
  try {
    return (
      sessionStorage.getItem("voiceofnyc-staff-portal") === "1" ||
      localStorage.getItem("voiceofnyc-staff-portal-persist") === "1"
    );
  } catch {
    return false;
  }
}

function showBanner(text, ok = false) {
  if (!bannerEl) return;
  bannerEl.hidden = false;
  bannerEl.textContent = text;
  bannerEl.className = "vp-banner" + (ok ? " vp-banner--ok" : "");
}

function validFirebase(fb) {
  return (
    fb &&
    typeof fb.apiKey === "string" &&
    fb.apiKey.length > 8 &&
    !fb.apiKey.includes("REPLACE_ME") &&
    fb.projectId &&
    !String(fb.projectId).includes("REPLACE_ME")
  );
}

/** 与 Cloud Function normalizeClientRoundId 一致，避免复制链接带进零宽字符导致 round1 识别失败 */
function normalizeVoteRoundId(raw) {
  return String(raw ?? "")
    .replace(/\u200b/g, "")
    .replace(/\ufeff/g, "")
    .trim()
    .toLowerCase();
}

/** 链接 ?roundId=xxx 优先；统一小写 + 去零宽，避免初赛未被识别而走 sheetRow 分支报「选手行号无效」 */
function resolveVoteRoundId() {
  const q = new URLSearchParams(window.location.search).get("roundId");
  const fromUrl = q != null ? String(q).trim() : "";
  const fromCfg = String(cfg?.voteRoundId ?? "").trim();
  const raw = fromUrl || fromCfg;
  return raw ? normalizeVoteRoundId(raw) : "";
}

/**
 * 短信 / 私发链接可带 ?voteCode=XXX（或 ?code=），打开后自动填入投票码，减少手输。
 * 勿把含个人投票码的链接投屏或发群公告（等同把票交给别人）。
 */
function resolvePrefillVoteCode() {
  if (cfg?.allowVoteCodeFromUrl === false) return "";
  try {
    const q = new URLSearchParams(window.location.search);
    const raw = q.get("voteCode") ?? q.get("code");
    if (raw == null) return "";
    const t = String(raw).trim().replace(/\s+/g, "").toUpperCase();
    if (t.length < 1 || t.length > 96) return "";
    return t;
  } catch {
    return "";
  }
}

/** round1_pk_n → Round1Audience 数据行号 n+1（与 Functions 一致） */
function pairRowFromRound1PkRoundIdClient(roundId) {
  const m = /^round1_pk_([1-5])$/.exec(normalizeVoteRoundId(roundId));
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!Number.isInteger(n) || n < 1 || n > 5) return null;
  return n + 1;
}

function storageKeyFor(roundId) {
  const rid = String(roundId || "").trim() || "unset";
  return `vp_voted_${cfg?.eventId ?? "default"}_${rid}`;
}

/** 初赛 1v1：round1_pk_1～5 对应表 Round1Audience 第 2～6 行 */
function isRound1PkRound(roundId) {
  return /^round1_pk_[1-5]$/.test(normalizeVoteRoundId(roundId));
}

/** 决赛第 N 唱：final_perf_1～6，与 Cloud Functions isFinalPerfRoundId 一致 */
function isFinalPerfRoundIdClient(roundId) {
  return /^final_perf_[1-6]$/.test(normalizeVoteRoundId(roundId));
}

/** final_perf_n → Round3 表数据行号 n+1（第 1 唱 → 第 2 行） */
function finalPerfSheetRowFromRoundId(roundId) {
  const m = /^final_perf_([1-6])$/.exec(normalizeVoteRoundId(roundId));
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isInteger(n) && n >= 1 && n <= 6 ? n + 1 : null;
}

/** 本机 Vite 开发：避免线上 Firestore voteUi（复活 6 人、旧 sheetRow）覆盖本地 vote-config，导致初赛 UI/行号错乱 */
function isLocalVoteHost() {
  try {
    const h = String(window.location.hostname || "").toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
  } catch {
    return false;
  }
}

/**
 * 是否合并 Firestore events/.../voteUi（voteUi.rounds[roundId] 或旧版全局 candidates / 标题）。
 * - 默认：localhost / 127.0.0.1 不合并，仅用 vote-config.js（含 round1PkByRoundId）。
 * - 本地也要测线上已发布 voteUi：vote-config 设 mergeFirestoreVoteUi: true。
 * - 任意环境强制只用本地配置：ignoreFirestoreVoteUi: true。
 */
function shouldMergeFirestoreVoteUi() {
  if (cfg?.ignoreFirestoreVoteUi === true) return false;
  if (cfg?.mergeFirestoreVoteUi === true) return true;
  if (isLocalVoteHost()) return false;
  return true;
}

/** 将 FirebaseError / Functions 错误转成用户可读文案 */
function humanizeVoteError(err) {
  const code = err?.code || "";
  const msg = err?.message || String(err);
  if (code === "functions/invalid-argument") {
    return msg.replace(/^.*?:\s*/, "") || "投票码无效或已使用。";
  }
  if (code === "functions/failed-precondition") {
    return msg.replace(/^.*?:\s*/, "") || "暂时无法计入票数，请稍后再试或联系工作人员。";
  }
  if (code === "functions/unavailable" || code === "functions/deadline-exceeded") {
    return "网络繁忙，请稍后再试。";
  }
  if (code === "functions/internal") {
    return "服务异常，请稍后再试。";
  }
  return msg || "提交失败，请检查网络后重试。";
}

function normalizeCandidate(c) {
  return {
    id: String(c.id || "").trim(),
    sheetRow: Number(c.sheetRow),
    label: String(c.label || "").trim(),
    img: String(c.img != null ? c.img : "").trim(),
  };
}

async function init() {
  if (!cfg || !gridEl || !submitBtn) return;

  if (!validFirebase(cfg.firebase)) {
    showBanner("请先在 vote-config.js 中填写 Firebase 配置（apiKey、projectId 等）。");
    submitBtn.disabled = true;
    return;
  }

  const resolvedRoundId = resolveVoteRoundId();
  if (!resolvedRoundId) {
    showBanner(
      "请使用带 ?roundId= 的链接，或在 vote-config.js 中设置 voteRoundId。详见 console/docs/README-vote-firebase-static.md。"
    );
    submitBtn.disabled = true;
    return;
  }
  if (!ALLOWED_ROUND_IDS.has(resolvedRoundId)) {
    showBanner(`链接或配置里的投票轮次无效：「${resolvedRoundId}」。请对照文档中的 12 个合法 roundId。`);
    submitBtn.disabled = true;
    return;
  }

  const app = initializeApp(cfg.firebase);
  const db = getFirestore(app);

  let displayCfg = {
    ...cfg,
    candidates: Array.isArray(cfg.candidates) ? cfg.candidates.map(normalizeCandidate) : [],
  };

  const pkMap = cfg?.round1PkByRoundId;
  const titleEl = document.getElementById("vp-page-title");
  const subEl = document.getElementById("vp-page-subtitle");

  /** 仅当 Firestore `voteUi.rounds[当前轮].candidates` 非空时为 true；初赛是否改用 round1PkByRoundId 依此判断 */
  let voteUiRoundCandidatesPublished = false;

  if (shouldMergeFirestoreVoteUi()) {
    try {
      const snap = await getDoc(doc(db, "events", displayCfg.eventId, "site", "voteUi"));
      if (snap.exists()) {
        const d = snap.data();
        const hasRoundsSchema =
          d.rounds && typeof d.rounds === "object" && !Array.isArray(d.rounds);
        const roundBlock = hasRoundsSchema ? d.rounds[resolvedRoundId] : null;

        if (
          roundBlock &&
          Array.isArray(roundBlock.candidates) &&
          roundBlock.candidates.length > 0
        ) {
          displayCfg = {
            ...displayCfg,
            candidates: roundBlock.candidates.map(normalizeCandidate),
          };
          voteUiRoundCandidatesPublished = true;
        } else if (!hasRoundsSchema && Array.isArray(d.candidates) && d.candidates.length) {
          displayCfg = {
            ...displayCfg,
            candidates: d.candidates.map(normalizeCandidate),
          };
        } else if (
          hasRoundsSchema &&
          !isRound1PkRound(resolvedRoundId) &&
          Array.isArray(d.candidates) &&
          d.candidates.length
        ) {
          /** 新 schema 下某环节未填选手时，用顶层 candidates（发布时由复活赛等环节镜像） */
          displayCfg = {
            ...displayCfg,
            candidates: d.candidates.map(normalizeCandidate),
          };
        }

        const tRound =
          roundBlock && typeof roundBlock.pageTitle === "string"
            ? roundBlock.pageTitle.trim()
            : "";
        const tGlobal =
          typeof d.pageTitle === "string" ? d.pageTitle.trim() : "";
        const titleText = tRound || tGlobal;
        if (titleText && titleEl) {
          titleEl.textContent = titleText;
        }

        const sRound =
          roundBlock && typeof roundBlock.subtitle === "string"
            ? roundBlock.subtitle.trim()
            : "";
        const sGlobal = typeof d.subtitle === "string" ? d.subtitle.trim() : "";
        const subText = sRound || (!hasRoundsSchema ? sGlobal : "");
        if (subText && subEl) {
          subEl.style.whiteSpace = "pre-line";
          subEl.innerHTML = "";
          subEl.textContent = subText;
        }
      }
    } catch (e) {
      console.warn("voteUi getDoc", e);
    }
  } else if (isLocalVoteHost()) {
    console.info(
      "[vote] 本机开发：已跳过 Firestore voteUi，仅使用 vote-config.js。若需拉线上已发布内容，请设 mergeFirestoreVoteUi: true。"
    );
  }

  if (
    isRound1PkRound(resolvedRoundId) &&
    pkMap &&
    typeof pkMap === "object" &&
    !voteUiRoundCandidatesPublished
  ) {
    const pair = pkMap[resolvedRoundId];
    if (Array.isArray(pair) && pair.length === 2) {
      displayCfg = { ...displayCfg, candidates: pair.map(normalizeCandidate) };
    }
  }

  if (!displayCfg.candidates.length) {
    showBanner("未配置选手列表（vote-config 或 Firestore voteUi）。");
    submitBtn.disabled = true;
    return;
  }

  const round1Pk = isRound1PkRound(resolvedRoundId);
  if (round1Pk && displayCfg.candidates.length !== 2) {
    showBanner("初赛 PK 须恰好 2 人：第 1 位为左侧、第 2 位为右侧（vote-config 或后台发布）。");
    submitBtn.disabled = true;
    return;
  }

  const isFinalPerf = isFinalPerfRoundIdClient(resolvedRoundId);
  let finalPerfSolo = null;
  if (isFinalPerf) {
    const wantRow = finalPerfSheetRowFromRoundId(resolvedRoundId);
    finalPerfSolo =
      wantRow != null
        ? displayCfg.candidates.find((c) => Number(c.sheetRow) === wantRow)
        : null;
    if (!finalPerfSolo && displayCfg.candidates.length) {
      finalPerfSolo = displayCfg.candidates[0];
      console.warn("[vote] final_perf: no candidate for sheetRow", wantRow, "— using first candidate");
    }
    if (!finalPerfSolo) {
      showBanner("决赛环节未配置选手（vote-config 或 Firestore voteUi）。");
      submitBtn.disabled = true;
      return;
    }
  }

  /** 初赛默认副标题：仅当当前未从 voteUi（按环节或旧版全局）写入副标题时 */
  if (round1Pk && subEl) {
    const hasSub = Boolean(subEl.textContent && subEl.textContent.trim());
    if (!hasSub) {
      subEl.style.whiteSpace = "pre-line";
      subEl.innerHTML = "";
      subEl.textContent =
        "Voice of NYC · 初赛 PK（1v1）\n左右点选支持的一位，再按下方确认投票（每人限一次）";
    }
  }

  if (isFinalPerf && subEl) {
    const hasSub = Boolean(subEl.textContent && subEl.textContent.trim());
    if (!hasSub) {
      subEl.style.whiteSpace = "pre-line";
      subEl.innerHTML = "";
      subEl.textContent =
        "决赛打分 · 拖动右侧竖条选择 1～10 分，再确认提交（每人限一次）";
    }
  }

  const brand = document.querySelector(".vp-brand");
  if (brand) {
    const meta = document.createElement("p");
    meta.className = "vp-round-meta";
    meta.textContent = `当前环节：${resolvedRoundId}`;
    brand.appendChild(meta);
  }

  const shouldLockBrowser = () => {
    if (!displayCfg.oneVotePerBrowser) return false;
    if (displayCfg.requireVoteCode === false) return displayCfg.lockBrowserAfterSubmit !== false;
    return displayCfg.lockBrowserAfterSubmit === true;
  };

  if (shouldLockBrowser() && localStorage.getItem(storageKeyFor(resolvedRoundId)) === "1") {
    document.querySelector(".vp-dock")?.remove();
    showDone(displayCfg);
    return;
  }

  const region = displayCfg.functionsRegion || "us-east4";
  const functions = getFunctions(app, region);
  if (displayCfg.functionsEmulatorHost) {
    const [host, port] = displayCfg.functionsEmulatorHost.split(":");
    connectFunctionsEmulator(functions, host || "localhost", Number(port) || 5001);
  }
  const submitVoteFn = httpsCallable(functions, "submitVote");

  if (displayCfg.requireVoteCode !== false) {
    if (codeWrap) codeWrap.hidden = false;
  } else {
    codeWrap?.remove();
  }

  const frag = document.createDocumentFragment();
  let selected = null;

  function syncSubmitEnabled() {
    const needCode = displayCfg.requireVoteCode !== false;
    const codeOk = !needCode || (codeInput && codeInput.value.trim().length > 0);
    let selOk = Boolean(selected);
    if (isFinalPerf && selected) {
      const s = selected.audienceScore;
      selOk = Number.isInteger(s) && s >= 1 && s <= 10;
    }
    submitBtn.disabled = !selOk || !codeOk;
  }

  codeInput?.addEventListener("input", syncSubmitEnabled, { passive: true });

  const prefillCode = resolvePrefillVoteCode();
  if (prefillCode && codeInput) {
    codeInput.value = prefillCode;
  }

  const testCodeRaw = String(cfg?.testVoteCode ?? "").trim();
  const showTestVoteUi =
    testCodeRaw &&
    codeWrap &&
    displayCfg.requireVoteCode !== false &&
    isStaffPortalAuthedInBrowser();
  if (showTestVoteUi) {
    try {
      const q = new URLSearchParams(window.location.search);
      if ((q.get("testVote") === "1" || q.get("test") === "1") && codeInput) {
        codeInput.value = testCodeRaw.toUpperCase();
        syncSubmitEnabled();
      }
    } catch {
      /* ignore */
    }
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "vp-test-code-btn";
    btn.textContent = "填入测试码";
    btn.setAttribute("aria-label", "填入测试投票码（须与云端 VOTE_TEST_CODE 一致）");
    btn.addEventListener("click", () => {
      if (codeInput) {
        codeInput.value = testCodeRaw.toUpperCase();
        codeInput.dispatchEvent(new Event("input", { bubbles: true }));
        syncSubmitEnabled();
      }
    });
    codeWrap.appendChild(btn);
    const note = document.createElement("p");
    note.className = "vp-test-code-note";
    note.textContent =
      "测试码不消耗真实票；须与 Firebase VOTE_TEST_CODE 一致。本按钮仅工作人员在控台登录同一浏览器后可见。";
    codeWrap.appendChild(note);
  }

  if (round1Pk) {
    document.getElementById("vp-root")?.classList.add("vp-root--pk");
    gridEl.classList.add("vp-grid--pk1v1");
    const pairWrap = document.createElement("div");
    pairWrap.className = "vp-pk-pair";
    const [leftC, rightC] = displayCfg.candidates;

    function makePkCard(c, side) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "vp-card vp-card--pk";
      btn.dataset.id = c.id;
      btn.dataset.pairSide = side;
      const img = document.createElement("img");
      img.className = "vp-card__img vp-card__img--pk";
      img.src = c.img || "";
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      img.onerror = () => {
        img.replaceWith(Object.assign(document.createElement("div"), { className: "vp-card__img vp-card__img--pk" }));
      };
      const mid = document.createElement("div");
      const name = document.createElement("span");
      name.className = "vp-card__name";
      name.textContent = c.label || (side === "left" ? "左侧" : "右侧");
      const hint = document.createElement("span");
      hint.className = "vp-card__hint";
      hint.textContent = side === "left" ? "点选左侧支持 TA" : "点选右侧支持 TA";
      mid.append(name, hint);
      btn.append(img, mid);
      btn.addEventListener(
        "click",
        () => {
          selected = { ...c, pairSide: side };
          pairWrap.querySelectorAll(".vp-card--pk").forEach((el) => el.classList.remove("vp-card--selected"));
          btn.classList.add("vp-card--selected");
          syncSubmitEnabled();
        },
        { passive: true }
      );
      return btn;
    }

    const vs = document.createElement("div");
    vs.className = "vp-pk-vs";
    vs.setAttribute("aria-hidden", "true");
    vs.textContent = "VS";
    pairWrap.append(makePkCard(leftC, "left"), vs, makePkCard(rightC, "right"));
    frag.appendChild(pairWrap);
  } else if (isFinalPerf && finalPerfSolo) {
    document.getElementById("vp-root")?.classList.add("vp-root--final");
    gridEl.classList.add("vp-grid--final");

    const row = document.createElement("div");
    row.className = "vp-final-row";

    const photo = document.createElement("div");
    photo.className = "vp-final-photo";
    const img = document.createElement("img");
    img.className = "vp-final-photo__img";
    img.src = finalPerfSolo.img || "";
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    img.onerror = () => {
      const ph = document.createElement("div");
      ph.className = "vp-final-photo__img vp-final-photo__img--ph";
      img.replaceWith(ph);
    };
    const nameEl = document.createElement("div");
    nameEl.className = "vp-final-photo__name";
    nameEl.textContent = finalPerfSolo.label || "选手";
    photo.append(img, nameEl);

    const scoreAside = document.createElement("aside");
    scoreAside.className = "vp-final-score";
    scoreAside.setAttribute("aria-label", "打分");
    const valOut = document.createElement("output");
    valOut.className = "vp-final-score__value";
    valOut.setAttribute("for", "vp-final-range");
    valOut.textContent = "—";
    const range = document.createElement("input");
    range.type = "range";
    range.id = "vp-final-range";
    range.className = "vp-final-range";
    range.min = "1";
    range.max = "10";
    range.step = "1";
    range.value = "5";
    range.addEventListener(
      "input",
      () => {
        const v = Number(range.value);
        valOut.textContent = String(v);
        selected = { ...finalPerfSolo, audienceScore: v };
        syncSubmitEnabled();
      },
      { passive: true }
    );
    const rangeWrap = document.createElement("div");
    rangeWrap.className = "vp-final-range-wrap";
    rangeWrap.appendChild(range);
    const hint = document.createElement("p");
    hint.className = "vp-final-score__hint";
    hint.textContent = "1–10 分";
    scoreAside.append(valOut, rangeWrap, hint);

    row.append(photo, scoreAside);
    frag.appendChild(row);
    selected = null;
  } else {
    for (const c of displayCfg.candidates) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "vp-card";
      btn.dataset.id = c.id;
      btn.dataset.row = String(c.sheetRow);
      const img = document.createElement("img");
      img.className = "vp-card__img";
      img.src = c.img || "";
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      img.onerror = () => {
        img.replaceWith(Object.assign(document.createElement("div"), { className: "vp-card__img" }));
      };
      const mid = document.createElement("div");
      const name = document.createElement("span");
      name.className = "vp-card__name";
      name.textContent = c.label;
      const hint = document.createElement("span");
      hint.className = "vp-card__hint";
      hint.textContent = "点选后按下方确认投票";
      mid.append(name, hint);
      btn.append(img, mid);
      btn.addEventListener(
        "click",
        () => {
          selected = c;
          document.querySelectorAll(".vp-card").forEach((el) => el.classList.remove("vp-card--selected"));
          btn.classList.add("vp-card--selected");
          syncSubmitEnabled();
        },
        { passive: true }
      );
      frag.appendChild(btn);
    }
  }
  gridEl.appendChild(frag);

  syncSubmitEnabled();

  submitBtn.addEventListener(
    "click",
    async () => {
      if (!selected) return;
      const needCode = displayCfg.requireVoteCode !== false;
      const voteCode = needCode && codeInput ? codeInput.value.trim().toUpperCase() : "";
      if (needCode && !voteCode) {
        showBanner("请先填写投票码。");
        return;
      }
      submitBtn.disabled = true;
      showBanner("提交中…");
      try {
        const payload = {
          eventId: displayCfg.eventId,
          choiceId: selected.id,
          label: selected.label,
          voteCode,
          roundId: String(resolvedRoundId),
        };
        if (round1Pk) {
          const ps = selected.pairSide;
          if (ps !== "left" && ps !== "right") {
            showBanner("请选择左侧或右侧选手后再提交。");
            submitBtn.disabled = false;
            return;
          }
          payload.pairSide = ps;
          const pr = pairRowFromRound1PkRoundIdClient(resolvedRoundId);
          if (pr != null) payload.pairRow = pr;
        } else {
          const sr = Number(selected.sheetRow);
          if (!Number.isInteger(sr) || sr < 2) {
            showBanner("选手行号配置无效，请检查 vote-config / 后台发布。");
            submitBtn.disabled = false;
            return;
          }
          payload.sheetRow = sr;
          if (isFinalPerfRoundIdClient(resolvedRoundId)) {
            const sc = selected.audienceScore;
            if (!Number.isInteger(sc) || sc < 1 || sc > 10) {
              showBanner("请先在右侧拖动选择 1～10 分。");
              submitBtn.disabled = false;
              return;
            }
            payload.audienceScore = sc;
          }
        }
        const { data } = await submitVoteFn(payload);
        if (shouldLockBrowser()) localStorage.setItem(storageKeyFor(resolvedRoundId), "1");
        if (data?.sheetUncertain) {
          showBanner("已计入。若大屏未更新请稍候刷新或联系工作人员。", true);
        } else {
          showBanner("投票成功，感谢参与！", true);
        }
        const doneLabel =
          isFinalPerfRoundIdClient(resolvedRoundId) && typeof selected.audienceScore === "number"
            ? `${selected.label}（${selected.audienceScore} 分）`
            : selected.label;
        showDone(displayCfg, doneLabel, Boolean(data?.sheetUncertain));
      } catch (e) {
        console.error(e);
        showBanner(humanizeVoteError(e));
        submitBtn.disabled = false;
      }
    },
    { passive: true }
  );
}

function showDone(config, name, sheetUncertain) {
  if (!rootEl) return;
  document.querySelector(".vp-dock")?.remove();
  const extra = sheetUncertain ? " 若大屏暂未变化可稍候。" : "";
  rootEl.innerHTML = `
    <div class="vp-success">
      <h2>收到</h2>
      <p>${name ? `你支持了 ${name}。` : "你已投过票。"}大屏将按表格更新票数。${extra}</p>
    </div>
  `;
}

init().catch((e) => {
  console.error(e);
  showBanner("页面初始化失败，请刷新重试。");
});
