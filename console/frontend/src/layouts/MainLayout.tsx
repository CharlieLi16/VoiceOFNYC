import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  staffPortalGateEnabled,
  setStaffPortalAuthed,
} from "@/auth/staffPortal";

export default function MainLayout() {
  const loc = useLocation();
  const navigate = useNavigate();
  const r1Active = loc.pathname.startsWith("/stage/round1");
  const gateOn = staffPortalGateEnabled();

  function logout() {
    setStaffPortalAuthed(false);
    navigate("/login", { replace: true });
  }

  return (
    <div className="app-shell">
      <nav className="app-nav">
        <span className="app-brand">心动的声音 · Voice of NYC</span>
        <NavLink to="/" end className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
          入口
        </NavLink>
        <NavLink to="/admin" end className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
          控分后台
        </NavLink>
        <NavLink
          to="/admin/contestants-editor"
          className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}
        >
          选手资料
        </NavLink>
        <span className="nav-sep" aria-hidden="true">
          |
        </span>
        <NavLink to="/stage/round1/1" className={"nav-link" + (r1Active ? " active" : "")}>
          R1 观众柱
        </NavLink>
        <NavLink to="/stage/round2" className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
          复活投票
        </NavLink>
        <NavLink
          to="/stage/final-reveal"
          className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}
        >
          Final 揭晓
        </NavLink>
        {gateOn ? (
          <>
            <span className="nav-sep" aria-hidden="true">
              |
            </span>
            <button type="button" className="nav-link nav-link-btn" onClick={logout}>
              退出登录
            </button>
          </>
        ) : null}
      </nav>
      <Outlet />
    </div>
  );
}
