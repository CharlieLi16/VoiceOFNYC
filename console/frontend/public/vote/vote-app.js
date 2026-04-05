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

/** 链接 ?roundId=xxx 优先，便于 PPT 放不同 URL 切环节；否则用 vote-config.js */
function resolveVoteRoundId() {
  const q = new URLSearchParams(window.location.search).get("roundId");
  const fromUrl = q != null ? String(q).trim() : "";
  const fromCfg = String(cfg?.voteRoundId ?? "").trim();
  if (fromUrl) return fromUrl;
  return fromCfg;
}

function storageKeyFor(roundId) {
  const rid = String(roundId || "").trim() || "unset";
  return `vp_voted_${cfg?.eventId ?? "default"}_${rid}`;
}

/** 初赛 1v1：round1_pk_1～5 对应表 Round1Audience 第 2～6 行 */
function isRound1PkRound(roundId) {
  return /^round1_pk_[1-5]$/.test(String(roundId || "").trim());
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

  try {
    const snap = await getDoc(doc(db, "events", displayCfg.eventId, "site", "voteUi"));
    if (snap.exists()) {
      const d = snap.data();
      if (Array.isArray(d.candidates) && d.candidates.length) {
        displayCfg = {
          ...displayCfg,
          candidates: d.candidates.map(normalizeCandidate),
        };
      }
      const titleEl = document.getElementById("vp-page-title");
      const subEl = document.getElementById("vp-page-subtitle");
      if (typeof d.pageTitle === "string" && d.pageTitle.trim() && titleEl) {
        titleEl.textContent = d.pageTitle.trim();
      }
      if (typeof d.subtitle === "string" && d.subtitle.trim() && subEl) {
        subEl.style.whiteSpace = "pre-line";
        subEl.innerHTML = "";
        subEl.textContent = d.subtitle.trim();
      }
    }
  } catch (e) {
    console.warn("voteUi getDoc", e);
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
    submitBtn.disabled = !selected || !codeOk;
  }

  codeInput?.addEventListener("input", syncSubmitEnabled, { passive: true });

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
          roundId: resolvedRoundId,
        };
        if (selected.pairSide === "left" || selected.pairSide === "right") {
          payload.pairSide = selected.pairSide;
        } else {
          payload.sheetRow = selected.sheetRow;
        }
        const { data } = await submitVoteFn(payload);
        if (shouldLockBrowser()) localStorage.setItem(storageKeyFor(resolvedRoundId), "1");
        if (data?.sheetUncertain) {
          showBanner("已计入。若大屏未更新请稍候刷新或联系工作人员。", true);
        } else {
          showBanner("投票成功，感谢参与！", true);
        }
        showDone(displayCfg, selected.label, Boolean(data?.sheetUncertain));
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
