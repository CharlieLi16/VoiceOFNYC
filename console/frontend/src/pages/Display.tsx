import { useEffect, useRef, useState } from "react";
import { displayWebSocketUrl, fetchState } from "@/api/client";
import type { Contestant, StatePayload } from "@/api/types";

function RankPhoto({ c }: { c: Contestant }) {
  const [broken, setBroken] = useState(false);
  const src = (c.img || "").trim();
  if (!src || broken) {
    const initial = c.name?.trim()?.charAt(0) || "?";
    return (
      <div className="rank-photo-wrap rank-photo-wrap--placeholder" aria-hidden>
        <span className="rank-photo-initial">{initial}</span>
      </div>
    );
  }
  return (
    <div className="rank-photo-wrap">
      <img
        className="rank-photo"
        src={src}
        alt=""
        loading="lazy"
        onError={() => setBroken(true)}
      />
    </div>
  );
}

export default function Display() {
  const [state, setState] = useState<StatePayload | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    void fetchState()
      .then(setState)
      .catch(() => {});
  }, []);

  useEffect(() => {
    const url = displayWebSocketUrl();
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as StatePayload;
        if (data.ranked && data.contestants) setState(data);
      } catch {
        /* ignore */
      }
    };
    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, []);

  const ranked = state?.ranked ?? [];

  return (
    <main className="page display-page">
      <header className="display-header">
        <h1 className="display-title">心动的声音</h1>
        <p className="display-sub">
          Voice of NYC · 实时排行
          <span className={`ws-dot ${connected ? "on" : ""}`} title="WebSocket" />
        </p>
      </header>

      <div className="rank-grid">
        {ranked.map((c, idx) => (
          <article key={c.id} className="rank-card" style={{ animationDelay: `${idx * 0.04}s` }}>
            <span className="rank-badge">#{idx + 1}</span>
            <RankPhoto c={c} />
            <h2 className="rank-name">{c.name}</h2>
            <p className="rank-song">{c.song}</p>
            <p className="rank-score">{c.total}</p>
          </article>
        ))}
      </div>

      {!ranked.length && (
        <p className="display-empty">等待数据… 请确认后端已启动并已导入选手。</p>
      )}
    </main>
  );
}
