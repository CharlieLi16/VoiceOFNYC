/**
 * 工作人员投票调度页：轮次链接 + 远程发布 voteUi（publishVoteUi）
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

let candidateState = [];

function defaultCandidate() {
  const used = new Set(candidateState.map((c) => c.id));
  const id = IDS.find((x) => !used) || "s1";
  const usedRows = new Set(candidateState.map((c) => c.sheetRow));
  const sheetRow = ROWS.find((n) => !usedRows) || 2;
  return { id, sheetRow, label: "", img: "/img/contestants/1.jpg" };
}

function renderCandidateRows() {
  const host = el("vh-candidates");
  if (!host) return;
  host.replaceChildren();
  candidateState.forEach((c, idx) => {
    const row = document.createElement("div");
    row.className = "vh-cand-row";
    row.innerHTML = `
      <label>ID<br /><select class="vh-cand-id" data-i="${idx}">${IDS.map(
        (id) => `<option value="${id}" ${id === c.id ? "selected" : ""}>${id}</option>`
      ).join("")}</select></label>
      <label>表行<br /><select class="vh-cand-rown" data-i="${idx}">${ROWS.map(
        (n) => `<option value="${n}" ${n === c.sheetRow ? "selected" : ""}>${n}</option>`
      ).join("")}</select></label>
      <label>显示名<br /><input class="vh-cand-label" data-i="${idx}" value="${escapeAttr(c.label)}" /></label>
      <label>图片路径<br /><input class="vh-cand-img" data-i="${idx}" value="${escapeAttr(c.img)}" /></label>
      <button type="button" class="vh-btn vh-btn--danger vh-cand-remove" data-i="${idx}">删</button>
    `;
    host.appendChild(row);
  });
  host.querySelectorAll(".vh-cand-id").forEach((s) => {
    s.addEventListener("change", () => {
      const i = Number(s.dataset.i);
      candidateState[i].id = s.value;
    });
  });
  host.querySelectorAll(".vh-cand-rown").forEach((s) => {
    s.addEventListener("change", () => {
      const i = Number(s.dataset.i);
      candidateState[i].sheetRow = Number(s.value);
    });
  });
  host.querySelectorAll(".vh-cand-label").forEach((inp) => {
    inp.addEventListener("input", () => {
      const i = Number(inp.dataset.i);
      candidateState[i].label = inp.value;
    });
  });
  host.querySelectorAll(".vh-cand-img").forEach((inp) => {
    inp.addEventListener("input", () => {
      const i = Number(inp.dataset.i);
      candidateState[i].img = inp.value;
    });
  });
  host.querySelectorAll(".vh-cand-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      const i = Number(btn.dataset.i);
      candidateState.splice(i, 1);
      renderCandidateRows();
    });
  });
}

function escapeAttr(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function readFormCandidates() {
  return candidateState.map((c) => ({
    id: String(c.id).trim(),
    sheetRow: Number(c.sheetRow),
    label: String(c.label || "").trim(),
    img: String(c.img || "").trim(),
  }));
}

async function main() {
  if (!cfg || !cfg.firebase || !cfg.eventId) {
    showMsg("缺少 vote-config.js（eventId / firebase）", false);
    return;
  }

  renderRoundsTable();

  const base = Array.isArray(cfg.candidates) ? cfg.candidates.map((c) => ({ ...c })) : [];
  candidateState = base.length ? base : [defaultCandidate()];
  el("vh-page-title").value = "";
  el("vh-subtitle").value = "";

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
      const d = snap.data();
      if (Array.isArray(d.candidates) && d.candidates.length) {
        candidateState = d.candidates.map((c) => ({
          id: String(c.id || "s1"),
          sheetRow: Number(c.sheetRow) || 2,
          label: String(c.label || ""),
          img: String(c.img || ""),
        }));
      }
      if (typeof d.pageTitle === "string" && d.pageTitle.trim()) {
        el("vh-page-title").value = d.pageTitle.trim();
      }
      if (typeof d.subtitle === "string" && d.subtitle.trim()) {
        el("vh-subtitle").value = d.subtitle.trim();
      }
    }
  } catch (e) {
    console.warn("voteUi getDoc", e);
    showMsg("无法读取 Firestore voteUi（可仅编辑后发布）", false);
  }

  renderCandidateRows();

  el("vh-add-row")?.addEventListener("click", () => {
    if (candidateState.length >= 6) {
      showMsg("最多 6 名选手", false);
      return;
    }
    candidateState.push(defaultCandidate());
    renderCandidateRows();
  });

  el("vh-publish")?.addEventListener("click", async () => {
    const secret = el("vh-secret").value.trim();
    if (!secret) {
      showMsg("请填写发布密钥 STAFF_PUBLISH_SECRET", false);
      return;
    }
    const candidates = readFormCandidates();
    const pageTitle = el("vh-page-title").value.trim();
    const subtitle = el("vh-subtitle").value.trim();
    showMsg("发布中…", undefined);
    try {
      await publishVoteUi({
        eventId: cfg.eventId,
        secret,
        candidates,
        pageTitle,
        subtitle,
      });
      showMsg("已发布。请让观众刷新 vote 页。", true);
    } catch (e) {
      console.error(e);
      const msg = e?.message || String(e);
      showMsg(msg.replace(/^.*?:\s*/, "") || "发布失败", false);
    }
  });
}

main();
