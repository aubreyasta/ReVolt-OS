/* =============================================================================
   App.jsx -- Root router

   Routes:
     /audit            --> AuditPage    (upload sticker + CSV, trigger Gemini)
     /passport/:id     --> PassportPage (rendered Battery Passport + QR)
     /assembly         --> AssemblyPage (ElevenLabs voice agent + safety checklist)
     /blueprint/:id    --> BlueprintPage (Gemini upcycle blueprint viewer)

   Data flows via React Router location.state:
     AuditPage      navigates to PassportPage with { manifest } in state.
     PassportPage   navigates to AssemblyPage  with { manifest } in state.
     PassportPage   navigates to BlueprintPage with { manifest } in state.
   ============================================================================= */

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AuditPage from "./pages/AuditPage";
import PassportPage from "./pages/PassportPage";
import AssemblyPage from "./pages/AssemblyPage";
import BlueprintPage from "./pages/BlueprintPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/audit" replace />} />
        <Route path="/audit" element={<AuditPage />} />
        <Route path="/passport/:id" element={<PassportPage />} />
        <Route path="/assembly" element={<AssemblyPage />} />
        <Route path="/blueprint/:id" element={<BlueprintPage />} />
      </Routes>
    </BrowserRouter>
  );
}
