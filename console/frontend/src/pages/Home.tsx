import { Link } from "react-router-dom";

export default function Home() {
  return (
    <main className="page home-page">
      <h1 className="display-title">Voice of NYC</h1>
      <p className="home-tagline">独立控制台 · Python API · React 大屏</p>
      <div className="home-actions">
        <Link className="cta cta-gold" to="/admin">
          打开控分后台
        </Link>
        <Link className="cta cta-neon" to="/display">
          打开现场大屏
        </Link>
      </div>
      <p className="home-tagline" style={{ marginTop: "1.5rem" }}>
        观众投票柱图（全屏 · 与仓库 <code>background1.png</code> 统一背景）
      </p>
      <div className="home-actions">
        <Link className="cta cta-neon" to="/stage/round1/1">
          第一轮 PK
        </Link>
        <Link className="cta cta-neon" to="/stage/round1/2">
          第二轮
        </Link>
        <Link className="cta cta-neon" to="/stage/round1/3">
          第三轮
        </Link>
        <Link className="cta cta-neon" to="/stage/round1/4">
          第四轮
        </Link>
        <Link className="cta cta-neon" to="/stage/round1/5">
          第五轮
        </Link>
        <Link className="cta cta-neon" to="/stage/round2">
          复活投票
        </Link>
        <Link className="cta cta-neon" to="/stage/final-reveal">
          Final 分数揭晓
        </Link>
      </div>
      <p className="home-hint">
        开发时请先启动后端：<code>uvicorn app.main:app --reload --host 0.0.0.0 --port 8765</code>
        （在 <code>backend</code> 目录），再 <code>npm run dev</code>。
      </p>
    </main>
  );
}
