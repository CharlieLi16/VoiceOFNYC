import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { submitCheckin } from "@/api/client";
import "@/styles/check-in.css";

export default function CheckInPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [funResponse, setFunResponse] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await submitCheckin({ name, email, funResponse, website });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败，请稍后再试。");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <main className="page check-in-page">
        <div className="staff-login-card check-in-card">
          <h1 className="staff-login-title">签到成功</h1>
          <p className="check-in-success-lead">
            各环节的投票链接与投票码已发送到你填写的邮箱；请查收并妥善保存。
          </p>
          <p className="staff-login-hint subtle">
            若未收到邮件，请检查垃圾箱，或向现场工作人员求助。
          </p>
          <Link className="cta cta-neon check-in-back" to="/">
            返回首页
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="page check-in-page">
      <div className="staff-login-card check-in-card">
        <h1 className="staff-login-title">现场签到</h1>
        <p className="check-in-intro">
          填写信息后，系统将分配投票码，并把<strong>各轮投票链接</strong>发送到你填写的<strong>邮箱</strong>。
        </p>
        <form className="staff-login-form check-in-form" onSubmit={onSubmit}>
          <label className="staff-login-label">
            姓名
            <input
              name="name"
              autoComplete="name"
              required
              maxLength={120}
              value={name}
              onChange={(ev) => setName(ev.target.value)}
              placeholder="与现场登记一致"
            />
          </label>
          <label className="staff-login-label">
            邮箱
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              placeholder="用于接收投票链接"
            />
          </label>
          <label className="staff-login-label check-in-fun-label">
            你觉得谁会夺冠？你最期待什么？<span className="subtle">（选填）</span>
            <textarea
              name="funResponse"
              className="check-in-fun-field"
              rows={3}
              maxLength={500}
              value={funResponse}
              onChange={(ev) => setFunResponse(ev.target.value)}
              placeholder="随便聊聊～"
            />
          </label>
          <label className="check-in-honeypot" aria-hidden="true">
            Website
            <input
              tabIndex={-1}
              name="website"
              autoComplete="off"
              value={website}
              onChange={(ev) => setWebsite(ev.target.value)}
            />
          </label>
          {error ? <p className="staff-login-error">{error}</p> : null}
          <button type="submit" className="btn primary staff-login-submit" disabled={busy}>
            {busy ? "提交中…" : "提交签到"}
          </button>
        </form>
        <p className="staff-login-hint subtle">
          <Link to="/">返回控制台首页</Link>
          {" · "}
          <a href="/vote/vote.html">观众投票页</a>
        </p>
      </div>
    </main>
  );
}
