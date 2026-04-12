import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchState, importContestants } from "@/api/client";
import type { Contestant } from "@/api/types";

const SEED_URL = "/data/seed-contestants.json";

/** 选手资料编辑仅维护档案字段；分数字段提交时由前端补默认，算分以 Google Sheet / 控分为准 */
export type SeedContestantRow = {
  id: number;
  name: string;
  img: string;
  song: string;
  songTwo: string;
};

function emptyRow(nextId: number): SeedContestantRow {
  return {
    id: nextId,
    name: "",
    img: `/img/contestants/${Math.min(nextId + 1, 10)}.jpg`,
    song: "",
    songTwo: "",
  };
}

function parseSeedRows(raw: unknown): SeedContestantRow[] {
  if (!Array.isArray(raw)) throw new Error("根节点须为数组");
  return raw.map((item, idx) => {
    if (!item || typeof item !== "object") throw new Error(`第 ${idx + 1} 项不是对象`);
    const o = item as Record<string, unknown>;
    const id = Number(o.id);
    if (!Number.isInteger(id)) throw new Error(`第 ${idx + 1} 项 id 无效`);
    return {
      id,
      name: String(o.name ?? ""),
      img: String(o.img ?? ""),
      song: String(o.song ?? ""),
      songTwo: String(o.songTwo ?? ""),
    };
  });
}

function contestantToSeedRow(c: Contestant): SeedContestantRow {
  return {
    id: c.id,
    name: c.name,
    img: c.img,
    song: c.song,
    songTwo: c.songTwo,
  };
}

/** 与后端 import_contestants 兼容：补全分数字段，排名按当前表格顺序 */
function rowsToImportPayload(rows: SeedContestantRow[]): Record<string, unknown>[] {
  return rows.map((r, idx) => ({
    id: r.id,
    name: r.name,
    img: r.img,
    song: r.song,
    songTwo: r.songTwo,
    judges: "0",
    audience: "0",
    total: "0",
    ranking: idx,
  }));
}

export default function ContestantSeedEditor() {
  const [rows, setRows] = useState<SeedContestantRow[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const loadFromSeed = useCallback(async () => {
    setLoadErr(null);
    setMsg(null);
    try {
      const r = await fetch(SEED_URL);
      if (!r.ok) throw new Error(`无法加载 ${SEED_URL}（HTTP ${r.status}）`);
      const data = (await r.json()) as unknown;
      setRows(parseSeedRows(data));
      setMsg({ ok: true, text: "已从内置种子加载，可直接修改后导出。" });
    } catch (e) {
      setLoadErr(String(e));
    }
  }, []);

  const loadFromServer = useCallback(async () => {
    setLoadErr(null);
    setMsg(null);
    try {
      const state = await fetchState();
      const list = state.contestants ?? [];
      if (list.length === 0) {
        setRows([]);
        setMsg({
          ok: true,
          text: "服务器上暂无选手数据（SQLite 为空）。可先用内置种子或 JSON 文件载入，再提交到服务器。",
        });
        return;
      }
      setRows(list.map(contestantToSeedRow));
      setMsg({
        ok: true,
        text: `已从服务器载入 ${list.length} 人（仅档案字段；分数字段未在此展示）。`,
      });
    } catch (e) {
      setLoadErr(String(e));
    }
  }, []);

  useEffect(() => {
    void loadFromSeed();
  }, [loadFromSeed]);

  function patchRow(i: number, patch: Partial<SeedContestantRow>) {
    setRows((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], ...patch };
      return next;
    });
  }

  function addRow() {
    setRows((prev) => {
      const nextId = prev.length ? Math.max(...prev.map((c) => c.id)) + 1 : 0;
      return [...prev, emptyRow(nextId)];
    });
  }

  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, j) => j !== i));
  }

  async function onPickFile(f: File) {
    setMsg(null);
    setLoadErr(null);
    try {
      const text = await f.text();
      const data = JSON.parse(text) as unknown;
      setRows(parseSeedRows(data));
      setMsg({ ok: true, text: `已从「${f.name}」载入 ${Array.isArray(data) ? data.length : 0} 条` });
    } catch (e) {
      setLoadErr(String(e));
    }
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "seed-contestants.json";
    a.click();
    URL.revokeObjectURL(a.href);
    setMsg({
      ok: true,
      text: "已下载 seed-contestants.json（仅含档案字段）。可覆盖 public/data/ 后 build，或在控分后台「导入 JSON」写入服务器。",
    });
  }

  async function pushToServer() {
    setBusy(true);
    setMsg(null);
    setLoadErr(null);
    try {
      const res = await importContestants(rowsToImportPayload(rows));
      setMsg({
        ok: true,
        text: `已写入服务器 SQLite，共 ${res.contestants.length} 人。分数以 Google Sheet / 现场控分为准；本页提交时分为占位 0。`,
      });
    } catch (e) {
      setLoadErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page admin-page">
      <header className="admin-bar">
        <h1>选手资料编辑</h1>
        <div className="admin-bar-actions">
          <Link to="/admin" className="btn subtle" style={{ textDecoration: "none", display: "inline-block" }}>
            返回控分后台
          </Link>
          <button type="button" className="btn subtle" onClick={() => void loadFromSeed()}>
            重新加载内置种子
          </button>
          <button type="button" className="btn subtle" onClick={() => void loadFromServer()}>
            从服务器载入
          </button>
          <label className="btn subtle file-btn">
            从 JSON 文件载入
            <input
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void onPickFile(f);
              }}
            />
          </label>
          <button type="button" className="btn subtle" onClick={addRow}>
            添加一行
          </button>
          <button type="button" className="btn subtle" onClick={exportJson} disabled={!rows.length}>
            导出 JSON
          </button>
          <button type="button" className="btn primary" disabled={busy || !rows.length} onClick={() => void pushToServer()}>
            {busy ? "提交中…" : "提交到服务器"}
          </button>
        </div>
      </header>

      <p className="admin-hint subtle">
        本页只编辑 <strong>id / 姓名 / 头像 / 曲目</strong>，不包含评委分、观众分、总分、排名（算分以 <strong>Google Sheet</strong> 与控台为准）。
        <strong>从服务器载入</strong>仅拉取档案字段；<strong>重新加载内置种子</strong>来自{" "}
        <code>public/data/seed-contestants.json</code>。提交到服务器时会自动补占位分数以便 SQLite 兼容。须启动后端 +{" "}
        <code>npm run dev</code> 或配置 <code>VITE_API_BASE</code>。
      </p>

      {loadErr && <div className="banner error">{loadErr}</div>}
      {msg && <div className={msg.ok ? "banner success" : "banner error"}>{msg.text}</div>}

      <div className="table-wrap seed-editor-wrap">
        <table className="data-table seed-editor-table">
          <thead>
            <tr>
              <th>id</th>
              <th>姓名</th>
              <th>头像路径</th>
              <th>曲目</th>
              <th>副标题/第二首</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((c, i) => (
              <tr key={`${c.id}-${i}`}>
                <td>
                  <input
                    className="seed-editor-cell"
                    type="number"
                    value={c.id}
                    onChange={(e) => patchRow(i, { id: parseInt(e.target.value, 10) || 0 })}
                  />
                </td>
                <td>
                  <input
                    className="seed-editor-cell"
                    type="text"
                    value={c.name}
                    onChange={(e) => patchRow(i, { name: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    className="seed-editor-cell seed-editor-cell--wide"
                    type="text"
                    value={c.img}
                    onChange={(e) => patchRow(i, { img: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    className="seed-editor-cell"
                    type="text"
                    value={c.song}
                    onChange={(e) => patchRow(i, { song: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    className="seed-editor-cell"
                    type="text"
                    value={c.songTwo}
                    onChange={(e) => patchRow(i, { songTwo: e.target.value })}
                  />
                </td>
                <td>
                  <button type="button" className="btn subtle" onClick={() => removeRow(i)}>
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
