/* =============================================================================
   App.jsx -- Root router

   Three routes:
     /audit           --> AuditPage    (upload sticker + CSV, trigger Gemini)
     /passport/:id    --> PassportPage (rendered Battery Passport + QR)
     /assembly        --> AssemblyPage (ElevenLabs voice agent + safety checklist)

   Data flows via React Router location.state, not URL params:
     AuditPage      navigates to PassportPage with { manifest } in state.
     PassportPage   navigates to AssemblyPage  with { manifest } in state.
   This means deep-linking to /passport/:id or /assembly shows a "not found"
   state until GET /api/batteries/:id is wired to MongoDB (see PassportPage.jsx).
   ============================================================================= */

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AuditPage    from "./pages/AuditPage";
import PassportPage from "./pages/PassportPage";
import AssemblyPage from "./pages/AssemblyPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"             element={<Navigate to="/audit" replace />} />
        <Route path="/audit"        element={<AuditPage />} />
        <Route path="/passport/:id" element={<PassportPage />} />
        <Route path="/assembly"     element={<AssemblyPage />} />
      </Routes>
    </BrowserRouter>
  );
}
