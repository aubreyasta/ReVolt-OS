/* =============================================================================
   pages/PassportPage.jsx -- Page 2 of 3

   PURPOSE:
     Renders the full Battery Passport for a completed audit.
     Two entry paths:
       a) From AuditPage after a successful audit -- manifest arrives via
          React Router location.state. This works immediately with no backend.
       b) Direct URL / deep-link to /passport/:id -- requires a MongoDB fetch.
          Currently shows a "Not Found" error until the fetch is wired up.

   BACKEND DEPENDENCY -- persistent passport fetch:
     Currently the manifest is read only from React Router location.state,
     which exists only during the current browser session. If the user refreshes
     or navigates directly to /passport/:id, the manifest will be null and the
     error state below will show.

     To fix this, once GET /api/batteries/:id is wired to MongoDB in main.py,
     replace the current manifest declaration with the following:

       const [manifest, setManifest] = useState(state?.manifest ?? null);
       useEffect(() => {
         if (manifest) return;  // already have it from router state, skip fetch
         fetch("/api/batteries/" + id)
           .then(r => r.ok ? r.json() : Promise.reject(r.status))
           .then(setManifest)
           .catch(() => setManifest(null));
       }, [id]);

     The QR code URL (passportUrl) will then resolve as a permanent deep-link.

   BACKEND DEPENDENCY -- live battery status:
     manifest.status is currently a static string set by audit.py ("listed").
     Once MongoDB Change Streams are wired, the STATUS panel in the sidebar
     should reflect real-time state changes:
       "listed"               --> green LED
       "disassembly_started"  --> amber LED (this status change also triggers
                                   the ElevenLabs agent session in AssemblyPage)
       "completed"            --> blue/gray LED
     To implement: expose a Server-Sent Events endpoint in FastAPI
     (e.g. GET /api/batteries/:id/status-stream) and subscribe to it here
     with an EventSource. Update a local status state variable on each event.
   ============================================================================= */

import { useLocation, useNavigate, useParams } from "react-router-dom";
import PassportCard from "../components/PassportCard";

export default function PassportPage() {
  const { state }  = useLocation();
  const { id }     = useParams();
  const navigate   = useNavigate();
  const manifest   = state?.manifest;  // See BACKEND DEPENDENCY note above

  /* passportUrl is the full public URL of this passport.
     Used for the QR code in PassportCard and shown in the sidebar.
     Becomes a real permanent link once GET /api/batteries/:id is live. */
  const passportUrl = manifest
    ? `${window.location.origin}/passport/${manifest.passport_id}`
    : null;

  /* No manifest -- either direct link before MongoDB is wired,
     or the session was lost (page refresh, etc.) */
  if (!manifest) {
    return (
      <div style={S.desktop}>
        <div style={S.windowWrap}>
          <div className="window" style={{ maxWidth: 400, width: "100%" }}>
            <div className="titlebar">
              <div className="traffic-lights">
                <div className="tl close" /><div className="tl min" /><div className="tl max" />
              </div>
              <div className="titlebar-title">Error -- Passport Not Found</div>
            </div>
            <div style={{ padding: 24, textAlign: "center", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                No passport data for ID: <b>{id}</b>
              </div>
              <div style={{ fontSize: 10, color: "var(--text-dim)" }}>
                This will resolve once GET /api/batteries/:id is wired to MongoDB.
              </div>
              <button className="aqua-btn primary" onClick={() => navigate("/audit")}>
                Back to Audit
              </button>
            </div>
          </div>
        </div>
        <Taskbar />
      </div>
    );
  }

  return (
    <div style={S.desktop}>
      <div style={S.windowWrap}>
        <div className="window" style={S.window}>

          {/* Titlebar -- close dot navigates back to /audit */}
          <div className="titlebar">
            <div className="traffic-lights">
              <div className="tl close" onClick={() => navigate("/audit")} style={{ cursor: "pointer" }} />
              <div className="tl min" />
              <div className="tl max" />
            </div>
            <div className="titlebar-title">
              Battery Passport -- {manifest.passport_id}
            </div>
          </div>

          {/* Toolbar */}
          <div style={S.toolbar}>
            <button className="aqua-btn" onClick={() => navigate("/audit")}>New Audit</button>
            {/* window.print() triggers the browser print dialog.
                The page renders cleanly for PDF export as-is. */}
            <button className="aqua-btn" onClick={() => window.print()}>Print / Export PDF</button>
            <div style={{ flex: 1 }} />
            {/* Navigates to AssemblyPage, passing manifest in router state.
                This also conceptually changes the battery status to
                "disassembly_started" -- once MongoDB is wired, this button
                should also POST a status update to /api/batteries/:id/status */}
            <button
              className="aqua-btn primary"
              onClick={() => navigate("/assembly", { state: { manifest } })}
            >
              Start Assembly
            </button>
          </div>

          <div className="divider" style={{ margin: "0 8px" }} />

          {/* Two-column body: sidebar (180px) + main passport card (flex) */}
          <div style={S.body}>

            {/* Sidebar */}
            <div style={S.sidebar}>

              {/* Status panel
                  LED colour and label are currently driven by the static
                  manifest.status field. See BACKEND DEPENDENCY note above
                  for how to make this real-time once MongoDB is wired. */}
              <div className="inset-panel" style={S.sidePanel}>
                <div style={S.sidePanelTitle}>STATUS</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <div className="led green" />
                  <span style={{ fontSize: 11, fontWeight: "bold", color: "var(--green)" }}>
                    {(manifest.status ?? "listed").toUpperCase()}
                  </span>
                </div>
                <div className="divider" />
                <div style={S.sideRow}>
                  <span>Grade</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: "bold" }}>{manifest.health_grade}</span>
                </div>
                <div style={S.sideRow}>
                  <span>SOH</span>
                  <span style={{ fontFamily: "var(--font-mono)" }}>{manifest.state_of_health_pct}%</span>
                </div>
                <div style={S.sideRow}>
                  <span>Cycles</span>
                  <span style={{ fontFamily: "var(--font-mono)" }}>{manifest.cycle_count}</span>
                </div>
                <div style={S.sideRow}>
                  <span>RUL</span>
                  <span style={{ fontFamily: "var(--font-mono)" }}>{manifest.remaining_useful_life_years} yr</span>
                </div>
              </div>

              <div className="inset-panel" style={{ ...S.sidePanel, marginTop: 8 }}>
                <div style={S.sidePanelTitle}>EU BATTERY REGULATION</div>
                <div style={{ fontSize: 10, color: "var(--text-dim)", lineHeight: 1.6 }}>
                  Compliant with EU 2023/1542.
                  Issued by ReVolt OS.
                </div>
              </div>
            </div>

            {/* Main passport card -- PassportCard handles all inner sections */}
            <div style={S.main} className="inset-panel">
              <PassportCard manifest={manifest} passportUrl={passportUrl} />
            </div>
          </div>

          <div className="divider" style={{ margin: "0 8px" }} />

          <div style={S.statusBar}>
            <span>Passport loaded successfully.</span>
            <span style={{ fontFamily: "var(--font-mono)" }}>
              {new Date(manifest.audit_timestamp).toLocaleString()}
            </span>
          </div>

        </div>
      </div>
      <Taskbar active="passport" />
    </div>
  );
}

/* Taskbar -- shared bottom bar.
   active prop highlights the current page button (pressed inset style). */
function Taskbar({ active }) {
  const navigate = useNavigate();
  return (
    <div style={S.taskbar}>
      <div style={{ display: "flex", gap: 4 }}>
        <button
          className="aqua-btn"
          style={active === "audit" ? { boxShadow: "var(--inset)" } : {}}
          onClick={() => navigate("/audit")}
        >
          ReVolt OS
        </button>
      </div>
      <div style={S.clock}>
        {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </div>
    </div>
  );
}

const S = {
  desktop:       { minHeight: "100vh", background: "linear-gradient(135deg, #5578aa 0%, #7a9cc8 50%, #4a6899 100%)", display: "flex", flexDirection: "column" },
  windowWrap:    { flex: 1, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "16px 12px 4px" },
  window:        { width: "100%", maxWidth: 900 },
  toolbar:       { display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", background: "rgba(210,225,245,0.8)" },
  body:          { display: "grid", gridTemplateColumns: "180px 1fr", gap: 8, padding: 10, minHeight: 480 },
  sidebar:       { display: "flex", flexDirection: "column" },
  sidePanel:     { padding: "8px" },
  sidePanelTitle:{ fontSize: 9, fontWeight: "bold", color: "var(--text-dim)", letterSpacing: "0.12em", marginBottom: 6 },
  sideRow:       { display: "flex", justifyContent: "space-between", fontSize: 11, padding: "3px 0", borderBottom: "1px solid rgba(0,0,60,0.06)" },
  main:          { minWidth: 0, padding: 12 },
  statusBar:     { display: "flex", justifyContent: "space-between", padding: "4px 10px", background: "rgba(200,215,235,0.8)", fontSize: 10, color: "var(--text-dim)" },
  taskbar:       { background: "linear-gradient(180deg, #3a6aaa 0%, #1a4a88 100%)", borderTop: "1px solid #6090cc", padding: "4px 10px", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 -2px 8px rgba(0,0,0,0.4)" },
  clock:         { color: "#ddeeff", fontSize: 11, fontFamily: "var(--font-mono)", background: "rgba(0,0,0,0.3)", padding: "2px 8px", borderRadius: 2 },
};
