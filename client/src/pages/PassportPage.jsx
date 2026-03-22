// =============================================================================
// frontend/src/pages/PassportPage.jsx -- Page 2 of 3
//
// CHANGES FROM PREVIOUS VERSION:
//   - Status LED now maps the new Title Case status values from the backend:
//       "Certified"           -> green
//       "Listed"              -> green
//       "Under Review"        -> amber
//       "Disassembly Started" -> amber
//       "Sold"                -> gray
//   - Passport data is read from the new nested schema:
//       manufacturer.name / model / chemistry  (was battery_id.*)
//       health_details.state_of_health_pct     (was top-level state_of_health_pct)
//       health_details.total_cycles            (was cycle_count)
//       health_details.remaining_useful_life_years (was remaining_useful_life_years)
//   - BACKEND DEPENDENCY comment updated with new endpoint paths.
//
// BACKEND DEPENDENCY -- persistent passport fetch:
//   Once GET /api/batteries/:id/passport is live on the backend, add:
//
//     const [manifest, setManifest] = useState(state?.manifest ?? null);
//     useEffect(() => {
//       if (manifest) return;
//       fetch("/api/batteries/" + id + "/passport")
//         .then(r => r.ok ? r.json() : Promise.reject(r.status))
//         .then(setManifest)
//         .catch(() => setManifest(null));
//     }, [id]);
//
//   Full document (all fields including embedding):
//     GET /api/batteries/:id
//   Passport only (lighter, no embedding):
//     GET /api/batteries/:id/passport
//
// BACKEND DEPENDENCY -- live status updates:
//   Status changes are written by PATCH /api/batteries/:id/status on the backend.
//   To make the LED update in real-time, add an EventSource subscription here
//   once the backend exposes a status stream endpoint.
// =============================================================================

import { useLocation, useNavigate, useParams } from "react-router-dom";
import PassportCard from "../components/PassportCard";

export default function PassportPage() {
  const { state }  = useLocation();
  const { id }     = useParams();
  const navigate   = useNavigate();
  const manifest   = state?.manifest;

  const passportUrl = manifest
    ? window.location.origin + "/passport/" + manifest.battery_id
    : null;

  const printDate = new Date().toLocaleDateString("en-GB", {
    day: "2-digit", month: "long", year: "numeric",
  });

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
              <div style={{ fontSize: 11, color: "var(--text-dim)" }}>No passport data for ID: <b>{id}</b></div>
              <div style={{ fontSize: 10, color: "var(--text-dim)" }}>
                Resolves once GET /api/batteries/:id/passport is live on the backend.
              </div>
              <button className="aqua-btn primary" onClick={() => navigate("/audit")}>Back to Audit</button>
            </div>
          </div>
        </div>
        <div style={S.taskbar} data-print="hide">
          <span style={{ color: "#fff", fontWeight: "bold", fontSize: 12 }}>ReVolt OS</span>
          <span style={S.clock}>{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
      </div>
    );
  }

  // Map backend status values to LED colours.
  // Backend status values (from 01_schema_and_seed.py):
  //   "Listed" | "Under Review" | "Certified" | "Sold" | "Disassembly Started"
  const STATUS_LED = {
    "Certified":           "green",
    "Listed":              "green",
    "Under Review":        "amber",
    "Disassembly Started": "amber",
    "Sold":                "gray",
  };
  const statusLed   = STATUS_LED[manifest.status] ?? "green";
  const statusLabel = manifest.status ?? "Listed";

  // Pull display values from new nested schema.
  // All field mappings are documented in manifest.mock.js.
  const hd  = manifest.health_details  ?? {};
  const mfg = manifest.manufacturer    ?? {};

  return (
    <div style={S.desktop}>
      <div style={S.windowWrap}>
        <div className="window" style={S.window}>

          <div className="titlebar">
            <div className="traffic-lights">
              <div className="tl close" onClick={() => navigate("/audit")} style={{ cursor: "pointer" }} />
              <div className="tl min" />
              <div className="tl max" />
            </div>
            <div className="titlebar-title">Battery Passport -- {manifest.battery_id}</div>
          </div>

          <div style={S.toolbar} data-print="hide">
            <button className="aqua-btn" onClick={() => navigate("/audit")}>New Audit</button>
            <button className="aqua-btn" onClick={() => window.print()}>Print / Export PDF</button>
            <div style={{ flex: 1 }} />
            <button className="aqua-btn primary" onClick={() => navigate("/assembly", { state: { manifest } })}>
              Start Assembly
            </button>
          </div>

          <div className="divider" style={{ margin: "0 8px" }} data-print="hide" />

          <div style={S.body}>

            {/* Sidebar -- hidden in print */}
            <div style={S.sidebar} data-print="hide">
              <div className="inset-panel" style={S.sidePanel}>
                <div style={S.sidePanelTitle}>STATUS</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <div className={`led ${statusLed}`} />
                  <span style={{ fontSize: 11, fontWeight: "bold", color: "var(--green)" }}>
                    {statusLabel.toUpperCase()}
                  </span>
                </div>
                <div className="divider" />
                {/* Values from new nested schema */}
                <div style={S.sideRow}><span>Grade</span><span style={{ fontFamily: "var(--font-mono)", fontWeight: "bold" }}>{manifest.health_grade}</span></div>
                <div style={S.sideRow}><span>SOH</span><span style={{ fontFamily: "var(--font-mono)" }}>{hd.state_of_health_pct}%</span></div>
                <div style={S.sideRow}><span>Cycles</span><span style={{ fontFamily: "var(--font-mono)" }}>{hd.total_cycles}</span></div>
                <div style={S.sideRow}><span>RUL</span><span style={{ fontFamily: "var(--font-mono)" }}>{hd.remaining_useful_life_years} yr</span></div>
              </div>
              <div className="inset-panel" style={{ ...S.sidePanel, marginTop: 8 }}>
                <div style={S.sidePanelTitle}>EU BATTERY REGULATION</div>
                <div style={{ fontSize: 10, color: "var(--text-dim)", lineHeight: 1.6 }}>
                  Compliant with EU 2023/1542. Issued by ReVolt OS.
                </div>
              </div>
            </div>

            {/* Main card */}
            <div style={S.main} className="inset-panel print-no-break">
              <div className="print-doc-header">
                <div className="print-doc-header-logo">REVOLT OS</div>
                <div className="print-doc-header-sub">
                  Digital Battery Passport &nbsp;|&nbsp; {manifest.battery_id}
                  &nbsp;|&nbsp; Issued {printDate}
                  &nbsp;|&nbsp; EU Battery Regulation 2023/1542
                  {manifest.assembly_record && " | DISASSEMBLY VERIFIED"}
                </div>
              </div>

              <PassportCard manifest={manifest} passportUrl={passportUrl} />

              <div className="print-doc-footer">
                ReVolt OS Battery Passport System
                &nbsp;&nbsp;|&nbsp;&nbsp;
                {passportUrl}
                &nbsp;&nbsp;|&nbsp;&nbsp;
                Printed: {printDate}
              </div>
            </div>
          </div>

          <div className="divider" style={{ margin: "0 8px" }} data-print="hide" />
          <div style={S.statusBar} data-print="hide">
            <span>Passport loaded.</span>
            <span style={{ fontFamily: "var(--font-mono)" }}>
              {manifest.updated_at ? new Date(manifest.updated_at).toLocaleString() : ""}
            </span>
          </div>

        </div>
      </div>

      <div style={S.taskbar} data-print="hide">
        <div style={{ display: "flex", gap: 4 }}>
          <button className="aqua-btn" onClick={() => navigate("/audit")}>ReVolt OS</button>
        </div>
        <div style={S.clock}>
          {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
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
