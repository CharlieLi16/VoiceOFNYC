import { FormEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  checkStaffPortalPassword,
  setStaffPortalAuthed,
} from "@/auth/staffPortal";

function safeStaffRedirect(raw: unknown): string {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//")) {
    return "/";
  }
  if (raw === "/login" || raw.startsWith("/login?")) return "/";
  return raw;
}

export default function StaffLogin() {
  const navigate = useNavigate();
  const loc = useLocation();
  const from = safeStaffRedirect((loc.state as { from?: string } | null)?.from);

  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (checkStaffPortalPassword(password)) {
      setStaffPortalAuthed(true, { persist: rememberMe });
      navigate(from, { replace: true });
      return;
    }
    setError("密码不正确");
  }

  return (
    <main className="page staff-login-page">
      <div className="staff-login-card">
        <h1 className="staff-login-title">工作人员登录</h1>
        <p className="staff-login-audience">
          <strong>观众</strong>请勿使用本页。请仅打开工作人员发放的
          <strong>投票链接</strong>，或点击下方入口。
        </p>
        <a className="cta cta-neon staff-login-vote-link" href="/vote/vote.html">
          观众投票入口
        </a>
        <p className="staff-login-divider" aria-hidden="true">
          —— 工作人员 ——
        </p>
        <form className="staff-login-form" onSubmit={onSubmit}>
          <label className="staff-login-label">
            门户密码
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="由部署环境配置"
            />
          </label>
          <label className="staff-login-remember">
            <input
              type="checkbox"
              name="remember"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
            />
            记住我（本机保留登录，共用电脑请取消勾选）
          </label>
          {error ? <p className="staff-login-error">{error}</p> : null}
          <button type="submit" className="btn primary staff-login-submit">
            进入控制台
          </button>
        </form>
        <p className="staff-login-hint">
          投票调度台（发布环节）：{" "}
          <a href="/vote/index.html">/vote/index.html</a>
          （静态页；若已启用门户，仍建议只把投票链接发给观众。）
        </p>
        <p className="staff-login-hint subtle">
          本页为前端简易门槛，生产环境请配合 HTTPS、强密码与网络层限制。
        </p>
      </div>
      <p className="staff-login-footer subtle">
        未在环境变量中设置 <code>VITE_STAFF_PORTAL_PASSWORD</code> 时，控制台入口无需登录。
      </p>
    </main>
  );
}
