import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { importContestants } from "@/api/client";
import type { Contestant } from "@/api/types";

const SEED_URL = "/data/seed-contestants.json";

function emptyRow(nextId: number, ranking: number): Contestant {
  return {
    id: nextId,
    name: "",
    img: `/img/contestants/${Math.min(nextId + 1, 10)}.jpg`,
    song: "",
    songTwo: "",
    judges: "0",
    audience: "0",
    total: "0",
    ranking,
  };
}

function parseImportedList(raw: unknown): Contestant[] {
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
      judges: String(o.judges ?? "0"),
      audience: String(o.audience ?? "0"),
      total: String(o.total ?? "0"),
      ranking: Number.isInteger(Number(o.ranking)) ? Number(o.ranking) : idx,
    };
  });
}

export default function ContestantSeedEditor() {
  const [rows, setRows] = useState<Contestant[]>([]);
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
      setRows(parseImportedList(data));
      setMsg({ ok: true, text: "已从内置种子加载，可直接修改后导出。" });
    } catch (e) {
      setLoadErr(String(e));
    }
  }, []);

  useEffect(() => {
    void loadFromSeed();
  }, [loadFromSeed]);

  function patchRow(i: number, patch: Partial<Contestant>) {
    setRows((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], ...patch };
      return next;
    });
  }

  function addRow() {
    setRows((prev) => {
      const nextId = prev.length ? Math.max(...prev.map((c) => c.id)) + 1 : 0;
      return [...prev, emptyRow(nextId, prev.length)];
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
      setRows(parseImportedList(data));
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
    setMsg({ ok: true, text: "已下载 seed-contestants.json，可覆盖 public/data/ 后 build，或在控分后台「导入 JSON」写入服务器。" });
  }

  async function pushToServer() {
    setBusy(true);
    setMsg(null);
    setLoadErr(null);
    try {
      const res = await importContestants(rows as Record<string, unknown>[]);
      setMsg({
        ok: true,
        text: `已写入服务器 SQLite，共 ${res.contestants.length} 人（与 /display 等接口一致）。`,
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
        在此修改姓名、头像路径、曲目与分数字段（字符串，与 <code>seed-contestants.json</code> 一致），点<strong>导出 JSON</strong>即可下载；需要更新 SQLite 时点<strong>提交到服务器</strong>（须启动后端 + <code>npm run dev</code> 或配置{" "}
        <code>VITE_API_BASE</code>）。
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
              <th>judges</th>
              <th>audience</th>
              <th>total</th>
              <th>ranking</th>
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
                  <input
                    className="seed-editor-cell"
                    type="text"
                    value={c.judges}
                    onChange={(e) => patchRow(i, { judges: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    className="seed-editor-cell"
                    type="text"
                    value={c.audience}
                    onChange={(e) => patchRow(i, { audience: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    className="seed-editor-cell"
                    type="text"
                    value={c.total}
                    onChange={(e) => patchRow(i, { total: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    className="seed-editor-cell"
                    type="number"
                    value={c.ranking}
                    onChange={(e) => patchRow(i, { ranking: parseInt(e.target.value, 10) || 0 })}
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
