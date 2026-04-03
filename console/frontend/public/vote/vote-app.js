/**
 * 现场投票 → Callable submitVote（校验投票码、写表成功后再提示成功）
 * 大屏仍读 Google 表；审计记录在 Firestore votes（source=vote-callable）
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getFunctions, httpsCallable, connectFunctionsEmulator } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";

const cfg = window.__VOTE_PAGE_CONFIG;
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

function storageKey() {
  return `vp_voted_${cfg?.eventId ?? "default"}`;
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

function init() {
  if (!cfg || !gridEl || !submitBtn) return;

  if (!validFirebase(cfg.firebase)) {
    showBanner("请先在 vote-config.js 中填写 Firebase 配置（apiKey、projectId 等）。");
    submitBtn.disabled = true;
    return;
  }

  const shouldLockBrowser = () => {
    if (!cfg.oneVotePerBrowser) return false;
    if (cfg.requireVoteCode === false) return cfg.lockBrowserAfterSubmit !== false;
    return cfg.lockBrowserAfterSubmit === true;
  };

  if (shouldLockBrowser() && localStorage.getItem(storageKey()) === "1") {
    document.querySelector(".vp-dock")?.remove();
    showDone(cfg);
    return;
  }

  const app = initializeApp(cfg.firebase);
  const region = cfg.functionsRegion || "us-east4";
  const functions = getFunctions(app, region);
  if (cfg.functionsEmulatorHost) {
    const [host, port] = cfg.functionsEmulatorHost.split(":");
    connectFunctionsEmulator(functions, host || "localhost", Number(port) || 5001);
  }
  const submitVoteFn = httpsCallable(functions, "submitVote");

  if (cfg.requireVoteCode !== false) {
    if (codeWrap) codeWrap.hidden = false;
  } else {
    codeWrap?.remove();
  }

  const frag = document.createDocumentFragment();
  let selected = null;

  function syncSubmitEnabled() {
    const needCode = cfg.requireVoteCode !== false;
    const codeOk = !needCode || (codeInput && codeInput.value.trim().length > 0);
    submitBtn.disabled = !selected || !codeOk;
  }

  codeInput?.addEventListener("input", syncSubmitEnabled, { passive: true });

  for (const c of cfg.candidates) {
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
  gridEl.appendChild(frag);

  syncSubmitEnabled();

  submitBtn.addEventListener(
    "click",
    async () => {
      if (!selected) return;
      const needCode = cfg.requireVoteCode !== false;
      const voteCode = needCode && codeInput ? codeInput.value.trim().toUpperCase() : "";
      if (needCode && !voteCode) {
        showBanner("请先填写投票码。");
        return;
      }
      submitBtn.disabled = true;
      showBanner("提交中…");
      try {
        const { data } = await submitVoteFn({
          eventId: cfg.eventId,
          choiceId: selected.id,
          sheetRow: selected.sheetRow,
          label: selected.label,
          voteCode,
        });
        if (shouldLockBrowser()) localStorage.setItem(storageKey(), "1");
        if (data?.sheetUncertain) {
          showBanner("已计入。若大屏未更新请稍候刷新或联系工作人员。", true);
        } else {
          showBanner("投票成功，感谢参与！", true);
        }
        showDone(cfg, selected.label, Boolean(data?.sheetUncertain));
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

init();
