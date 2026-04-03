import { NavLink, Outlet, useLocation } from "react-router-dom";

export default function MainLayout() {
  const loc = useLocation();
  const r1Active = loc.pathname.startsWith("/stage/round1");

  return (
    <div className="app-shell">
      <nav className="app-nav">
        <span className="app-brand">心动的声音 · Voice of NYC</span>
        <NavLink to="/" end className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
          入口
        </NavLink>
        <NavLink to="/admin" className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
          控分后台
        </NavLink>
        <NavLink to="/display" className={({ isActive }) => "nav-link" + (isActive ? " active" : "")}>
          大屏
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
      </nav>
      <Outlet />
    </div>
  );
}
