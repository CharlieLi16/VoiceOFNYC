import { Outlet } from "react-router-dom";
import { StageHintsProvider } from "@/contexts/StageHintsContext";
import "@/styles/stage-audience.css";

export default function StageLayout() {
  return (
    <div className="stage-page-root">
      <StageHintsProvider>
        <Outlet />
      </StageHintsProvider>
    </div>
  );
}
