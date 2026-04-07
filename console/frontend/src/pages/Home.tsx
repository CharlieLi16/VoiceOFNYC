import type { ReactNode } from "react";
import { Link } from "react-router-dom";

function Section({
  id,
  title,
  hint,
  children,
}: {
  id: string;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  const headingId = `home-${id}`;
  return (
    <section className="home-section" aria-labelledby={headingId}>
      <h2 className="home-section-title" id={headingId}>
        {title}
      </h2>
      {hint ? <p className="home-section-hint">{hint}</p> : null}
      <div className="home-actions">{children}</div>
    </section>
  );
}

export default function Home() {
  return (
    <main className="page home-page">
      <div className="home-hub">
        <h1 className="display-title">Voice of NYC</h1>
        <p className="home-tagline">控制台总入口 · 后台配置 · 大屏与投票</p>

        <Section
          id="staff"
          title="工作人员 · 配置"
          hint="名单、现场 lineup、决赛揭晓范围/权重、导入选手等"
        >
          <Link className="cta cta-gold" to="/admin">
            控分后台（含现场大屏 / 决赛揭晓）
          </Link>
          <Link className="cta cta-neon" to="/admin/contestants-editor">
            选手资料编辑
          </Link>
          <a className="cta cta-ghost" href="/vote/index.html">
            投票调度台（静态）
          </a>
        </Section>

        <Section id="display" title="现场展示" hint="与 WebSocket 同步的算分大屏">
          <Link className="cta cta-gold" to="/display">
            打开现场大屏
          </Link>
        </Section>

        <Section
          id="stages"
          title="环节大屏（观众柱 / 复活）"
          hint="全屏环节页；背景与仓库 background1.png 一致"
        >
          <Link className="cta cta-neon" to="/stage/round1/1">
            R1 · 第 1 组
          </Link>
          <Link className="cta cta-neon" to="/stage/round1/2">
            第 2 组
          </Link>
          <Link className="cta cta-neon" to="/stage/round1/3">
            第 3 组
          </Link>
          <Link className="cta cta-neon" to="/stage/round1/4">
            第 4 组
          </Link>
          <Link className="cta cta-neon" to="/stage/round1/5">
            第 5 组
          </Link>
          <Link className="cta cta-neon" to="/stage/round2">
            复活投票
          </Link>
        </Section>

        <Section
          id="final"
          title="决赛"
          hint="最终分揭晓、奖牌排序；阵容与加权在控分后台「决赛揭晓」"
        >
          <Link className="cta cta-gold" to="/stage/final-reveal">
            Final 分数揭晓
          </Link>
        </Section>

        <Section
          id="vote-static"
          title="观众端（静态页）"
          hint="部署后与控制台同源打开；开发时用 npm run dev 根路径"
        >
          <a className="cta cta-ghost" href="/vote/vote.html">
            观众投票页 vote.html
          </a>
        </Section>

        <p className="home-hint">
          开发：先在后端目录启动{" "}
          <code>uvicorn app.main:app --reload --host 0.0.0.0 --port 8765</code>，再在本目录{" "}
          <code>npm run dev</code>。顶部导航与本页链接一致，可随时从「入口」回到此处。
        </p>
      </div>
    </main>
  );
}
