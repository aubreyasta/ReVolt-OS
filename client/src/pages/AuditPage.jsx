/* =============================================================================
   pages/AuditPage.jsx
   
   Modernized audit page in our refined macOS-chrome style.
   Changes from original:
   - ⚡ Generate Random Telemetry button (creates synthetic CSV + auto-loads)
   - Accepts demoFiles from LandingPage via location.state
   - Refined styling (Inter font, cleaner shadows, modern feel)
   - Navigate back to landing page via close button
   - All API integration preserved (POST /api/audit, mock fallback)
   ============================================================================= */

import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { MOCK_MANIFEST, USE_MOCK } from "../mocks/manifest.mock";
import BatteryCellDiagram from "../components/BatteryCellDiagram";

const LOADING_STEPS = [
  "Initializing Gemini Vision...",
  "Parsing telemetry data...",
  "Running health audit + embedding...",
  "Comparing failure state library...",
  "Saving to MongoDB + building passport...",
];

const ZONE_H = 260;

/* ── Telemetry generator profiles ── */
const PROFILES = [
  { name: "Bay Area Commuter", grade: "A-B", cycles: [150,400], soh: [88,97], tempCeil: 38, vBase: 3.7 },
  { name: "Fleet Delivery Van", grade: "B-C", cycles: [400,800], soh: [78,88], tempCeil: 45, vBase: 3.2 },
  { name: "Weekend Warrior", grade: "A", cycles: [100,250], soh: [92,98], tempCeil: 35, vBase: 3.7 },
  { name: "Texas Rideshare", grade: "C-D", cycles: [800,1400], soh: [65,78], tempCeil: 52, vBase: 3.7 },
  { name: "Arizona Abuser", grade: "F", cycles: [1200,2000], soh: [50,65], tempCeil: 68, vBase: 3.7 },
  { name: "Nordic Fleet Bus", grade: "B-C", cycles: [600,1200], soh: [72,82], tempCeil: 42, vBase: 3.2 },
];

function generateTelemetryCsv() {
  const prof = PROFILES[Math.floor(Math.random() * PROFILES.length)];
  const cycles = Math.floor(Math.random() * (prof.cycles[1] - prof.cycles[0]) + prof.cycles[0]);
  const numRows = Math.floor(Math.random() * 40 + 35);
  const headers = "timestamp,voltage_v,current_a,temp_c,soc_pct,cycle_count";
  const rows = [];
  let soc = 95 + Math.random() * 3;
  for (let i = 0; i < numRows; i++) {
    const day = Math.floor(i / 4) + 1;
    const hour = (i % 4) * 6;
    const ts = `2024-03-${String(day).padStart(2,"0")} ${String(hour).padStart(2,"0")}:00:00`;
    const charging = i % 8 < 3;
    const current = charging ? -(15 + Math.random() * 10) : (20 + Math.random() * 15);
    const temp = 22 + (Math.random() * (prof.tempCeil - 22) * 0.6) + (Math.abs(current) * 0.15);
    const vNoise = (Math.random() - 0.5) * 0.04;
    const voltage = prof.vBase + (soc / 100 * 0.35) + vNoise;
    soc += charging ? (Math.random() * 4) : -(Math.random() * 3 + 1);
    soc = Math.max(15, Math.min(98, soc));
    rows.push(`${ts},${voltage.toFixed(3)},${current.toFixed(1)},${temp.toFixed(1)},${soc.toFixed(0)},${cycles + Math.floor(i/4)}`);
  }
  return {
    content: [headers, ...rows].join("\n"),
    profile: prof.name,
    numRows,
  };
}

export default function AuditPage() {
  const [image, setImage] = useState(null);
  const [csv, setCsv] = useState(null);
  const [imagePrev, setImagePrev] = useState(null);
  const [csvPreview, setCsvPreview] = useState(null);
  const [step, setStep] = useState(0);
  const [error, setError] = useState(null);
  const [genMsg, setGenMsg] = useState(null);
  const [auditResult, setAuditResult] = useState(null); // stores result after audit

  const imageRef = useRef();
  const csvRef = useRef();
  const navigate = useNavigate();
  const location = useLocation();

  // Handle demo files from LandingPage
  useEffect(() => {
    const demo = location.state?.demoFiles;
    if (!demo) return;
    if (demo.imageFile) {
      setImage(demo.imageFile);
      setImagePrev(demo.imagePreview);
    }
    if (demo.csvFile) {
      setCsv(demo.csvFile);
      if (demo.csvHeaders && demo.csvRows) {
        setCsvPreview({ headers: demo.csvHeaders, rows: demo.csvRows, total: 40 });
      }
    }
    // Clear the state so refresh doesn't re-trigger
    window.history.replaceState({}, document.title);
  }, [location.state]);

  function onImage(e) {
    const f = e.target.files[0]; if (!f) return;
    setImage(f); setImagePrev(URL.createObjectURL(f));
  }

  function onCsv(e) {
    const f = e.target.files[0]; if (!f) return;
    setCsv(f);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const lines = evt.target.result.trim().split("\n").filter(Boolean);
      if (!lines.length) return;
      setCsvPreview({
        headers: lines[0].split(",").map(h => h.trim()),
        rows: lines.slice(1, 6).map(l => l.split(",").map(c => c.trim())),
        total: lines.length - 1,
      });
    };
    reader.readAsText(f);
  }

  function generateTelemetry() {
    const { content, profile, numRows } = generateTelemetryCsv();
    const file = new File([content], `random_${profile.replace(/ /g,"_").toLowerCase()}.csv`, { type: "text/csv" });
    setCsv(file);
    const lines = content.split("\n");
    setCsvPreview({
      headers: lines[0].split(",").map(h => h.trim()),
      rows: lines.slice(1, 6).map(l => l.split(",").map(c => c.trim())),
      total: lines.length - 1,
    });
    setGenMsg(`Generated "${profile}" — ${numRows} rows`);
    setTimeout(() => setGenMsg(null), 3000);
  }

  async function submit() {
    if (!csv) { setError("CSV file required."); return; }
    setError(null);

    if (USE_MOCK) {
      for (let i = 1; i <= 5; i++) { setStep(i); await new Promise(r => setTimeout(r, 900)); }
      setAuditResult(MOCK_MANIFEST);
      setStep(0);
      return;
    }

    setStep(1);
    const t1 = setTimeout(() => setStep(2), 5000);
    const t2 = setTimeout(() => setStep(3), 20000);
    const t3 = setTimeout(() => setStep(4), 45000);

    try {
      const form = new FormData();
      if (image) form.append("image", image);
      form.append("csv_file", csv);
      const res = await fetch("/api/audit", { method: "POST", body: form });
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      setStep(5);
      const data = await res.json();
      setAuditResult(data);
      setStep(0);
    } catch (err) {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
      setError(err.message); setStep(0);
    }
  }

  const busy = step > 0;
  const ready = !!csv;

  return (
    <div style={S.desktop}>
      <div style={S.windowWrap}>
        <div className="window" style={S.window}>
          <div className="titlebar">
            <div className="traffic-lights">
              <div className="tl close" onClick={() => navigate("/")} style={{ cursor: "pointer" }} />
              <div className="tl min" /><div className="tl max" />
            </div>
            <div className="titlebar-title">ReVolt OS — Battery Audit System v2.6</div>
          </div>

          <div style={S.toolbar}>
            <button className="aqua-btn" onClick={() => navigate("/")}>← Overview</button>
            <div style={S.toolbarSep} />
            <div style={S.addressBar}>
              <span style={S.addressLabel}>Location:</span>
              <span style={S.addressVal}>revolt://audit/new</span>
            </div>
          </div>

          <div style={S.body}>
            {busy ? (
              <LoadingPanel step={step} />
            ) : auditResult ? (
              <AuditResultPanel
                result={auditResult}
                onViewPassport={() =>
                  navigate(
                    auditResult.battery_id === "RVX-2024-00001"
                      ? "/passport/mock"
                      : `/passport/${auditResult.battery_id}`,
                    { state: { manifest: auditResult } }
                  )
                }
                onRunAnother={() => {
                  setAuditResult(null);
                  setImage(null); setCsv(null); setImagePrev(null);
                  setCsvPreview(null); setError(null);
                }}
              />
            ) : (
              <>
                <div style={S.uploadRow}>
                  <DropZone
                    label="Battery Sticker Image"
                    hint="JPG or PNG of the physical label"
                    accept="image/*"
                    file={image} preview={imagePrev}
                    inputRef={imageRef} onChange={onImage}
                    emptyContent={<EmptyImagePlaceholder />}
                  />
                  <DropZone
                    label="Telemetry CSV"
                    hint="Cycle log: voltage, temp, current"
                    accept=".csv,text/csv"
                    file={csv} csvPreview={csvPreview}
                    inputRef={csvRef} onChange={onCsv}
                    emptyContent={<EmptyCsvPlaceholder />}
                  />
                </div>

                {error && <div style={S.errorBox}>⚠ {error}</div>}
                {genMsg && <div style={S.genMsg}>⚡ {genMsg}</div>}

                <div style={S.statusRow}>
                  <StatusItem label="Image" ok={!!image} val={image?.name || "No file selected"} />
                  <StatusItem label="CSV" ok={!!csv} val={csv?.name || "No file selected"} />
                </div>
              </>
            )}
          </div>

          <div style={S.bottomBar}>
            <div style={S.statusMsg}>
              {busy
                ? `Processing... step ${step}/5`
                : auditResult
                ? `Audit complete — ${auditResult.battery_id}`
                : ready
                ? "Ready to run audit."
                : "Select files to continue."}
            </div>
            {!auditResult && (
              <div style={{ display: "flex", gap: 6 }}>
                <button className="aqua-btn" onClick={generateTelemetry} disabled={busy}
                  style={{ background: "linear-gradient(180deg, #fef3cd, #f7dc6f)", borderColor: "#d4ac0d", color: "#7d6608" }}>
                  ⚡ Generate Telemetry
                </button>
                <button className="aqua-btn" onClick={() => { setImage(null); setCsv(null); setImagePrev(null); setCsvPreview(null); setError(null); setGenMsg(null); }}>
                  Clear
                </button>
                <button className="aqua-btn primary" onClick={submit} disabled={!ready || busy}>
                  Run Audit
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ── */

function EmptyImagePlaceholder() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, opacity: 0.4 }}>
      <span style={{ fontSize: 28 }}>🖼</span>
      <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-dim)", textAlign: "center", lineHeight: 1.6 }}>
        Upload a photo of the<br />battery sticker label
      </div>
    </div>
  );
}

function EmptyCsvPlaceholder() {
  const fH = ["timestamp", "voltage_v", "temp_c", "soc_pct"];
  const fR = [["lorem-01 00:00","---","---","---"],["lorem-01 00:05","---","---","---"],["lorem-01 00:10","---","---","---"]];
  return (
    <div style={{ width: "100%", opacity: 0.35 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9, fontFamily: "var(--font-mono)" }}>
        <thead><tr>
          {fH.map((h,i) => <th key={i} style={{ background: "linear-gradient(180deg, var(--aqua-blue), #1a4a80)", color: "#fff", padding: "3px 6px", textAlign: "left", fontSize: 8, fontWeight: 600 }}>{h}</th>)}
        </tr></thead>
        <tbody>
          {fR.map((row,ri) => <tr key={ri} style={{ background: ri%2===0 ? "rgba(255,255,255,0.4)" : "rgba(200,218,240,0.3)" }}>
            {row.map((cell,ci) => <td key={ci} style={{ color: "var(--text-dim)", padding: "3px 6px", fontSize: 9, borderBottom: "1px solid rgba(138,155,176,0.15)" }}>{cell}</td>)}
          </tr>)}
        </tbody>
      </table>
      <div style={{ fontSize: 9, color: "var(--text-dim)", marginTop: 4, fontFamily: "var(--font-mono)", textAlign: "center" }}>telemetry data preview</div>
    </div>
  );
}

function DropZone({ label, hint, accept, file, preview, csvPreview, inputRef, onChange, emptyContent }) {
  const [hover, setHover] = useState(false);
  return (
    <div className="inset-panel"
      style={{ display: "flex", flexDirection: "column", gap: 6, padding: 12, height: ZONE_H, background: hover ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.45)", cursor: "pointer", transition: "background 0.15s", overflow: "hidden" }}
      onClick={() => inputRef.current.click()}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <input ref={inputRef} type="file" accept={accept} style={{ display: "none" }} onChange={onChange} />
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{label}</div>
      <div style={{ fontSize: 10, color: "var(--text-dim)" }}>{hint}</div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", minHeight: 0 }}>
        {preview ? <img src={preview} alt="preview" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "var(--radius-sm)", border: "1px solid var(--win-border)" }} />
        : csvPreview ? <CsvPreviewTable preview={csvPreview} />
        : emptyContent}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-dim)", flexShrink: 0 }} onClick={e => file && e.stopPropagation()}>
        <div className={`led ${file ? "green" : "gray"}`} />
        {file ? file.name : "Click to browse..."}
      </div>
    </div>
  );
}

function CsvPreviewTable({ preview }) {
  const { headers, rows, total } = preview;
  return (
    <div style={{ width: "100%", overflow: "hidden" }} onClick={e => e.stopPropagation()}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, fontFamily: "var(--font-mono)", tableLayout: "fixed" }}>
        <thead><tr>
          {headers.map((h,i) => <th key={i} style={{ background: "linear-gradient(180deg, var(--aqua-blue), #1a4a80)", color: "#fff", padding: "4px 6px", textAlign: "left", fontWeight: 600, fontSize: 9, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{h}</th>)}
        </tr></thead>
        <tbody>
          {rows.map((row,ri) => <tr key={ri} style={{ background: ri%2===0 ? "rgba(255,255,255,0.55)" : "rgba(200,218,240,0.35)" }}>
            {row.map((cell,ci) => <td key={ci} style={{ color: "var(--text)", padding: "3px 6px", borderBottom: "1px solid rgba(138,155,176,0.15)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: 10 }}>{cell}</td>)}
          </tr>)}
        </tbody>
      </table>
      {total > 5 && <div style={{ fontSize: 9, color: "var(--text-dim)", marginTop: 3, fontFamily: "var(--font-mono)", textAlign: "right", padding: "0 2px" }}>+{total - 5} more rows</div>}
    </div>
  );
}

function StatusItem({ label, ok, val }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, padding: "3px 0" }}>
      <div className={`led ${ok ? "green" : "gray"}`} />
      <span style={{ color: "var(--text-dim)", fontWeight: 600 }}>{label}:</span>
      <span style={{ fontFamily: "var(--font-mono)", color: ok ? "var(--text)" : "var(--text-dim)" }}>{val}</span>
    </div>
  );
}

function LoadingPanel({ step }) {
  return (
    <div style={{ padding: "8px 4px" }}>
      <div className="lcd" style={{ marginBottom: 16, fontSize: 12, padding: "8px 12px" }}>REVOLT_OS AUDIT ENGINE v2.6</div>
      {LOADING_STEPS.map((label, i) => {
        const idx = i + 1; const done = step > idx; const active = step === idx;
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div className={`led ${done ? "green" : active ? "amber" : "gray"}`} style={active ? { animation: "blink 0.8s ease-in-out infinite" } : {}} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: done ? "var(--green)" : active ? "var(--amber)" : "var(--text-dim)" }}>
              {done ? "[DONE] " : active ? "[....] " : "[    ] "}{label}
            </span>
          </div>
        );
      })}
      <div style={{ marginTop: 16 }}>
        <div className="progress-track"><div className="progress-fill" style={{ width: `${(step/5)*100}%` }} /></div>
        <div style={{ textAlign: "right", fontSize: 10, marginTop: 3, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>{Math.round((step/5)*100)}%</div>
      </div>
    </div>
  );
}

/* ── AuditResultPanel ── */
function AuditResultPanel({ result, onViewPassport, onRunAnother }) {
  const modules = result?.upcycle_blueprint?.module_assessment ?? [];
  const grade = result?.health_grade ?? "?";
  const gradeColor = {
    A: "var(--green)", B: "var(--aqua-blue,#3b82f6)",
    C: "var(--amber,#f59e0b)", D: "#f97316", F: "var(--red)",
  }[grade] ?? "var(--text-dim)";

  const statusLabel = result?.status ?? "Complete";
  const summary = result?.health_details?.gemini_analysis_summary ?? "";
  const batteryId = result?.battery_id ?? "—";

  return (
    <div>
      {/* Grade + identity banner */}
      <div className="inset-panel" style={{
        display: "flex", alignItems: "center", gap: 14, marginBottom: 12,
        padding: "12px 14px", background: "rgba(255,255,255,0.5)",
      }}>
        <div style={{
          fontSize: 36, fontWeight: 800, color: gradeColor,
          fontFamily: "var(--font-mono)", lineHeight: 1,
          minWidth: 40, textAlign: "center",
        }}>{grade}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 3 }}>
            Audit Complete
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-dim)", marginBottom: 4 }}>
            {batteryId} · {statusLabel}
          </div>
          {summary && (
            <div style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.5 }}>
              {summary.length > 120 ? summary.slice(0, 120) + "…" : summary}
            </div>
          )}
        </div>
      </div>

      {/* 3D Battery Cell Diagram — only renders if blueprint module data exists */}
      {modules.length > 0 ? (
        <div style={{ marginBottom: 10 }}>
          <div style={{
            fontSize: 10, fontWeight: 700, color: "var(--text-dim)",
            textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 8,
          }}>
            Battery Cell Layout — 3D Module View
          </div>
          <BatteryCellDiagram modules={modules} />
        </div>
      ) : (
        /* Fallback when backend hasn't returned blueprint data yet */
        <div className="inset-panel" style={{
          padding: "14px", marginBottom: 10, background: "rgba(255,255,255,0.35)",
          fontSize: 11, color: "var(--text-dim)", textAlign: "center", lineHeight: 1.7,
        }}>
          <div style={{ fontSize: 16, marginBottom: 4 }}>🔋</div>
          3D cell diagram will appear here once Gemini generates<br />
          the upcycle blueprint (Certified batteries only).
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button className="aqua-btn" onClick={onRunAnother}>
          ← Run Another Audit
        </button>
        <button className="aqua-btn primary" onClick={onViewPassport}>
          View Full Passport →
        </button>
      </div>
    </div>
  );
}

/* ── Styles ── */
const S = {
  desktop: {
    minHeight: "100vh",
    background: "var(--desktop)",
    display: "flex", flexDirection: "column",
    fontFamily: "var(--font-ui)",
  },
  windowWrap: {
    flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
    padding: "24px 16px",
  },
  window: { width: "100%", maxWidth: 740 },
  toolbar: {
    display: "flex", alignItems: "center", gap: 6,
    padding: "5px 10px",
    background: "rgba(220,227,236,0.85)",
    borderBottom: "1px solid rgba(138,155,176,0.3)",
  },
  toolbarSep: { width: 1, height: 18, background: "rgba(138,155,176,0.3)", margin: "0 4px" },
  addressBar: {
    flex: 1, display: "flex", alignItems: "center", gap: 6,
    background: "rgba(255,255,255,0.6)", border: "1px solid rgba(138,155,176,0.4)",
    borderRadius: 4, padding: "3px 10px", boxShadow: "var(--inset)", minWidth: 0,
  },
  addressLabel: { color: "var(--text-dim)", fontSize: 10, fontWeight: 600 },
  addressVal: { fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text)" },
  body: { padding: 14, minHeight: 340 },
  uploadRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 10, alignItems: "stretch" },
  statusRow: { display: "flex", flexDirection: "column", gap: 4 },
  errorBox: {
    background: "rgba(192,57,43,0.08)", border: "1px solid rgba(192,57,43,0.25)",
    padding: "6px 10px", fontSize: 11, color: "var(--red)", marginBottom: 8,
    borderRadius: "var(--radius-sm)", fontWeight: 500,
  },
  genMsg: {
    background: "rgba(30,132,73,0.08)", border: "1px solid rgba(30,132,73,0.25)",
    padding: "6px 10px", fontSize: 11, color: "var(--green)", marginBottom: 8,
    borderRadius: "var(--radius-sm)", fontWeight: 500,
  },
  bottomBar: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "8px 12px",
    background: "rgba(220,227,236,0.85)",
    borderTop: "1px solid rgba(138,155,176,0.2)",
  },
  statusMsg: { fontSize: 11, color: "var(--text-dim)" },
};
