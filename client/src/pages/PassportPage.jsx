// =============================================================================
// pages/PassportPage.jsx — Refined
// Changes: var(--desktop) bg, refined toolbar, ← Overview nav, cleaner shadows
// All data flow and API integration preserved.
// =============================================================================

import { useLocation, useNavigate, useParams } from "react-router-dom";
import PassportCard from "../components/PassportCard";

export default function PassportPage() {
  const { state } = useLocation();
  const { id } = useParams();
  const navigate = useNavigate();
  const manifest = state?.manifest;

  const passportUrl = manifest ? window.location.origin + "/passport/" + manifest.battery_id : null;
  const printDate = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });

  if (!manifest) {
    return (
      <div style={S.desktop}>
        <div style={S.windowWrap}>
          <div className="window" style={{ maxWidth: 400, width: "100%" }}>
            <div className="titlebar">
              <div className="traffic-lights"><div className="tl close" /><div className="tl min" /><div className="tl max" /></div>
              <div className="titlebar-title">Error — Passport Not Found</div>
            </div>
            <div style={{ padding: 24, textAlign: "center", display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 11, color: "var(--text-dim)" }}>No passport data for ID: <b>{id}</b></div>
              <div style={{ fontSize: 10, color: "var(--text-dim)" }}>Resolves once GET /api/batteries/:id/passport is live.</div>
              <button className="aqua-btn primary" onClick={() => navigate("/audit")}>Back to Audit</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const STATUS_LED = { Certified: "green", Listed: "green", "Under Review": "amber", "Disassembly Started": "amber", Sold: "gray" };
  const statusLed = STATUS_LED[manifest.status] ?? "green";
  const statusLabel = manifest.status ?? "Listed";
  const hd = manifest.health_details ?? {};
  const mfg = manifest.manufacturer ?? {};

  return (
    <div style={S.desktop}>
      <div style={S.windowWrap}>
        <div className="window" style={S.window}>
          <div className="titlebar">
            <div className="traffic-lights">
              <div className="tl close" onClick={() => navigate("/audit")} style={{ cursor: "pointer" }} />
              <div className="tl min" /><div className="tl max" />
            </div>
            <div className="titlebar-title">Battery Passport — {manifest.battery_id}</div>
          </div>

          <div style={S.toolbar} data-print="hide">
            <button className="aqua-btn" onClick={() => navigate("/")}>← Overview</button>
            <button className="aqua-btn" onClick={() => navigate("/audit")}>New Audit</button>
            <button className="aqua-btn" onClick={() => window.print()}>Print / PDF</button>
            <div style={{ flex: 1 }} />
            {manifest?.upcycle_blueprint && (
              <button className="aqua-btn" onClick={() => navigate(`/blueprint/${manifest.battery_id}`, { state: { manifest } })}>View Blueprint</button>
            )}
            <button className="aqua-btn primary" onClick={() => navigate("/assembly", { state: { manifest } })}>Start Assembly</button>
          </div>

          <div style={S.body}>
            <div style={S.sidebar} data-print="hide">
              <div className="inset-panel" style={S.sidePanel}>
                <div style={S.sidePanelTitle}>STATUS</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <div className={`led ${statusLed}`} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--green)" }}>{statusLabel.toUpperCase()}</span>
                </div>
                <div className="divider" />
                <div style={S.sideRow}><span>Grade</span><span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{manifest.health_grade}</span></div>
                <div style={S.sideRow}><span>SOH</span><span style={{ fontFamily: "var(--font-mono)" }}>{hd.state_of_health_pct}%</span></div>
                <div style={S.sideRow}><span>Cycles</span><span style={{ fontFamily: "var(--font-mono)" }}>{hd.total_cycles}</span></div>
                <div style={S.sideRow}><span>RUL</span><span style={{ fontFamily: "var(--font-mono)" }}>{hd.remaining_useful_life_years} yr</span></div>
              </div>
              <div className="inset-panel" style={{ ...S.sidePanel, marginTop: 8 }}>
                <div style={S.sidePanelTitle}>EU BATTERY REGULATION</div>
                <div style={{ fontSize: 10, color: "var(--text-dim)", lineHeight: 1.6 }}>Compliant with EU 2023/1542. Issued by ReVolt OS.</div>
              </div>
            </div>

            <div style={S.main} className="inset-panel print-no-break">
              <div className="print-doc-header">
                <div className="print-doc-header-logo">REVOLT OS</div>
                <div className="print-doc-header-sub">Digital Battery Passport | {manifest.battery_id} | Issued {printDate} | EU Battery Regulation 2023/1542{manifest.assembly_record && " | DISASSEMBLY VERIFIED"}</div>
              </div>
              <PassportCard manifest={manifest} passportUrl={passportUrl} />
              <div className="print-doc-footer">ReVolt OS Battery Passport System | {passportUrl} | Printed: {printDate}</div>
            </div>
          </div>

          <div style={S.statusBar} data-print="hide">
            <span>Passport loaded.</span>
            <span style={{ fontFamily: "var(--font-mono)" }}>{manifest.updated_at ? new Date(manifest.updated_at).toLocaleString() : ""}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const S = {
  desktop: { minHeight: "100vh", background: "var(--desktop)", display: "flex", flexDirection: "column", fontFamily: "var(--font-ui)" },
  windowWrap: { flex: 1, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "24px 16px" },
  window: { width: "100%", maxWidth: 920 },
  toolbar: { display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", background: "rgba(220,227,236,0.85)", borderBottom: "1px solid rgba(138,155,176,0.3)" },
  body: { display: "grid", gridTemplateColumns: "180px 1fr", gap: 10, padding: 12, minHeight: 480 },
  sidebar: { display: "flex", flexDirection: "column" },
  sidePanel: { padding: 10 },
  sidePanelTitle: { fontSize: 9, fontWeight: 700, color: "var(--text-dim)", letterSpacing: "0.12em", marginBottom: 6 },
  sideRow: { display: "flex", justifyContent: "space-between", fontSize: 11, padding: "3px 0", borderBottom: "1px solid rgba(138,155,176,0.12)" },
  main: { minWidth: 0, padding: 14 },
  statusBar: { display: "flex", justifyContent: "space-between", padding: "5px 12px", background: "rgba(220,227,236,0.85)", fontSize: 10, color: "var(--text-dim)", borderTop: "1px solid rgba(138,155,176,0.2)" },
};
