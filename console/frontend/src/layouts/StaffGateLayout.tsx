import { Navigate, Outlet, useLocation } from "react-router-dom";
import {
  isStaffPortalAuthed,
  staffPortalGateEnabled,
} from "@/auth/staffPortal";

/**
 * 未设置 VITE_STAFF_PORTAL_PASSWORD 时不启用门禁（本地开发默认全开）。
 * 设置后：除 /login 外均需浏览器内「工作人员登录」。
 */
export default function StaffGateLayout() {
  const loc = useLocation();

  if (!staffPortalGateEnabled()) {
    return <Outlet />;
  }

  if (loc.pathname === "/login") {
    if (isStaffPortalAuthed()) {
      return <Navigate to="/" replace />;
    }
    return <Outlet />;
  }

  if (!isStaffPortalAuthed()) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${loc.pathname}${loc.search}` }}
      />
    );
  }

  return <Outlet />;
}
