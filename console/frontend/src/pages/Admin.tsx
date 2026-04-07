import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  applyRound1NumberedDefaults,
  copyFinalLineupFromRound2,
  fetchFinalLineup,
  fetchFinalRevealConfig,
  fetchRound1StagePairs,
  fetchRound2Lineup,
  importContestants,
  importRound1PairsFromPublicFiles,
  importRound2LineupFromPublicFiles,
  saveFinalLineup,
  saveFinalRevealConfig,
  saveRound1StagePairs,
  saveRound2Lineup,
  type FinalRevealConfig,
} from "@/api/client";
import type { Round1PairMeta, Round2LineupSlot } from "@/api/types";
import { DEFAULT_FINAL_AUDIENCE_RANGE } from "@/config/audienceSheetRanges";
import {
  getStageContestantPreset,
  matchStageContestantNum,
  STAGE_CONTESTANT_PRESETS,
} from "@/config/stageContestantPresets";

const EMPTY_R1_PAIR: Round1PairMeta = {
  leftName: "",
  rightName: "",
  leftImg: "",
  rightImg: "",
};

function defaultR1Pairs(): Round1PairMeta[] {
  return Array.from({ length: 5 }, () => ({ ...EMPTY_R1_PAIR }));
}

const EMPTY_R2_SLOT: Round2LineupSlot = { name: "", img: "" };

function defaultR2Slots(): Round2LineupSlot[] {
  return Array.from({ length: 6 }, () => ({ ...EMPTY_R2_SLOT }));
}

type AdminStageTab = "r1" | "r2" | "final";

export default function Admin() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [importOk, setImportOk] = useState<string | null>(null);
  const [r1Pairs, setR1Pairs] = useState<Round1PairMeta[]>(defaultR1Pairs);
  const [r2Slots, setR2Slots] = useState<Round2LineupSlot[]>(defaultR2Slots);
  const [stageTab, setStageTab] = useState<AdminStageTab>("r1");
  const [finalCfg, setFinalCfg] = useState<FinalRevealConfig>({
    sheetRange: DEFAULT_FINAL_AUDIENCE_RANGE,
    judgeWeight: 0.6,
    audienceWeight: 0.4,
  });
  const [finalSlots, setFinalSlots] = useState<Round2LineupSlot[]>(defaultR2Slots);

  function patchR1Pair(i: number, patch: Partial<Round1PairMeta>) {
    setR1Pairs((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], ...patch };
      return next;
    });
  }

  function patchR2Slot(i: number, patch: Partial<Round2LineupSlot>) {
    setR2Slots((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], ...patch };
      return next;
    });
  }

  function patchFinalSlot(i: number, patch: Partial<Round2LineupSlot>) {
    setFinalSlots((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], ...patch };
      return next;
    });
  }

  async function loadR1FromServer() {
    setError(null);
    try {
      const { pairs } = await fetchRound1StagePairs();
      setR1Pairs(pairs);
      setImportOk("已从服务器加载现场大屏 PK（五组）配置");
    } catch (e) {
      setError(String(e));
    }
  }

  async function saveR1ToServer() {
    setBusy(true);
    setError(null);
    setImportOk(null);
    try {
      const { pairs } = await saveRound1StagePairs(r1Pairs);
      setR1Pairs(pairs);
      setImportOk("五组 PK 姓名/照片已写入 SQLite（/stage/round1 约 5s 内刷新）");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function r1ImportFromPublicFiles() {
    setBusy(true);
    setError(null);
    setImportOk(null);
    try {
      const { pairs } = await importRound1PairsFromPublicFiles();
      setR1Pairs(pairs);
      setImportOk("已从 public/stage/round1/*.json 导入到数据库");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function loadR2FromServer() {
    setError(null);
    try {
      const { slots } = await fetchRound2Lineup();
      setR2Slots(slots);
      setImportOk("已从服务器加载复活投票 lineup 配置（大屏用前 5 人）");
    } catch (e) {
      setError(String(e));
    }
  }

  async function saveR2ToServer() {
    setBusy(true);
    setError(null);
    setImportOk(null);
    try {
      const { slots } = await saveRound2Lineup(r2Slots);
      setR2Slots(slots);
      setImportOk("复活投票 lineup 已写入 SQLite（大屏取前 5 人；/stage/round2 约 5s 内刷新）");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function r2ImportFromPublicFiles() {
    setBusy(true);
    setError(null);
    setImportOk(null);
    try {
      const { slots } = await importRound2LineupFromPublicFiles();
      setR2Slots(slots);
      setImportOk("已从 public/stage/round2/*.json 导入到数据库");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function r1ApplyNumberedDefaults() {
    setBusy(true);
    setError(null);
    setImportOk(null);
    try {
      const { pairs } = await applyRound1NumberedDefaults();
      setR1Pairs(pairs);
      setImportOk("已写入「1.jpg–10.jpg」模板到数据库（请先运行 scripts/setup-contestant-photos-1-10.sh）");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetchRound1StagePairs()
      .then(({ pairs }) => {
        if (!cancelled) setR1Pairs(pairs);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchRound2Lineup()
      .then(({ slots }) => {
        if (!cancelled) setR2Slots(slots);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchFinalRevealConfig()
      .then((c) => {
        if (!cancelled) setFinalCfg(c);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchFinalLineup()
      .then(({ slots }) => {
        if (!cancelled) setFinalSlots(slots);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadFinalFromServer() {
    setError(null);
    try {
      const c = await fetchFinalRevealConfig();
      setFinalCfg(c);
      setImportOk("已加载决赛揭晓配置（SQLite final_reveal_config）");
    } catch (e) {
      setError(String(e));
    }
  }

  async function saveFinalToServer() {
    setBusy(true);
    setError(null);
    setImportOk(null);
    try {
      const c = await saveFinalRevealConfig(finalCfg);
      setFinalCfg(c);
      setImportOk("决赛揭晓已保存；/stage/final-reveal 约 5s 内生效");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function loadFinalLineupSlotsFromServer() {
    setError(null);
    try {
      const { slots } = await fetchFinalLineup();
      setFinalSlots(slots);
      setImportOk("已加载决赛舞台阵容（SQLite final_lineup_meta）");
    } catch (e) {
      setError(String(e));
    }
  }

  async function saveFinalLineupSlotsToServer() {
    setBusy(true);
    setError(null);
    setImportOk(null);
    try {
      const { slots } = await saveFinalLineup(finalSlots);
      setFinalSlots(slots);
      setImportOk("决赛舞台 6 人已保存；大屏 /stage/final-reveal 约 5s 内更新");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function copyFinalSlotsFromRound2() {
    setBusy(true);
    setError(null);
    setImportOk(null);
    try {
      const { slots } = await copyFinalLineupFromRound2();
      setFinalSlots(slots);
      setImportOk("已从复活 lineup 复制并写入决赛阵容（与复活表一致，可按需再改照片）");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onImportFile(f: File) {
    setBusy(true);
    setError(null);
    setImportOk(null);
    try {
      const text = await f.text();
      let data: unknown;
      try {
        data = JSON.parse(text) as unknown;
      } catch {
        throw new Error("JSON 解析失败，请确认文件是 UTF-8 的 .json 数组");
      }
      if (!Array.isArray(data)) throw new Error("JSON 根节点须为数组");
      const res = await importContestants(data as Record<string, unknown>[]);
      setImportOk(`已从文件导入 ${res.contestants.length} 名选手（已写入数据库）`);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function importSeedFromPublic() {
    setBusy(true);
    setError(null);
    setImportOk(null);
    try {
      const r = await fetch("/data/seed-contestants.json");
      if (!r.ok) {
        throw new Error(
          `无法加载 /data/seed-contestants.json（HTTP ${r.status}）。请用 npm run dev 打开页面，或把 dist 根目录作为静态站根目录。`
        );
      }
      const data = (await r.json()) as unknown;
      if (!Array.isArray(data)) throw new Error("种子 JSON 须为数组");
      await importContestants(data as Record<string, unknown>[]);
      setImportOk(`已导入种子名单 ${data.length} 人（已写入后端数据库）`);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page admin-page">
      <header className="admin-bar">
        <h1>控分后台</h1>
        <div className="admin-bar-actions">
          <Link
            to="/admin/contestants-editor"
            className="btn subtle"
            style={{ textDecoration: "none", display: "inline-block" }}
          >
            选手资料编辑
          </Link>
          <label className="btn subtle file-btn">
            导入 JSON
            <input
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void onImportFile(f);
              }}
            />
          </label>
          <button
            type="button"
            className="btn subtle"
            disabled={busy}
            title="写入服务器 SQLite，覆盖当前名单"
            onClick={() => void importSeedFromPublic()}
          >
            导入去年种子名单
          </button>
        </div>
      </header>

      <p className="admin-hint subtle">
        编辑名单与导出 JSON 请用顶部「<strong>选手资料</strong>」或「选手资料编辑」。此处仅<strong>导入</strong>到后端{" "}
        <code>/api/import</code>。开发请用 <code>npm run dev</code>（自动代理 8765）；若用{" "}
        <code>python -m http.server</code> 打开打包目录，请在 <code>.env</code> 里设置{" "}
        <code>VITE_API_BASE=http://127.0.0.1:8765</code> 后重新 <code>npm run build</code>，并保证后端已启动。
      </p>

      {importOk && <div className="banner success">{importOk}</div>}
      {error && <div className="banner error">{error}</div>}

      <section className="admin-section admin-section--stage" aria-labelledby="admin-section-stage-title">
        <h2 id="admin-section-stage-title" className="admin-section-title">
          现场大屏
        </h2>
        <p className="admin-hint subtle" style={{ marginBottom: "0.75rem" }}>
          按环节切换配置 lineup（与<strong>算分名单</strong>无联动，名单在「选手资料」页维护）。打开对应路由即可预览。
        </p>
        <div className="admin-stage-tabs" role="tablist" aria-label="现场大屏环节">
          <button
            type="button"
            role="tab"
            id="admin-tab-r1"
            aria-selected={stageTab === "r1"}
            aria-controls="admin-panel-r1"
            className={"admin-stage-tab" + (stageTab === "r1" ? " admin-stage-tab--active" : "")}
            onClick={() => setStageTab("r1")}
          >
            第一轮 PK（五组）
          </button>
          <button
            type="button"
            role="tab"
            id="admin-tab-r2"
            aria-selected={stageTab === "r2"}
            aria-controls="admin-panel-r2"
            className={"admin-stage-tab" + (stageTab === "r2" ? " admin-stage-tab--active" : "")}
            onClick={() => setStageTab("r2")}
          >
            复活投票
          </button>
          <button
            type="button"
            role="tab"
            id="admin-tab-final"
            aria-selected={stageTab === "final"}
            aria-controls="admin-panel-final"
            className={"admin-stage-tab" + (stageTab === "final" ? " admin-stage-tab--active" : "")}
            onClick={() => setStageTab("final")}
          >
            决赛揭晓
          </button>
        </div>

        {stageTab === "r1" && (
          <div
            id="admin-panel-r1"
            role="tabpanel"
            aria-labelledby="admin-tab-r1"
            className="admin-stage-panel"
          >
            <section className="panel round1-stage-admin">
              <h2>第一轮 · 观众柱 PK lineup（五组 → SQLite）</h2>
              <p className="admin-hint subtle" style={{ marginBottom: "0.75rem" }}>
                路由 <code>/stage/round1/1</code>～<code>/5</code>。表 <code>round1_pair_meta</code>，API{" "}
                <code>GET/PUT /api/stage/round1-pairs</code>。<strong>1–10 号</strong>下拉可自动填姓名与{" "}
                <code>/img/contestants/*.jpg</code>；脚本 <code>scripts/setup-contestant-photos-1-10.sh</code>。
              </p>
              <div className="r1-admin-actions">
                <button type="button" className="btn subtle" disabled={busy} onClick={() => void loadR1FromServer()}>
                  从服务器加载
                </button>
                <button type="button" className="btn subtle" disabled={busy} onClick={() => void r1ImportFromPublicFiles()}>
                  从 public JSON 导入到库
                </button>
                <button type="button" className="btn subtle" disabled={busy} onClick={() => void r1ApplyNumberedDefaults()}>
                  应用 1–10 照片模板到库
                </button>
                <button type="button" className="btn primary" disabled={busy} onClick={() => void saveR1ToServer()}>
                  {busy ? "保存中…" : "保存五组到数据库"}
                </button>
              </div>
              <div className="r1-admin-grid">
                {r1Pairs.map((p, i) => (
                  <div key={i} className="r1-admin-pair">
                    <h3>第 {i + 1} 组</h3>
                    <label>
                      左：选手编号（自动填姓名+图）
                      <select
                        className="admin-preset-select"
                        value={matchStageContestantNum(p.leftName, p.leftImg)}
                        onChange={(e) => {
                          const n = parseInt(e.target.value, 10);
                          if (n < 1) return;
                          const c = getStageContestantPreset(n);
                          if (c) patchR1Pair(i, { leftName: c.name, leftImg: c.img });
                        }}
                      >
                        <option value={0}>— 自定义（不改动当前）—</option>
                        {STAGE_CONTESTANT_PRESETS.map((c) => (
                          <option key={c.num} value={c.num}>
                            {c.num} · {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      右：选手编号（自动填姓名+图）
                      <select
                        className="admin-preset-select"
                        value={matchStageContestantNum(p.rightName, p.rightImg)}
                        onChange={(e) => {
                          const n = parseInt(e.target.value, 10);
                          if (n < 1) return;
                          const c = getStageContestantPreset(n);
                          if (c) patchR1Pair(i, { rightName: c.name, rightImg: c.img });
                        }}
                      >
                        <option value={0}>— 自定义（不改动当前）—</option>
                        {STAGE_CONTESTANT_PRESETS.map((c) => (
                          <option key={c.num} value={c.num}>
                            {c.num} · {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      左姓名
                      <input
                        type="text"
                        value={p.leftName}
                        onChange={(e) => patchR1Pair(i, { leftName: e.target.value })}
                      />
                    </label>
                    <label>
                      右姓名
                      <input
                        type="text"
                        value={p.rightName}
                        onChange={(e) => patchR1Pair(i, { rightName: e.target.value })}
                      />
                    </label>
                    <label>
                      左图 URL
                      <input
                        type="text"
                        value={p.leftImg}
                        placeholder="如 1.jpg（自动补 /img/contestants/）"
                        onChange={(e) => patchR1Pair(i, { leftImg: e.target.value })}
                      />
                    </label>
                    <label>
                      右图 URL
                      <input
                        type="text"
                        value={p.rightImg}
                        placeholder="如 1.jpg（自动补 /img/contestants/）"
                        onChange={(e) => patchR1Pair(i, { rightImg: e.target.value })}
                      />
                    </label>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {stageTab === "r2" && (
          <div
            id="admin-panel-r2"
            role="tabpanel"
            aria-labelledby="admin-tab-r2"
            className="admin-stage-panel"
          >
            <section className="panel round2-stage-admin">
              <h2>复活投票 · lineup（6 槽存库 → 大屏前 5 人）</h2>
              <p className="admin-hint subtle" style={{ marginBottom: "0.75rem" }}>
                路由 <code>/stage/round2</code>。表 <code>round2_lineup_meta</code>，API{" "}
                <code>/api/stage/round2-lineup</code>。大屏用 <strong>slot 1～5</strong>；第 6 槽可预留。Google 表姓名优先；
                表空时用此处姓名与头像。
              </p>
              <div className="r1-admin-actions">
                <button type="button" className="btn subtle" disabled={busy} onClick={() => void loadR2FromServer()}>
                  从服务器加载
                </button>
                <button type="button" className="btn subtle" disabled={busy} onClick={() => void r2ImportFromPublicFiles()}>
                  从 public JSON 导入到库
                </button>
                <button type="button" className="btn primary" disabled={busy} onClick={() => void saveR2ToServer()}>
                  {busy ? "保存中…" : "保存 6 人到数据库"}
                </button>
              </div>
              <div className="r2-admin-grid">
                {r2Slots.map((s, i) => (
                  <div key={i} className="r2-admin-slot">
                    <h3>Slot {i + 1}（表第 {i + 2} 行）</h3>
                    <label>
                      选手编号（自动填姓名+图）
                      <select
                        className="admin-preset-select"
                        value={matchStageContestantNum(s.name, s.img)}
                        onChange={(e) => {
                          const n = parseInt(e.target.value, 10);
                          if (n < 1) return;
                          const c = getStageContestantPreset(n);
                          if (c) patchR2Slot(i, { name: c.name, img: c.img });
                        }}
                      >
                        <option value={0}>— 自定义 —</option>
                        {STAGE_CONTESTANT_PRESETS.map((c) => (
                          <option key={c.num} value={c.num}>
                            {c.num} · {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      默认姓名（表空时显示）
                      <input
                        type="text"
                        value={s.name}
                        onChange={(e) => patchR2Slot(i, { name: e.target.value })}
                      />
                    </label>
                    <label>
                      头像 URL
                      <input
                        type="text"
                        value={s.img}
                        placeholder="如 1.jpg 或完整路径"
                        onChange={(e) => patchR2Slot(i, { img: e.target.value })}
                      />
                    </label>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {stageTab === "final" && (
          <div
            id="admin-panel-final"
            role="tabpanel"
            aria-labelledby="admin-tab-final"
            className="admin-stage-panel"
          >
            <section className="panel round2-stage-admin">
              <h2>决赛揭晓</h2>
              <p className="admin-hint subtle" style={{ marginBottom: "0.75rem" }}>
                路由 <code>/stage/final-reveal</code>。<strong>谁站在最终舞台</strong>与复活投票 lineup 分开存：表{" "}
                <code>final_lineup_meta</code>（6 槽 ↔ Google 表 Round3 第 2～7 行）。可先一键同步复活名单再改照片/姓名。
              </p>

              <h3 className="admin-subsection-title">决赛舞台阵容（6 人）</h3>
              <div className="r1-admin-actions" style={{ marginBottom: "0.75rem" }}>
                <button
                  type="button"
                  className="btn subtle"
                  disabled={busy}
                  onClick={() => void loadFinalLineupSlotsFromServer()}
                >
                  加载决赛阵容
                </button>
                <button
                  type="button"
                  className="btn subtle"
                  disabled={busy}
                  onClick={() => void copyFinalSlotsFromRound2()}
                >
                  从复活 lineup 复制并保存
                </button>
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy}
                  onClick={() => void saveFinalLineupSlotsToServer()}
                >
                  {busy ? "保存中…" : "保存决赛阵容"}
                </button>
              </div>
              <div className="r2-admin-grid" style={{ marginBottom: "1.5rem" }}>
                {finalSlots.map((s, i) => (
                  <div key={i} className="r2-admin-slot">
                    <h3>决赛 Slot {i + 1}（表第 {i + 2} 行）</h3>
                    <label>
                      选手编号（自动填姓名+图）
                      <select
                        className="admin-preset-select"
                        value={matchStageContestantNum(s.name, s.img)}
                        onChange={(e) => {
                          const n = parseInt(e.target.value, 10);
                          if (n < 1) return;
                          const c = getStageContestantPreset(n);
                          if (c) patchFinalSlot(i, { name: c.name, img: c.img });
                        }}
                      >
                        <option value={0}>— 自定义 —</option>
                        {STAGE_CONTESTANT_PRESETS.map((c) => (
                          <option key={c.num} value={c.num}>
                            {c.num} · {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      显示姓名（表 A 列空时用）
                      <input
                        type="text"
                        value={s.name}
                        onChange={(e) => patchFinalSlot(i, { name: e.target.value })}
                      />
                    </label>
                    <label>
                      头像 URL
                      <input
                        type="text"
                        value={s.img}
                        placeholder="如 1.jpg 或完整路径"
                        onChange={(e) => patchFinalSlot(i, { img: e.target.value })}
                      />
                    </label>
                  </div>
                ))}
              </div>

              <h3 className="admin-subsection-title">拉表范围与加权</h3>
              <p className="admin-hint subtle" style={{ marginBottom: "0.75rem" }}>
                写入 <code>final_reveal_config</code>，API <code>GET/PUT /api/stage/final-reveal-config</code>。需{" "}
                <code>VITE_GOOGLE_SHEET_ID</code> 与 <code>VITE_GOOGLE_SHEETS_API_KEY</code>。<strong>G 列</strong>
                有最终分时优先用表；权重仅 G 为空时 fallback。
              </p>
              <div className="r1-admin-actions">
                <button type="button" className="btn subtle" disabled={busy} onClick={() => void loadFinalFromServer()}>
                  加载加权配置
                </button>
                <button type="button" className="btn primary" disabled={busy} onClick={() => void saveFinalToServer()}>
                  {busy ? "保存中…" : "保存加权与范围"}
                </button>
              </div>
              <div className="r2-admin-grid" style={{ gridTemplateColumns: "1fr", maxWidth: "36rem" }}>
                <label>
                  Sheets 范围（相对当前 VITE 表格 ID）
                  <input
                    type="text"
                    value={finalCfg.sheetRange}
                    placeholder={DEFAULT_FINAL_AUDIENCE_RANGE}
                    onChange={(e) => setFinalCfg((p) => ({ ...p, sheetRange: e.target.value }))}
                  />
                </label>
                <label>
                  评委权重（0～1，与观众权重之和须约等于 1）
                  <input
                    type="number"
                    step="0.05"
                    min={0}
                    max={1}
                    value={finalCfg.judgeWeight}
                    onChange={(e) =>
                      setFinalCfg((p) => ({ ...p, judgeWeight: Number(e.target.value) }))
                    }
                  />
                </label>
                <label>
                  观众权重（0～1）
                  <input
                    type="number"
                    step="0.05"
                    min={0}
                    max={1}
                    value={finalCfg.audienceWeight}
                    onChange={(e) =>
                      setFinalCfg((p) => ({ ...p, audienceWeight: Number(e.target.value) }))
                    }
                  />
                </label>
                <p className="admin-hint subtle">
                  当前合计：{(finalCfg.judgeWeight + finalCfg.audienceWeight).toFixed(2)}（保存时服务端要求与 1 相差 ≤0.02）
                </p>
              </div>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}
