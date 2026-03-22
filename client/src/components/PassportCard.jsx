// =============================================================================
// frontend/src/components/PassportCard.jsx
//
// SCHEMA CHANGES from backend/01_schema_and_seed.py:
//   Old flat fields -> New nested location:
//
//   state_of_health_pct          -> health_details.state_of_health_pct
//   remaining_useful_life_years  -> health_details.remaining_useful_life_years
//   cycle_count                  -> health_details.total_cycles
//   peak_temp_recorded_c         -> health_details.peak_temp_recorded_c
//   thermal_stress_flag (bool)   -> safety_risks[] array (non-empty = risks exist)
//   risk_summary (string)        -> safety_risks[].description
//   recommended_config           -> safety_workflow.target_config
//                                   OR audit_manifest.recommended_use[0]
//   eu_compliant                 -> audit_manifest.eu_compliant
//   battery_id.manufacturer      -> manufacturer.name
//   battery_id.model             -> manufacturer.model
//   battery_id.chemistry         -> manufacturer.chemistry
//   battery_id.rated_capacity_kwh-> manufacturer.nominal_capacity_kwh
//   battery_id.nominal_voltage_v -> manufacturer.nominal_voltage
//   battery_id.manufacture_year  -> manufacturer.manufacture_date (string)
//   audit_timestamp              -> health_details.audit_timestamp
//   openscad_code                -> top-level (unchanged)
//   assembly_record              -> top-level (unchanged, added by AssemblyPage)
//
// SAFETY RISKS:
//   Old: thermal_stress_flag: true + risk_summary: "string"
//   New: safety_risks: [{ risk_type, severity, description, mitigation, detected_by }]
//   Severity "High" or "Critical" = red LED. Others = amber LED.
// =============================================================================

import { useEffect, useRef, useState } from "react";

const GRADE_COLOR = {
  "A+": "#00cc44", A: "#00cc44",
  "B+": "#44bb00", B: "#44bb00",
  "C+": "#ff9900", C: "#ff9900",
  D: "#ff4400", F: "#cc0000",
};

export default function PassportCard({ manifest, passportUrl }) {
  const {
    battery_id,
    health_grade,
    manufacturer    = {},
    health_details  = {},
    telemetry_summary = {},
    safety_risks    = [],
    safety_workflow = {},
    audit_manifest  = {},
    openscad_code,
    assembly_record,
  } = manifest;

  // Health fields from health_details
  const soh      = health_details.state_of_health_pct        ?? 0;
  const rul      = health_details.remaining_useful_life_years ?? 0;
  const cycles   = health_details.total_cycles               ?? 0;
  const peakTemp = health_details.peak_temp_recorded_c       ?? 0;

  // Recommended config: safety_workflow.target_config first, then audit_manifest
  const recommendedConfig =
    safety_workflow.target_config ??
    (audit_manifest.recommended_use ?? [])[0] ??
    "Pending evaluation";

  const euCompliant = audit_manifest.eu_compliant ?? false;

  const auditTimestamp = health_details.audit_timestamp ?? audit_manifest.audit_timestamp ?? "";
  const date = auditTimestamp
    ? new Date(auditTimestamp).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    : "---";

  const gradeColor = GRADE_COLOR[health_grade] || "#888";

  return (
    <div style={S.card}>

      {/* 1. Header */}
      <div style={S.cardHeader}>
        <div className="lcd" style={S.passportId}>{battery_id}</div>
        <div style={S.euChip}>
          <div className={`led ${euCompliant ? "green" : "red"}`} />
          <span>{euCompliant ? "EU COMPLIANT" : "NON-COMPLIANT"}</span>
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
          <div style={S.sohNum}>{soh}%</div>
          <div style={S.sohLabel}>STATE OF HEALTH</div>
          <div className="progress-track" style={{ marginTop: 6 }}>
            <div className="progress-fill" style={{ width: `${soh}%` }} />
          </div>
          <div style={S.rulRow}>
            <span style={S.rulLabel}>RUL</span>
            <span style={S.rulVal}>{rul} yrs remaining</span>
          </div>
        </div>
      </div>

      <div className="divider" />

      {/* 3. Battery Identity -- from manufacturer object */}
      <Section title="BATTERY IDENTITY">
        <table style={S.table}><tbody>
          <TR k="Manufacturer" v={manufacturer.name} />
          <TR k="Model"        v={manufacturer.model} />
          <TR k="Chemistry"    v={manufacturer.chemistry} />
          <TR k="Capacity"     v={manufacturer.nominal_capacity_kwh ? manufacturer.nominal_capacity_kwh + " kWh" : "---"} />
          <TR k="Voltage"      v={manufacturer.nominal_voltage       ? manufacturer.nominal_voltage      + " V"   : "---"} />
          <TR k="Mfg date"     v={manufacturer.manufacture_date} />
          <TR k="Passport ID"  v={battery_id} mono />
        </tbody></table>
      </Section>

      <div className="divider" />

      {/* 4. Telemetry -- from health_details + telemetry_summary */}
      <Section title="TELEMETRY READINGS">
        <div style={S.metrics}>
          <Metric label="Cycles"    val={cycles} />
          <Metric label="Peak temp" val={peakTemp + "C"} warn={peakTemp > 45} />
          <Metric label="Temp mean" val={(telemetry_summary.temp_mean_c ?? 0) + "C"} warn={(telemetry_summary.temp_mean_c ?? 0) > 35} />
          <Metric label="Audited"   val={date} small />
        </div>
        {/* Gemini's written analysis -- shown if available */}
        {health_details.gemini_analysis_summary && (
          <div style={S.analysisSummary}>{health_details.gemini_analysis_summary}</div>
        )}
      </Section>

      {/* 5. Safety Risks -- replaces old thermal_stress_flag + risk_summary */}
      {safety_risks.length > 0 && (
        <>
          <div className="divider" />
          <Section title="SAFETY RISKS">
            {safety_risks.map((risk, i) => {
              const isHigh = risk.severity === "High" || risk.severity === "Critical";
              return (
                <div key={i} style={{
                  ...S.flagRow,
                  borderColor: isHigh ? "rgba(220,40,40,0.3)" : "rgba(255,153,0,0.3)",
                  background:  isHigh ? "rgba(220,40,40,0.06)" : "rgba(255,153,0,0.06)",
                  marginBottom: 4,
                }}>
                  <div className={`led ${isHigh ? "red" : "amber"}`}
                    style={{ animation: "blink 1.2s ease-in-out infinite", flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 9, fontWeight: "bold", color: isHigh ? "var(--red)" : "#885500", letterSpacing: "0.08em", marginBottom: 2 }}>
                      [{risk.severity?.toUpperCase()}] {risk.risk_type}
                    </div>
                    <div style={{ ...S.flagText, color: isHigh ? "#881111" : "#885500" }}>
                      {risk.description}
                    </div>
                    {risk.mitigation && (
                      <div style={{ fontSize: 9, color: "var(--text-dim)", marginTop: 2 }}>
                        Mitigation: {risk.mitigation}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </Section>
        </>
      )}

      <div className="divider" />

      {/* 6. Config */}
      <Section title="RECOMMENDED CONFIGURATION">
        <div className="lcd" style={S.configLcd}>{recommendedConfig}</div>
      </Section>

      <div className="divider" />

      {/* 7. OpenSCAD */}
      <OpenScadSection code={openscad_code} />

      <div className="divider" />

      {/* 8. QR */}
      {passportUrl && <QrSection url={passportUrl} />}

      {/* 9. Assembly badge -- only if assembly_record present */}
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
// =============================================================================
function AssemblyVerifiedBadge({ record }) {
  const verified    = record.verified === true;
  const ledColor    = verified ? "green" : "gray";
  const titleColor  = verified ? "var(--green)" : "var(--text-dim)";
  const bgColor     = verified ? "rgba(0,200,68,0.1)"  : "rgba(200,200,200,0.1)";
  const borderColor = verified ? "rgba(0,180,50,0.3)"  : "rgba(150,150,150,0.3)";

  const completedDate = record.completed_at
    ? new Date(record.completed_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    : "---";
  const completedTime = record.completed_at
    ? new Date(record.completed_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <Section title="DISASSEMBLY RECORD">
      <div style={{ ...S.badgeHeader, background: bgColor, borderColor }}>
        <div className={`led ${ledColor}`} style={{ flexShrink: 0 }} />
        <span style={{ ...S.badgeTitle, color: titleColor }}>
          {verified ? "DISASSEMBLY VERIFIED" : "PENDING VERIFICATION"}
        </span>
        <span style={{ ...S.badgeSteps, color: titleColor }}>
          {record.steps_completed}/{record.steps_total} STEPS
        </span>
      </div>
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
      </div>
      <div style={S.badgeStepList}>
        {(record.step_labels ?? []).map((label, i) => (
          <div key={i} style={S.badgeStep}>
            <div className={`led ${verified ? "green" : "gray"}`} style={{ width: 7, height: 7 }} />
            <span style={{ fontSize: 10 }}>{label}</span>
          </div>
        ))}
      </div>
      {!verified && (
        <div style={{ fontSize: 9, color: "var(--text-dim)", lineHeight: 1.5, fontStyle: "italic" }}>
          Verification pending. Wire PATCH /api/batteries/:id/safety (action: advance)
          in the backend to enable server-side confirmation.
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
  function copy() { navigator.clipboard.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }); }
  return (
    <Section title="3D ENCLOSURE -- OPENSCAD">
      <div style={S.scadHeader}>
        <span style={{ fontSize: 10, color: "var(--text-dim)" }}>
          {code ? "Gemini-generated enclosure for this pack geometry" : "Pending -- add generate_openscad() to backend/audit.py"}
        </span>
        {code && (
          <div style={{ display: "flex", gap: 4 }}>
            <button className="aqua-btn" style={{ fontSize: 10, padding: "2px 8px" }} onClick={copy}>{copied ? "Copied!" : "Copy"}</button>
            <button className="aqua-btn" style={{ fontSize: 10, padding: "2px 8px" }} onClick={() => setExpanded(v => !v)}>{expanded ? "Collapse" : "Expand"}</button>
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
          <span style={{ fontSize: 10, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>openscad_code not present in manifest</span>
        </div>
      )}
    </Section>
  );
}

// =============================================================================
// QrSection
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
          <div style={{ fontSize: 9, color: "var(--text-dim)", lineHeight: 1.5, marginTop: 2 }}>Placeholder -- install npm "qrcode" for real scannable QR</div>
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

const S = {
  card:          { display: "flex", flexDirection: "column", gap: 10, padding: 2 },
  cardHeader:    { display: "flex", justifyContent: "space-between", alignItems: "center" },
  passportId:    { fontSize: 12, letterSpacing: "0.08em" },
  euChip:        { display: "flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: "bold", color: "var(--text-dim)" },
  gradeRow:      { display: "flex", gap: 20, alignItems: "flex-end" },
  gradeLabel:    { fontSize: 9, color: "var(--text-dim)", letterSpacing: "0.1em", marginBottom: 2, fontWeight: "bold" },
  grade:         { fontFamily: "var(--font-mono)", fontSize: 72, fontWeight: "bold", lineHeight: 1 },
  sohBlock:      { flex: 1 },
  sohNum:        { fontSize: 28, fontWeight: "bold", fontFamily: "var(--font-mono)", lineHeight: 1 },
  sohLabel:      { fontSize: 9, color: "var(--text-dim)", fontWeight: "bold", letterSpacing: "0.1em", marginTop: 2, marginBottom: 2 },
  rulRow:        { display: "flex", alignItems: "center", gap: 6, marginTop: 4 },
  rulLabel:      { fontSize: 9, fontWeight: "bold", color: "var(--text-dim)" },
  rulVal:        { fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text)" },
  secTitle:      { fontSize: 9, fontWeight: "bold", color: "var(--text-dim)", letterSpacing: "0.12em" },
  table:         { width: "100%", borderCollapse: "collapse" },
  tdKey:         { fontSize: 11, color: "var(--text-dim)", padding: "3px 0", width: "40%", fontWeight: "bold" },
  tdVal:         { fontSize: 11, color: "var(--text)", padding: "3px 0", borderBottom: "1px solid rgba(0,0,60,0.06)" },
  metrics:       { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 },
  metricTile:    { display: "flex", flexDirection: "column", gap: 3, padding: "8px 10px" },
  metricVal:     { fontFamily: "var(--font-mono)", fontWeight: "bold" },
  metricLabel:   { fontSize: 9, color: "var(--text-dim)", fontWeight: "bold", letterSpacing: "0.08em" },
  analysisSummary:{ fontSize: 10, color: "var(--text-dim)", lineHeight: 1.6, fontStyle: "italic", padding: "6px 0" },
  flagRow:       { display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 8px", border: "1px solid", borderRadius: 2 },
  flagText:      { fontSize: 10, lineHeight: 1.5 },
  configLcd:     { fontSize: 12, letterSpacing: "0.06em" },
  scadHeader:    { display: "flex", justifyContent: "space-between", alignItems: "center" },
  scadPre:       { fontFamily: "var(--font-mono)", fontSize: 10, color: "#00ff44", background: "#0a1a08", padding: "8px", margin: 0, whiteSpace: "pre", overflowX: "auto", lineHeight: 1.5 },
  scadFade:      { position: "absolute", bottom: 0, left: 0, right: 0, height: 28, background: "linear-gradient(transparent, rgba(200,212,232,0.9))", pointerEvents: "none" },
  qrRow:         { display: "flex", gap: 14, alignItems: "flex-start" },
  qrCanvasWrap:  { flexShrink: 0, border: "1px solid rgba(0,0,60,0.15)", background: "#0a1a08", padding: 3 },
  qrLabel:       { fontSize: 9, fontWeight: "bold", color: "var(--text-dim)", letterSpacing: "0.12em" },
  badgeHeader:   { display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", border: "1px solid", borderRadius: 2 },
  badgeTitle:    { fontSize: 11, fontWeight: "bold", letterSpacing: "0.08em", flex: 1 },
  badgeSteps:    { fontSize: 10, fontFamily: "var(--font-mono)" },
  badgeMeta:     { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 },
  badgeMetaItem: { display: "flex", flexDirection: "column", gap: 2 },
  badgeMetaLabel:{ fontSize: 9, fontWeight: "bold", color: "var(--text-dim)", letterSpacing: "0.1em" },
  badgeMetaVal:  { fontSize: 11, color: "var(--text)" },
  badgeStepList: { display: "flex", flexDirection: "column", gap: 3 },
  badgeStep:     { display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: "var(--text-dim)" },
};
