// =============================================================================
// components/PassportCard.jsx -- Reusable Battery Passport display card
//
// PROPS:
//   manifest    {object} -- Full manifest JSON from the audit pipeline.
//   passportUrl {string} -- Full URL of this passport page, used for QR display.
//
// SECTIONS (in render order):
//   1. Header         -- passport_id LCD + EU compliance chip
//   2. Grade + SOH    -- large health grade letter + SOH bar + RUL
//   3. Battery ID     -- table from battery_id (populated by Gemini Vision)
//   4. Telemetry      -- 2x2 metric tiles
//   5. Thermal flag   -- amber banner (only if thermal_stress_flag = true)
//   6. Config         -- recommended_config in LCD style
//   7. OpenSCAD       -- 3D enclosure code block (see BACKEND DEPENDENCY below)
//   8. QR Code        -- canvas placeholder (swap with "qrcode" npm package)
//   9. Assembly badge -- shown only if manifest.assembly_record exists.
//                        Populated when technician clicks "Complete Assembly"
//                        in AssemblyPage.jsx and navigates back here.
//                        Shows green "VERIFIED" if assembly_record.verified = true
//                        (set by backend), gray "PENDING VERIFICATION" if false.
//
// BACKEND DEPENDENCY -- manifest.openscad_code:
//   Add generate_openscad() call in build_full_manifest() in server/audit.py.
//   Store result as full_manifest["openscad_code"] = response.text.strip()
//
// BACKEND DEPENDENCY -- assembly_record.verified:
//   Set by POST /api/batteries/:id/complete-assembly in server/main.py.
//   When the backend signs/verifies the record it returns { verified: true }.
//   Until that endpoint exists, verified is false (unverified state shown).
// =============================================================================

import { useEffect, useRef, useState } from "react";

const GRADE_COLOR = { A: "#00cc44", B: "#44bb00", C: "#ff9900", D: "#ff4400", F: "#cc0000" };

export default function PassportCard({ manifest, passportUrl }) {
  const {
    passport_id, health_grade, state_of_health_pct, remaining_useful_life_years,
    cycle_count, peak_temp_recorded_c, fast_charge_ratio_pct, thermal_stress_flag,
    recommended_config, risk_summary, eu_compliant, battery_id, audit_timestamp,
    openscad_code, assembly_record,
  } = manifest;

  const gradeColor = GRADE_COLOR[health_grade] || "#888";
  const date = new Date(audit_timestamp).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });

  return (
    <div style={S.card}>

      {/* 1. Header */}
      <div style={S.cardHeader}>
        <div className="lcd" style={S.passportId}>{passport_id}</div>
        <div style={S.euChip}>
          <div className={`led ${eu_compliant ? "green" : "red"}`} />
          <span>{eu_compliant ? "EU COMPLIANT" : "NON-COMPLIANT"}</span>
        </div>
      </div>

      {/* 2. Grade + SOH */}
      <div style={S.gradeRow}>
        <div>
          <div style={S.gradeLabel}>HEALTH GRADE</div>
          <div style={{ ...S.grade, color: gradeColor, textShadow: `0 0 20px ${gradeColor}88` }}>
            {health_grade}
          </div>
        </div>
        <div style={S.sohBlock}>
          <div style={S.sohNum}>{state_of_health_pct}%</div>
          <div style={S.sohLabel}>STATE OF HEALTH</div>
          <div className="progress-track" style={{ marginTop: 6 }}>
            <div className="progress-fill" style={{ width: `${state_of_health_pct}%` }} />
          </div>
          <div style={S.rulRow}>
            <span style={S.rulLabel}>RUL</span>
            <span style={S.rulVal}>{remaining_useful_life_years} yrs remaining</span>
          </div>
        </div>
      </div>

      <div className="divider" />

      {/* 3. Battery Identity */}
      <Section title="BATTERY IDENTITY">
        <table style={S.table}><tbody>
          <TR k="Manufacturer" v={battery_id?.manufacturer} />
          <TR k="Model"        v={battery_id?.model} />
          <TR k="Chemistry"    v={battery_id?.chemistry} />
          <TR k="Capacity"     v={battery_id?.rated_capacity_kwh ? battery_id.rated_capacity_kwh + " kWh" : "---"} />
          <TR k="Voltage"      v={battery_id?.nominal_voltage_v  ? battery_id.nominal_voltage_v  + " V"   : "---"} />
          <TR k="Year"         v={battery_id?.manufacture_year} />
          <TR k="Serial"       v={battery_id?.serial_number} mono />
        </tbody></table>
      </Section>

      <div className="divider" />

      {/* 4. Telemetry */}
      <Section title="TELEMETRY READINGS">
        <div style={S.metrics}>
          <Metric label="Cycles"      val={cycle_count} />
          <Metric label="Peak temp"   val={peak_temp_recorded_c + "C"}  warn={peak_temp_recorded_c > 50} />
          <Metric label="Fast charge" val={fast_charge_ratio_pct + "%"} warn={fast_charge_ratio_pct > 60} />
          <Metric label="Audited"     val={date} small />
        </div>
      </Section>

      {/* 5. Thermal flag */}
      {thermal_stress_flag && (
        <>
          <div className="divider" />
          <div style={S.flagRow}>
            <div className="led amber" style={{ animation: "blink 1.2s ease-in-out infinite", flexShrink: 0 }} />
            <span style={S.flagText}>{risk_summary}</span>
          </div>
        </>
      )}

      <div className="divider" />

      {/* 6. Config */}
      <Section title="RECOMMENDED CONFIGURATION">
        <div className="lcd" style={S.configLcd}>{recommended_config}</div>
      </Section>

      <div className="divider" />

      {/* 7. OpenSCAD */}
      <OpenScadSection code={openscad_code} />

      <div className="divider" />

      {/* 8. QR */}
      {passportUrl && <QrSection url={passportUrl} />}

      {/* 9. Assembly badge -- only rendered after assembly is completed.
          assembly_record is attached to the manifest by AssemblyPage.jsx
          when the technician clicks "Complete Assembly". */}
      {assembly_record && (
        <>
          <div className="divider" />
          <AssemblyVerifiedBadge record={assembly_record} />
        </>
      )}

    </div>
  );
}

// =============================================================================
// AssemblyVerifiedBadge
//
// A purely visual badge. No hashing, no crypto -- that is entirely the
// backend's responsibility.
//
// What it reads from assembly_record:
//   verified        {boolean} -- set by POST /api/batteries/:id/complete-assembly
//                                true  --> green "DISASSEMBLY VERIFIED" badge
//                                false --> gray "PENDING VERIFICATION" badge
//                                         (shown when backend is not yet wired)
//   signed_by       {string}  -- e.g. "revolt-os-server", shown under verified badge
//   steps_completed {number}  -- e.g. 6
//   steps_total     {number}  -- e.g. 6
//   completed_at    {string}  -- ISO timestamp
//   step_labels     {string[]}-- list of completed step label strings
//
// BACKEND NOTE:
//   To make verified: true, add this endpoint to server/main.py:
//
//     @app.post("/api/batteries/{passport_id}/complete-assembly")
//     def complete_assembly(passport_id: str, body: dict):
//         # Save to MongoDB, sign/hash the record, return verified: true
//         return { **body, "verified": True, "signed_by": "revolt-os-server" }
//
//   The frontend requires no changes when this endpoint goes live --
//   AssemblyPage already calls it and merges the response into the record.
// =============================================================================
function AssemblyVerifiedBadge({ record }) {
  const verified   = record.verified === true;
  const ledColor   = verified ? "green" : "gray";
  const titleColor = verified ? "var(--green)" : "var(--text-dim)";
  const bgColor    = verified ? "rgba(0,200,68,0.1)"  : "rgba(200,200,200,0.1)";
  const borderColor= verified ? "rgba(0,180,50,0.3)"  : "rgba(150,150,150,0.3)";

  const completedDate = new Date(record.completed_at).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
  const completedTime = new Date(record.completed_at).toLocaleTimeString([], {
    hour: "2-digit", minute: "2-digit",
  });

  return (
    <Section title="DISASSEMBLY RECORD">

      {/* Status header bar */}
      <div style={{ ...S.badgeHeader, background: bgColor, borderColor }}>
        <div className={`led ${ledColor}`} style={{ flexShrink: 0 }} />
        <span style={{ ...S.badgeTitle, color: titleColor }}>
          {verified ? "DISASSEMBLY VERIFIED" : "PENDING VERIFICATION"}
        </span>
        <span style={{ ...S.badgeSteps, color: titleColor }}>
          {record.steps_completed}/{record.steps_total} STEPS
        </span>
      </div>

      {/* Metadata */}
      <div style={S.badgeMeta}>
        <div style={S.badgeMetaItem}>
          <span style={S.badgeMetaLabel}>Completed</span>
          <span style={S.badgeMetaVal}>{completedDate} {completedTime}</span>
        </div>
        {verified && record.signed_by && (
          <div style={S.badgeMetaItem}>
            <span style={S.badgeMetaLabel}>Verified by</span>
            <span style={{ ...S.badgeMetaVal, fontFamily: "var(--font-mono)" }}>{record.signed_by}</span>
          </div>
        )}
        {!verified && (
          <div style={S.badgeMetaItem}>
            <span style={S.badgeMetaLabel}>Status</span>
            <span style={{ ...S.badgeMetaVal, color: "var(--text-dim)" }}>
              Awaiting backend verification
            </span>
          </div>
        )}
      </div>

      {/* Completed steps list */}
      <div style={S.badgeStepList}>
        {(record.step_labels ?? []).map((label, i) => (
          <div key={i} style={S.badgeStep}>
            <div className={`led ${verified ? "green" : "gray"}`} style={{ width: 7, height: 7, flexShrink: 0 }} />
            <span style={{ fontSize: 10 }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Unverified note -- hidden once backend is wired */}
      {!verified && (
        <div style={{ fontSize: 9, color: "var(--text-dim)", lineHeight: 1.5, fontStyle: "italic" }}>
          Verification pending. Wire POST /api/batteries/:id/complete-assembly
          in server/main.py to enable server-side signing.
        </div>
      )}

    </Section>
  );
}

// =============================================================================
// OpenScadSection
// =============================================================================
function OpenScadSection({ code }) {
  const [expanded, setExpanded] = useState(false);
  const [copied,   setCopied]   = useState(false);

  function copy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <Section title="3D ENCLOSURE -- OPENSCAD">
      <div style={S.scadHeader}>
        <span style={{ fontSize: 10, color: "var(--text-dim)" }}>
          {code
            ? "Gemini-generated enclosure for this pack geometry"
            : "Pending -- requires openscad_code in manifest (see server/audit.py)"}
        </span>
        {code && (
          <div style={{ display: "flex", gap: 4 }}>
            <button className="aqua-btn" style={{ fontSize: 10, padding: "2px 8px" }} onClick={copy}>
              {copied ? "Copied!" : "Copy"}
            </button>
            <button className="aqua-btn" style={{ fontSize: 10, padding: "2px 8px" }} onClick={() => setExpanded(v => !v)}>
              {expanded ? "Collapse" : "Expand"}
            </button>
          </div>
        )}
      </div>
      {code ? (
        <div style={{ position: "relative" }}>
          <div className="inset-panel" style={{ padding: 0, maxHeight: expanded ? 400 : 72, overflow: expanded ? "auto" : "hidden", transition: "max-height 0.25s ease" }}>
            <pre style={S.scadPre}>{code}</pre>
          </div>
          {!expanded && <div style={S.scadFade} />}
        </div>
      ) : (
        <div className="inset-panel" style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px" }}>
          <div className="led gray" />
          <span style={{ fontSize: 10, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
            openscad_code not present in manifest
          </span>
        </div>
      )}
    </Section>
  );
}

// =============================================================================
// QrSection -- canvas placeholder, swap with "npm install qrcode" when ready.
// Replace the useEffect body with:
//   import QRCode from "qrcode";
//   QRCode.toCanvas(canvas, url, { width: 96, margin: 1,
//     color: { dark: "#00ff44", light: "#0a1a08" } });
// =============================================================================
function QrSection({ url }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const size = 96, cell = 6, cols = Math.floor(size / cell);
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0a1a08"; ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#00ff44";
    for (let r = 0; r < cols; r++)
      for (let c = 0; c < cols; c++) {
        const ch = url.charCodeAt((r * cols + c) % url.length) || 0;
        if ((ch ^ (r * 3 + c * 7)) % 3 === 0) ctx.fillRect(c * cell + 1, r * cell + 1, cell - 1, cell - 1);
      }
    [[0,0],[cols-3,0],[0,cols-3]].forEach(([cx,cy]) => {
      ctx.fillStyle = "#00ff44"; ctx.fillRect(cx*cell, cy*cell, cell*3, cell*3);
      ctx.fillStyle = "#0a1a08"; ctx.fillRect(cx*cell+cell, cy*cell+cell, cell, cell);
    });
  }, [url]);
  return (
    <Section title="SCAN -- DIGITAL PASSPORT">
      <div style={S.qrRow}>
        <div style={S.qrCanvasWrap}>
          <canvas ref={canvasRef} style={{ imageRendering: "pixelated", display: "block", width: 96, height: 96 }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
          <div style={S.qrLabel}>PASSPORT URL</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, wordBreak: "break-all", color: "var(--text-dim)" }}>{url}</div>
          <div style={{ fontSize: 9, color: "var(--text-dim)", lineHeight: 1.5, marginTop: 2 }}>
            Placeholder shown -- install npm "qrcode" for real scannable QR
          </div>
        </div>
      </div>
    </Section>
  );
}

// =============================================================================
// Shared sub-components
// =============================================================================
function Section({ title, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={S.secTitle}>{title}</div>
      {children}
    </div>
  );
}
function TR({ k, v, mono }) {
  return (
    <tr>
      <td style={S.tdKey}>{k}</td>
      <td style={{ ...S.tdVal, fontFamily: mono ? "var(--font-mono)" : "inherit" }}>{v || "---"}</td>
    </tr>
  );
}
function Metric({ label, val, warn, small }) {
  return (
    <div className="inset-panel" style={S.metricTile}>
      <div style={{ ...S.metricVal, color: warn ? "var(--amber)" : "var(--text)", fontSize: small ? 12 : 18 }}>{val}</div>
      <div style={S.metricLabel}>{label}</div>
    </div>
  );
}

// =============================================================================
// Styles
// =============================================================================
const S = {
  card:         { display: "flex", flexDirection: "column", gap: 10, padding: 2 },
  cardHeader:   { display: "flex", justifyContent: "space-between", alignItems: "center" },
  passportId:   { fontSize: 12, letterSpacing: "0.08em" },
  euChip:       { display: "flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: "bold", color: "var(--text-dim)" },
  gradeRow:     { display: "flex", gap: 20, alignItems: "flex-end" },
  gradeLabel:   { fontSize: 9, color: "var(--text-dim)", letterSpacing: "0.1em", marginBottom: 2, fontWeight: "bold" },
  grade:        { fontFamily: "var(--font-mono)", fontSize: 72, fontWeight: "bold", lineHeight: 1 },
  sohBlock:     { flex: 1 },
  sohNum:       { fontSize: 28, fontWeight: "bold", fontFamily: "var(--font-mono)", lineHeight: 1 },
  sohLabel:     { fontSize: 9, color: "var(--text-dim)", fontWeight: "bold", letterSpacing: "0.1em", marginTop: 2, marginBottom: 2 },
  rulRow:       { display: "flex", alignItems: "center", gap: 6, marginTop: 4 },
  rulLabel:     { fontSize: 9, fontWeight: "bold", color: "var(--text-dim)" },
  rulVal:       { fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text)" },
  secTitle:     { fontSize: 9, fontWeight: "bold", color: "var(--text-dim)", letterSpacing: "0.12em" },
  table:        { width: "100%", borderCollapse: "collapse" },
  tdKey:        { fontSize: 11, color: "var(--text-dim)", padding: "3px 0", width: "40%", fontWeight: "bold" },
  tdVal:        { fontSize: 11, color: "var(--text)", padding: "3px 0", borderBottom: "1px solid rgba(0,0,60,0.06)" },
  metrics:      { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 },
  metricTile:   { display: "flex", flexDirection: "column", gap: 3, padding: "8px 10px" },
  metricVal:    { fontFamily: "var(--font-mono)", fontWeight: "bold" },
  metricLabel:  { fontSize: 9, color: "var(--text-dim)", fontWeight: "bold", letterSpacing: "0.08em" },
  flagRow:      { display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 8px", background: "rgba(255,153,0,0.1)", border: "1px solid rgba(255,153,0,0.3)", borderRadius: 2 },
  flagText:     { fontSize: 10, color: "#885500", lineHeight: 1.5 },
  configLcd:    { fontSize: 12, letterSpacing: "0.06em" },
  scadHeader:   { display: "flex", justifyContent: "space-between", alignItems: "center" },
  scadPre:      { fontFamily: "var(--font-mono)", fontSize: 10, color: "#00ff44", background: "#0a1a08", padding: "8px", margin: 0, whiteSpace: "pre", overflowX: "auto", lineHeight: 1.5 },
  scadFade:     { position: "absolute", bottom: 0, left: 0, right: 0, height: 28, background: "linear-gradient(transparent, rgba(200,212,232,0.9))", pointerEvents: "none" },
  qrRow:        { display: "flex", gap: 14, alignItems: "flex-start" },
  qrCanvasWrap: { flexShrink: 0, border: "1px solid rgba(0,0,60,0.15)", background: "#0a1a08", padding: 3 },
  qrLabel:      { fontSize: 9, fontWeight: "bold", color: "var(--text-dim)", letterSpacing: "0.12em" },
  // Assembly badge
  badgeHeader:  { display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", border: "1px solid", borderRadius: 2 },
  badgeTitle:   { fontSize: 11, fontWeight: "bold", letterSpacing: "0.08em", flex: 1 },
  badgeSteps:   { fontSize: 10, fontFamily: "var(--font-mono)" },
  badgeMeta:    { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 },
  badgeMetaItem:{ display: "flex", flexDirection: "column", gap: 2 },
  badgeMetaLabel:{ fontSize: 9, fontWeight: "bold", color: "var(--text-dim)", letterSpacing: "0.1em" },
  badgeMetaVal: { fontSize: 11, color: "var(--text)" },
  badgeStepList:{ display: "flex", flexDirection: "column", gap: 3 },
  badgeStep:    { display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "var(--text-dim)" },
};
