/**
 * 工作人员投票调度页：轮次链接 + 按环节编辑 voteUi（publishVoteUi，Firestore `rounds`）
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getFunctions, httpsCallable, connectFunctionsEmulator } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";

const ROUND_ROWS = [
  { id: "round1_pk_1", label: "第一轮 PK · 第 1 组" },
  { id: "round1_pk_2", label: "第一轮 PK · 第 2 组" },
  { id: "round1_pk_3", label: "第一轮 PK · 第 3 组" },
  { id: "round1_pk_4", label: "第一轮 PK · 第 4 组" },
  { id: "round1_pk_5", label: "第一轮 PK · 第 5 组" },
  { id: "round2_revival", label: "复活投票" },
  { id: "final_perf_1", label: "决赛 · 第 1 唱" },
  { id: "final_perf_2", label: "决赛 · 第 2 唱" },
  { id: "final_perf_3", label: "决赛 · 第 3 唱" },
  { id: "final_perf_4", label: "决赛 · 第 4 唱" },
  { id: "final_perf_5", label: "决赛 · 第 5 唱" },
  { id: "final_perf_6", label: "决赛 · 第 6 唱" },
];

const IDS = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9", "s10"];
const ROWS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

const cfg = window.__VOTE_PAGE_CONFIG;

/** @type {Record<string, { pageTitle: string, subtitle: string, candidates: { id: string, sheetRow: number, label: string, img: string }[] }>} */
let roundState = {};

function el(id) {
  return document.getElementById(id);
}

function showMsg(text, ok) {
  const m = el("vh-msg");
  if (!m) return;
  m.textContent = text || "";
  if (ok === true) m.className = "vh-ok";
  else if (ok === false) m.className = "vh-err";
  else m.className = "";
}

function votePageUrl(roundId) {
  const u = new URL("vote.html", window.location.href);
  u.searchParams.set("roundId", roundId);
  return u.href;
}

function renderRoundsTable() {
  const tbody = el("vh-rounds-body");
  if (!tbody) return;
  tbody.replaceChildren();
  for (const r of ROUND_ROWS) {
    const tr = document.createElement("tr");
    const url = votePageUrl(r.id);
    tr.innerHTML = `
      <td>${r.label}</td>
      <td><code class="vh-link">${r.id}</code></td>
      <td class="vh-link">${url}</td>
      <td><div class="vh-actions">
        <button type="button" class="vh-btn" data-copy="${encodeURIComponent(url)}">复制链接</button>
        <button type="button" class="vh-btn" data-open="${encodeURIComponent(url)}">打开</button>
      </div></td>
    `;
    tbody.appendChild(tr);
  }
  tbody.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const u = decodeURIComponent(btn.getAttribute("data-copy"));
      try {
        await navigator.clipboard.writeText(u);
        showMsg("已复制到剪贴板", true);
      } catch {
        showMsg("复制失败，请手动复制链接", false);
      }
    });
  });
  tbody.querySelectorAll("[data-open]").forEach((btn) => {
    btn.addEventListener("click", () => {
      window.open(decodeURIComponent(btn.getAttribute("data-open")), "_blank", "noopener,noreferrer");
    });
  });
}

function escapeAttr(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function normalizeCfgCandidate(c) {
  return {
    id: String(c.id || "s1").trim(),
    sheetRow: Number(c.sheetRow) || 2,
    label: String(c.label || "").trim(),
    img: String(c.img != null ? c.img : "").trim(),
  };
}

function defaultCandidate(existing) {
  const used = new Set((existing || []).map((c) => c.id));
  const id = IDS.find((x) => !used) || "s1";
  const usedRows = new Set((existing || []).map((c) => c.sheetRow));
  const sheetRow = ROWS.find((n) => !usedRows) || 2;
  return { id, sheetRow, label: "", img: "/img/contestants/1.jpg" };
}

function maxCandidatesForRound(roundId) {
  return /^round1_pk_[1-5]$/.test(roundId) ? 2 : 6;
}

function resetSingleRoundFromConfig(roundId) {
  const isR1 = /^round1_pk_[1-5]$/.test(roundId);
  let candidates = [];
  if (isR1) {
    const pair = cfg?.round1PkByRoundId?.[roundId];
    if (Array.isArray(pair) && pair.length === 2) {
      candidates = pair.map(normalizeCfgCandidate);
    } else {
      const left = defaultCandidate([]);
      candidates = [left, defaultCandidate([left])];
    }
  } else {
    const base = Array.isArray(cfg.candidates) ? cfg.candidates.map(normalizeCfgCandidate) : [];
    candidates = base.length ? base : [defaultCandidate([])];
  }
  roundState[roundId] = {
    pageTitle: "",
    subtitle: "",
    candidates,
  };
}

function initRoundStateFromConfig() {
  roundState = {};
  for (const r of ROUND_ROWS) {
    resetSingleRoundFromConfig(r.id);
  }
}

function applyFirestoreVoteUi(d) {
  if (d.rounds && typeof d.rounds === "object" && !Array.isArray(d.rounds)) {
    for (const r of ROUND_ROWS) {
      const b = d.rounds[r.id];
      if (!b || typeof b !== "object") continue;
      if (!roundState[r.id]) resetSingleRoundFromConfig(r.id);
      if (typeof b.pageTitle === "string") roundState[r.id].pageTitle = b.pageTitle;
      if (typeof b.subtitle === "string") roundState[r.id].subtitle = b.subtitle;
      if (Array.isArray(b.candidates) && b.candidates.length) {
        roundState[r.id].candidates = b.candidates.map((c) => normalizeCfgCandidate(c));
      }
    }
    return;
  }
  if (Array.isArray(d.candidates) && d.candidates.length) {
    const mapped = d.candidates.map((c) => normalizeCfgCandidate(c));
    for (const r of ROUND_ROWS) {
      if (/^round1_pk_/.test(r.id)) continue;
      roundState[r.id] = {
        pageTitle: typeof d.pageTitle === "string" ? d.pageTitle : "",
        subtitle: typeof d.subtitle === "string" ? d.subtitle : "",
        candidates: mapped.map((c) => ({ ...c })),
      };
    }
  }
}

function renderCandidateRows(roundId, host) {
  if (!host) return;
  host.replaceChildren();
  const list = roundState[roundId]?.candidates || [];
  const maxC = maxCandidatesForRound(roundId);

  list.forEach((c, idx) => {
    const row = document.createElement("div");
    row.className = "vh-cand-row";
    row.innerHTML = `
      <label>ID<br /><select class="vh-cand-id" data-round="${roundId}" data-i="${idx}">${IDS.map(
        (id) => `<option value="${id}" ${id === c.id ? "selected" : ""}>${id}</option>`
      ).join("")}</select></label>
      <label>表行<br /><select class="vh-cand-rown" data-round="${roundId}" data-i="${idx}">${ROWS.map(
        (n) => `<option value="${n}" ${n === c.sheetRow ? "selected" : ""}>${n}</option>`
      ).join("")}</select></label>
      <label>显示名<br /><input class="vh-cand-label" data-round="${roundId}" data-i="${idx}" value="${escapeAttr(c.label)}" /></label>
      <label>图片路径<br /><input class="vh-cand-img" data-round="${roundId}" data-i="${idx}" value="${escapeAttr(c.img)}" /></label>
      <button type="button" class="vh-btn vh-btn--danger vh-cand-remove" data-round="${roundId}" data-i="${idx}">删</button>
    `;
    host.appendChild(row);
  });

  host.querySelectorAll(".vh-cand-id").forEach((s) => {
    s.addEventListener("change", () => {
      const rid = s.getAttribute("data-round");
      const i = Number(s.dataset.i);
      roundState[rid].candidates[i].id = s.value;
    });
  });
  host.querySelectorAll(".vh-cand-rown").forEach((s) => {
    s.addEventListener("change", () => {
      const rid = s.getAttribute("data-round");
      const i = Number(s.dataset.i);
      roundState[rid].candidates[i].sheetRow = Number(s.value);
    });
  });
  host.querySelectorAll(".vh-cand-label").forEach((inp) => {
    inp.addEventListener("input", () => {
      const rid = inp.getAttribute("data-round");
      const i = Number(inp.dataset.i);
      roundState[rid].candidates[i].label = inp.value;
    });
  });
  host.querySelectorAll(".vh-cand-img").forEach((inp) => {
    inp.addEventListener("input", () => {
      const rid = inp.getAttribute("data-round");
      const i = Number(inp.dataset.i);
      roundState[rid].candidates[i].img = inp.value;
    });
  });
  host.querySelectorAll(".vh-cand-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      const rid = btn.getAttribute("data-round");
      const i = Number(btn.dataset.i);
      roundState[rid].candidates.splice(i, 1);
      renderCandidateRows(rid, host);
    });
  });
}

function renderRoundEditors() {
  const wrap = el("vh-rounds-editor");
  if (!wrap) return;
  wrap.replaceChildren();

  ROUND_ROWS.forEach((r, idx) => {
    const details = document.createElement("details");
    details.className = "vh-round-detail";
    if (idx === 0) details.open = true;

    const summary = document.createElement("summary");
    summary.className = "vh-round-summary";
    summary.innerHTML = `<span class="vh-round-summary-label">${r.label}</span><code class="vh-round-summary-id">${r.id}</code>`;
    details.appendChild(summary);

    const body = document.createElement("div");
    body.className = "vh-round-body";

    const toolbar = document.createElement("div");
    toolbar.className = "vh-round-toolbar";
    const btnCfg = document.createElement("button");
    btnCfg.type = "button";
    btnCfg.className = "vh-btn";
    btnCfg.textContent = "本环节 ← vote-config.js";
    btnCfg.addEventListener("click", () => {
      resetSingleRoundFromConfig(r.id);
      const pt = el(`vh-pt-${idx}`);
      const st = el(`vh-st-${idx}`);
      if (pt) pt.value = "";
      if (st) st.value = "";
      roundState[r.id].pageTitle = "";
      roundState[r.id].subtitle = "";
      renderCandidateRows(r.id, el(`vh-cands-${idx}`));
      showMsg(`已用 vote-config 重置：${r.label}`, true);
    });
    toolbar.appendChild(btnCfg);
    body.appendChild(toolbar);

    const st = roundState[r.id] || { pageTitle: "", subtitle: "", candidates: [] };

    const labT = document.createElement("label");
    labT.className = "vh-label";
    labT.innerHTML =
      '<span>页面标题（可选，本环节）</span><input type="text" class="vh-input" maxlength="120" />';
    const inpT = labT.querySelector("input");
    inpT.id = `vh-pt-${idx}`;
    inpT.value = st.pageTitle || "";
    inpT.addEventListener("input", () => {
      roundState[r.id].pageTitle = inpT.value;
    });
    body.appendChild(labT);

    const labS = document.createElement("label");
    labS.className = "vh-label";
    labS.innerHTML =
      '<span>副标题（可选，支持换行）</span><textarea class="vh-textarea" maxlength="400"></textarea>';
    const inpS = labS.querySelector("textarea");
    inpS.id = `vh-st-${idx}`;
    inpS.value = st.subtitle || "";
    inpS.addEventListener("input", () => {
      roundState[r.id].subtitle = inpS.value;
    });
    body.appendChild(labS);

    const candHost = document.createElement("div");
    candHost.id = `vh-cands-${idx}`;
    candHost.className = "vh-cand-host";
    body.appendChild(candHost);

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "vh-btn";
    addBtn.textContent = "+ 添加选手";
    const maxC = maxCandidatesForRound(r.id);
    addBtn.addEventListener("click", () => {
      if (roundState[r.id].candidates.length >= maxC) {
        showMsg(`${r.label} 最多 ${maxC} 人`, false);
        return;
      }
      roundState[r.id].candidates.push(defaultCandidate(roundState[r.id].candidates));
      renderCandidateRows(r.id, candHost);
    });
    body.appendChild(addBtn);

    details.appendChild(body);
    wrap.appendChild(details);

    renderCandidateRows(r.id, candHost);
  });
}

function buildPublishRoundsPayload() {
  const rounds = {};
  for (const r of ROUND_ROWS) {
    const st = roundState[r.id];
    const idx = ROUND_ROWS.findIndex((x) => x.id === r.id);
    const pt = el(`vh-pt-${idx}`);
    const sb = el(`vh-st-${idx}`);
    rounds[r.id] = {
      pageTitle: pt ? pt.value.trim() : (st.pageTitle || "").trim(),
      subtitle: sb ? sb.value.trim() : (st.subtitle || "").trim(),
      candidates: (st.candidates || []).map((c) => ({
        id: String(c.id).trim(),
        sheetRow: Number(c.sheetRow),
        label: String(c.label || "").trim(),
        img: String(c.img || "").trim(),
      })),
    };
  }
  return rounds;
}

async function main() {
  if (!cfg || !cfg.firebase || !cfg.eventId) {
    showMsg("缺少 vote-config.js（eventId / firebase）", false);
    return;
  }

  renderRoundsTable();

  initRoundStateFromConfig();

  const app = initializeApp(cfg.firebase);
  const db = getFirestore(app);
  const region = cfg.functionsRegion || "us-east4";
  const functions = getFunctions(app, region);
  if (cfg.functionsEmulatorHost) {
    const [h, p] = cfg.functionsEmulatorHost.split(":");
    connectFunctionsEmulator(functions, h || "localhost", Number(p) || 5001);
  }
  const publishVoteUi = httpsCallable(functions, "publishVoteUi");

  try {
    const snap = await getDoc(doc(db, "events", cfg.eventId, "site", "voteUi"));
    if (snap.exists()) {
      applyFirestoreVoteUi(snap.data());
    }
  } catch (e) {
    console.warn("voteUi getDoc", e);
    showMsg("无法读取 Firestore voteUi（可直接编辑后发布）", false);
  }

  renderRoundEditors();

  el("vh-reset-all-config")?.addEventListener("click", () => {
    initRoundStateFromConfig();
    renderRoundEditors();
    showMsg("全部环节已从 vote-config.js 重置", true);
  });

  el("vh-publish")?.addEventListener("click", async () => {
    const secret = el("vh-secret").value.trim();
    if (!secret) {
      showMsg("请填写发布密钥 STAFF_PUBLISH_SECRET", false);
      return;
    }
    const rounds = buildPublishRoundsPayload();
    showMsg("发布中…", undefined);
    try {
      await publishVoteUi({
        eventId: cfg.eventId,
        secret,
        rounds,
      });
      showMsg("已写入 Firestore（按环节 rounds）。请让观众刷新 vote 页。", true);
    } catch (e) {
      console.error(e);
      const msg = e?.message || String(e);
      showMsg(msg.replace(/^.*?:\s*/, "") || "发布失败", false);
    }
  });
}

main();
