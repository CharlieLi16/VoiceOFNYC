import { Outlet } from "react-router-dom";
import "@/styles/stage-audience.css";

export default function StageLayout() {
  return (
    <div className="stage-page-root">
      <Outlet />
    </div>
  );
}
