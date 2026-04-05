import { useCallback, useEffect, useState } from "react";
import {
  applyRound1NumberedDefaults,
  fetchRound1StagePairs,
  fetchRound2Lineup,
  fetchState,
  importContestants,
  importRound1PairsFromPublicFiles,
  importRound2LineupFromPublicFiles,
  patchScores,
  saveRound1StagePairs,
  saveRound2Lineup,
} from "@/api/client";
import { parseResponseAsJson } from "@/api/safeResponseJson";
import type { Contestant, Round1PairMeta, Round2LineupSlot, StatePayload } from "@/api/types";
import {
  getStageContestantPreset,
  matchStageContestantNum,
  STAGE_CONTESTANT_PRESETS,
} from "@/config/stageContestantPresets";

const Z = (n: number) => (Number.isFinite(n) ? n : 0);

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

function applyContestantToForm(
  c: Contestant,
  setJudges: (v: number[]) => void,
  setAudience: (v: number) => void
) {
  const j = parseFloat(c.judges) || 0;
  const a = parseFloat(c.audience) || 0;
  setJudges([j, j, j, j]);
  setAudience(a);
}

type AdminStageTab = "r1" | "r2";

export default function Admin() {
  const [state, setState] = useState<StatePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [judges, setJudges] = useState([0, 0, 0, 0]);
  const [audience, setAudience] = useState(0);
  const [busy, setBusy] = useState(false);
  const [importOk, setImportOk] = useState<string | null>(null);
  const [r1Pairs, setR1Pairs] = useState<Round1PairMeta[]>(defaultR1Pairs);
  const [r2Slots, setR2Slots] = useState<Round2LineupSlot[]>(defaultR2Slots);
  const [stageTab, setStageTab] = useState<AdminStageTab>("r1");

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
    (async () => {
      setError(null);
      try {
        const s = await fetchState();
        if (cancelled) return;
        setState(s);
        if (s.contestants[0]) {
          const c = s.contestants[0];
          setSelectedId(c.id);
          applyContestantToForm(c, setJudges, setAudience);
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const s = await fetchState();
      setState(s);
      const c =
        (selectedId != null
          ? s.contestants.find((x) => x.id === selectedId)
          : null) ?? s.contestants[0];
      if (c) {
        setSelectedId(c.id);
        applyContestantToForm(c, setJudges, setAudience);
      }
    } catch (e) {
      setError(String(e));
    }
  }, [selectedId]);

  function selectContestant(c: Contestant) {
    setSelectedId(c.id);
    applyContestantToForm(c, setJudges, setAudience);
  }

  const previewTotal = audience / 2 + judges.reduce((s, x) => s + x, 0) / 24;

  async function save() {
    if (selectedId == null) return;
    setBusy(true);
    setError(null);
    try {
      const res = await patchScores(selectedId, {
        judge_scores: judges,
        audience,
      });
      setState({ contestants: res.contestants, ranked: res.ranked });
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
      setState({ contestants: res.contestants, ranked: res.ranked });
      if (res.contestants.length) {
        const c = res.contestants[0];
        setSelectedId(c.id);
        applyContestantToForm(c, setJudges, setAudience);
      }
      setImportOk(`已从文件导入 ${res.contestants.length} 名选手`);
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
      const data = await parseResponseAsJson<unknown>(r);
      if (!Array.isArray(data)) throw new Error("种子 JSON 须为数组");
      const res = await importContestants(data as Record<string, unknown>[]);
      setState({ contestants: res.contestants, ranked: res.ranked });
      if (res.contestants.length) {
        const c = res.contestants[0];
        setSelectedId(c.id);
        applyContestantToForm(c, setJudges, setAudience);
      }
      setImportOk(`已导入种子名单 ${res.contestants.length} 人（已写入后端数据库）`);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  function exportJson() {
    if (!state) return;
    const blob = new Blob([JSON.stringify(state.contestants, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "contestants.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const selected =
    state?.contestants.find((c) => c.id === selectedId) ?? null;

  return (
    <main className="page admin-page">
      <header className="admin-bar">
        <h1>控分后台</h1>
        <div className="admin-bar-actions">
          <button type="button" className="btn subtle" onClick={() => void refresh()}>
            刷新
          </button>
          <button type="button" className="btn subtle" onClick={exportJson} disabled={!state}>
            导出 JSON
          </button>
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
        导入会请求后端 <code>/api/import</code>。开发请用 <code>npm run dev</code>（自动代理 8765）；若用{" "}
        <code>python -m http.server</code> 打开打包目录，请在 <code>.env</code> 里设置{" "}
        <code>VITE_API_BASE=http://127.0.0.1:8765</code> 后重新 <code>npm run build</code>，并保证后端已启动。
      </p>

      {importOk && <div className="banner success">{importOk}</div>}
      {error && <div className="banner error">{error}</div>}

      <section className="admin-section" aria-labelledby="admin-section-scores-title">
        <h2 id="admin-section-scores-title" className="admin-section-title">
          选手与分数
        </h2>
        <p className="admin-hint subtle" style={{ marginBottom: "1rem" }}>
          与现场大屏 lineup 分开配置：此处为<strong>算分名单</strong>（导入 / 评委 / 观众票），不影响{" "}
          <code>/stage/round1</code>、<code>/stage/round2</code> 的头像与 PK 姓名。
        </p>
        <div className="admin-grid">
        <section className="panel">
          <h2>选手列表</h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>姓名</th>
                  <th>总分</th>
                </tr>
              </thead>
              <tbody>
                {state?.contestants.map((c) => (
                  <tr
                    key={c.id}
                    className={c.id === selectedId ? "active" : ""}
                    onClick={() => selectContestant(c)}
                  >
                    <td>{c.id}</td>
                    <td>{c.name}</td>
                    <td>{c.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel form-panel">
          <h2>录入分数</h2>
          {selected ? (
            <p className="selected-line">
              当前：<strong>{selected.name}</strong> · {selected.song}
            </p>
          ) : (
            <p>请选择选手</p>
          )}

          <div className="score-groups">
            <div>
              <h3>评委 ×4</h3>
              <div className="inputs-4">
                {judges.map((v, i) => (
                  <label key={i}>
                    <span>{i + 1}</span>
                    <input
                      type="number"
                      value={v}
                      onChange={(e) => {
                        const next = [...judges];
                        next[i] = Z(parseFloat(e.target.value));
                        setJudges(next);
                      }}
                    />
                  </label>
                ))}
              </div>
            </div>
            <div>
              <h3>观众</h3>
              <label className="single-input">
                <input
                  type="number"
                  value={audience}
                  onChange={(e) => setAudience(Z(parseFloat(e.target.value)))}
                />
              </label>
            </div>
          </div>

          <p className="preview-total">
            预览总分（与保存后一致）：<strong>{previewTotal.toFixed(2)}</strong>
          </p>

          <button
            type="button"
            className="btn primary"
            disabled={busy || selectedId == null}
            onClick={() => void save()}
          >
            {busy ? "保存中…" : "保存到服务器"}
          </button>
        </section>
        </div>
      </section>

      <section className="admin-section admin-section--stage" aria-labelledby="admin-section-stage-title">
        <h2 id="admin-section-stage-title" className="admin-section-title">
          现场大屏
        </h2>
        <p className="admin-hint subtle" style={{ marginBottom: "0.75rem" }}>
          按环节切换配置 lineup（与上方选手名单<strong>无联动</strong>）。打开对应路由即可预览。
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
      </section>
    </main>
  );
}
