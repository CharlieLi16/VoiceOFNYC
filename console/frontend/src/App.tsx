import { Navigate, Route, Routes } from "react-router-dom";
import MainLayout from "./layouts/MainLayout";
import StaffGateLayout from "./layouts/StaffGateLayout";
import StageLayout from "./layouts/StageLayout";
import Admin from "./pages/Admin";
import ContestantSeedEditor from "./pages/ContestantSeedEditor";
import Display from "./pages/Display";
import Home from "./pages/Home";
import StaffLogin from "./pages/StaffLogin";
import CheckInPage from "./pages/CheckInPage";
import FinalRevealStage from "./pages/stage/FinalRevealStage";
import Round1PairStage from "./pages/stage/Round1PairStage";
import Round2Stage from "./pages/stage/Round2Stage";

export default function App() {
  return (
    <Routes>
      <Route path="/check-in" element={<CheckInPage />} />
      <Route element={<StaffGateLayout />}>
        <Route path="/login" element={<StaffLogin />} />
        <Route element={<StageLayout />}>
          <Route path="/stage/round1" element={<Navigate to="/stage/round1/1" replace />} />
          <Route path="/stage/round1/:pair" element={<Round1PairStage />} />
          <Route path="/stage/round2" element={<Round2Stage />} />
          <Route path="/stage/final" element={<Navigate to="/stage/round2" replace />} />
          <Route path="/stage/final-reveal" element={<FinalRevealStage />} />
        </Route>
        <Route element={<MainLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/admin/contestants-editor" element={<ContestantSeedEditor />} />
          <Route path="/display" element={<Display />} />
        </Route>
      </Route>
    </Routes>
  );
}
