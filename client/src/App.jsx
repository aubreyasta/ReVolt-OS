/* App.jsx -- Root router (landing page at /) */
import { BrowserRouter, Routes, Route } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import AuditPage from "./pages/AuditPage";
import PassportPage from "./pages/PassportPage";
import AssemblyPage from "./pages/AssemblyPage";
import BlueprintPage from "./pages/BlueprintPage";
import WorkspacePage from "./pages/WorkspacePage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/audit" element={<AuditPage />} />
        <Route path="/passport/:id" element={<PassportPage />} />
        <Route path="/assembly" element={<AssemblyPage />} />
        <Route path="/blueprint/:id" element={<BlueprintPage />} />
        <Route path="/workspace" element={<WorkspacePage />} />
      </Routes>
    </BrowserRouter>
  );
}

