/* =============================================================================
   pages/AuditPage.jsx -- Page 1 of 3

   PURPOSE:
     Entry point. User uploads two files and triggers the AI audit pipeline.
     File 1: battery sticker photo (JPG/PNG) -- fed to Gemini Vision
     File 2: telemetry CSV -- fed to Gemini text model for health grading

   MOCK MODE (default):
     When USE_MOCK = true in manifest.mock.js, clicking "Run Audit" plays a
     three-step animated loading sequence then navigates to PassportPage with
     the MOCK_MANIFEST. No network calls are made. Good for UI development.

   LIVE MODE:
     When USE_MOCK = false, the form POSTs multipart/form-data to:
       POST /api/audit  (server/main.py)
     The FastAPI server calls build_full_manifest() in audit.py, which:
       1. Calls Gemini Vision on the sticker image  --> battery_id object
       2. Calls Gemini text model on the CSV        --> telemetry manifest
       3. Generates a telemetry vector embedding    --> telemetry_embedding[]
     On success, the server returns the full manifest JSON.
     On failure, the error message is shown in the error box.

   WIRING:
     vite.config.js proxies /api/* to localhost:8000 so no CORS issues in dev.
   ============================================================================= */

import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { MOCK_MANIFEST, USE_MOCK } from "../mocks/manifest.mock";

/* Step labels shown during the animated loading sequence.
   Index corresponds to step number (1-based).
   These are display-only -- the actual work happens in submit(). */
const LOADING_STEPS = [
  "Initializing Gemini Vision...",
  "Parsing telemetry data...",
  "Generating Battery Passport...",
];

export default function AuditPage() {
  const [image,    setImage]    = useState(null);   // File object for sticker image
  const [csv,      setCsv]      = useState(null);   // File object for telemetry CSV
  const [imagePrev,setImagePrev]= useState(null);   // Object URL for image preview
  const [step,     setStep]     = useState(0);      // 0=idle, 1-3=loading step index
  const [error,    setError]    = useState(null);   // Error string or null

  const imageRef = useRef();  // Hidden <input type="file"> for sticker image
  const csvRef   = useRef();  // Hidden <input type="file"> for CSV
  const navigate = useNavigate();

  function onImage(e) {
    const f = e.target.files[0];
    if (!f) return;
    setImage(f);
    setImagePrev(URL.createObjectURL(f));  // Creates a local preview URL
  }

  function onCsv(e) {
    const f = e.target.files[0];
    if (!f) return;
    setCsv(f);
  }

  /* submit()
     Either runs the mock flow or calls the real FastAPI endpoint.
     step state drives the LoadingPanel animation while in progress. */
  async function submit() {
    if (!image || !csv) { setError("Both files required."); return; }
    setError(null);

    if (USE_MOCK) {
      /* Mock path: simulate the three AI steps with a delay each,
         then navigate with the static mock manifest in router state. */
      for (let i = 1; i <= 3; i++) {
        setStep(i);
        await new Promise(r => setTimeout(r, 1100));
      }
      navigate("/passport/mock", { state: { manifest: MOCK_MANIFEST } });
      return;
    }

    /* Live path: POST to FastAPI.
       Field names must match FastAPI parameter names in main.py:
         image    --> UploadFile parameter named "image"
         csv_file --> UploadFile parameter named "csv_file"           */
    try {
      setStep(1);
      const form = new FormData();
      form.append("image",    image);
      form.append("csv_file", csv);

      setStep(2);
      const res = await fetch("/api/audit", { method: "POST", body: form });
      if (!res.ok) throw new Error(`Server error ${res.status}`);

      setStep(3);
      const manifest = await res.json();

      /* Navigate to PassportPage, passing manifest in router state.
         The :id segment is the passport_id from the manifest. */
      navigate(`/passport/${manifest.passport_id}`, { state: { manifest } });
    } catch (err) {
      setError(err.message);
      setStep(0);
    }
  }

  const busy  = step > 0;
  const ready = image && csv;

  return (
    <div style={S.desktop}>

      {/* Taskbar -- pinned to bottom via flexbox order:99 + marginTop:auto */}
      <div style={S.taskbar}>
        <div style={S.taskbarLogo}>ReVolt OS</div>
        <div style={S.taskbarClock}>
          {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>

      {/* Main window */}
      <div style={S.windowWrap}>
        <div className="window" style={S.window}>

          <div className="titlebar">
            <div className="traffic-lights">
              <div className="tl close" />
              <div className="tl min" />
              <div className="tl max" />
            </div>
            <div className="titlebar-title">ReVolt OS -- Battery Audit System v2.6</div>
          </div>

          {/* Toolbar with fake menu items and address bar */}
          <div style={S.toolbar}>
            <button className="aqua-btn" disabled>File</button>
            <button className="aqua-btn" disabled>Edit</button>
            <button className="aqua-btn" disabled>View</button>
            <div style={S.toolbarSep} />
            <div style={S.addressBar}>
              <span style={S.addressLabel}>Location:</span>
              <span style={S.addressVal}>revolt://audit/new</span>
            </div>
          </div>

          <div className="divider" style={{ margin: "0 8px" }} />

          {/* Body -- shows loading panel while step > 0, otherwise upload UI */}
          <div style={S.body}>
            {busy ? (
              <LoadingPanel step={step} />
            ) : (
              <>
                <div style={S.uploadRow}>
                  <DropZone
                    label="Battery Sticker Image"
                    hint="JPG or PNG of the physical label"
                    accept="image/*"
                    file={image}
                    preview={imagePrev}
                    inputRef={imageRef}
                    onChange={onImage}
                    icon="[IMG]"
                  />
                  <DropZone
                    label="Telemetry CSV"
                    hint="Cycle log: voltage, temp, current"
                    accept=".csv,text/csv"
                    file={csv}
                    inputRef={csvRef}
                    onChange={onCsv}
                    icon="[CSV]"
                  />
                </div>

                {error && (
                  <div style={S.errorBox}>! {error}</div>
                )}

                <div style={S.statusRow}>
                  <StatusItem label="Image" ok={!!image} val={image?.name || "No file selected"} />
                  <StatusItem label="CSV"   ok={!!csv}   val={csv?.name   || "No file selected"} />
                </div>
              </>
            )}
          </div>

          <div className="divider" style={{ margin: "0 8px" }} />

          <div style={S.bottomBar}>
            <div style={S.statusMsg}>
              {busy  ? `Processing... step ${step}/3`
               : ready ? "Ready to run audit."
               :         "Select both files to continue."}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                className="aqua-btn"
                onClick={() => { setImage(null); setCsv(null); setImagePrev(null); setError(null); }}
              >
                Clear
              </button>
              <button
                className="aqua-btn primary"
                onClick={submit}
                disabled={!ready || busy}
              >
                Run Audit
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

/* -----------------------------------------------------------------------------
   DropZone
   Clickable upload area. Delegates click to a hidden <input type="file">.
   Shows a preview image when an image file is selected.
   ----------------------------------------------------------------------------- */
function DropZone({ label, hint, accept, file, preview, inputRef, onChange, icon }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      className="inset-panel"
      style={{
        ...S.dropZone,
        background: hover ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.35)",
        cursor: "pointer",
      }}
      onClick={() => inputRef.current.click()}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <input ref={inputRef} type="file" accept={accept} style={{ display: "none" }} onChange={onChange} />
      <div style={S.dropLabel}>{label}</div>
      <div style={S.dropHint}>{hint}</div>
      <div style={S.dropMain}>
        {preview
          ? <img src={preview} alt="preview" style={S.preview} />
          : <span style={S.dropIcon}>{icon}</span>}
      </div>
      {file
        ? <div style={S.fileTag}><div className="led green" />{file.name}</div>
        : <div style={S.fileTag}><div className="led gray" />Click to browse...</div>}
    </div>
  );
}

/* -----------------------------------------------------------------------------
   StatusItem
   A single row in the file status readout below the drop zones.
   Shows a green LED when the file is selected, gray otherwise.
   ----------------------------------------------------------------------------- */
function StatusItem({ label, ok, val }) {
  return (
    <div style={S.statusItem}>
      <div className={`led ${ok ? "green" : "gray"}`} />
      <span style={{ color: "var(--text-dim)", fontWeight: "bold" }}>{label}:</span>
      <span style={{ fontFamily: "var(--font-mono)", color: ok ? "var(--text)" : "var(--text-dim)" }}>{val}</span>
    </div>
  );
}

/* -----------------------------------------------------------------------------
   LoadingPanel
   Shown while step > 0. Displays three rows with LED + monospace label.
   - Past steps: green LED, "[DONE]" prefix
   - Active step: amber blinking LED, "[....]" prefix
   - Future steps: gray LED, "[    ]" prefix
   Also shows a progress bar below the steps.
   ----------------------------------------------------------------------------- */
function LoadingPanel({ step }) {
  return (
    <div style={S.loadingPanel}>
      <div className="lcd" style={{ marginBottom: 16, fontSize: 13, padding: "8px 12px" }}>
        REVOLT_OS AUDIT ENGINE v2.6
      </div>
      {LOADING_STEPS.map((label, i) => {
        const idx    = i + 1;
        const done   = step > idx;
        const active = step === idx;
        return (
          <div key={i} style={S.loadRow}>
            <div
              className={`led ${done ? "green" : active ? "amber" : "gray"}`}
              style={active ? { animation: "blink 0.8s ease-in-out infinite" } : {}}
            />
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 11,
              color: done ? "var(--green)" : active ? "var(--amber)" : "var(--text-dim)",
            }}>
              {done ? "[DONE] " : active ? "[....] " : "[    ] "}{label}
            </span>
          </div>
        );
      })}
      <div style={{ marginTop: 16 }}>
        <div className="progress-track" style={{ width: "100%" }}>
          <div className="progress-fill" style={{ width: `${(step / 3) * 100}%` }} />
        </div>
        <div style={{ textAlign: "right", fontSize: 10, marginTop: 3, color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}>
          {Math.round((step / 3) * 100)}%
        </div>
      </div>
    </div>
  );
}

/* Styles -- all layout and spacing defined here rather than inline where
   possible, to keep the JSX readable. */
const S = {
  desktop: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #5578aa 0%, #7a9cc8 50%, #4a6899 100%)",
    display: "flex",
    flexDirection: "column",
    fontFamily: "var(--font-ui)",
  },
  taskbar: {
    background: "linear-gradient(180deg, #3a6aaa 0%, #1a4a88 100%)",
    borderTop: "1px solid #6090cc",
    padding: "4px 12px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    order: 99,       // Pushes taskbar to bottom of flex column
    marginTop: "auto",
    boxShadow: "0 -2px 8px rgba(0,0,0,0.4)",
  },
  taskbarLogo:  { color: "#fff", fontWeight: "bold", fontSize: 12, textShadow: "0 1px 2px rgba(0,0,0,0.5)", letterSpacing: "0.05em" },
  taskbarClock: { color: "#ddeeff", fontSize: 11, fontFamily: "var(--font-mono)", background: "rgba(0,0,0,0.3)", padding: "2px 8px", borderRadius: 2 },
  windowWrap:   { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px 8px" },
  window:       { width: "100%", maxWidth: 700 },
  toolbar:      { display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", background: "rgba(210,225,245,0.8)" },
  toolbarSep:   { width: 1, height: 18, background: "rgba(0,0,60,0.2)", margin: "0 4px" },
  addressBar:   { flex: 1, display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.7)", border: "1px solid #8aaad0", borderRadius: 2, padding: "2px 8px", boxShadow: "var(--inset)" },
  addressLabel: { color: "var(--text-dim)", fontSize: 10, fontWeight: "bold" },
  addressVal:   { fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text)" },
  body:         { padding: "12px", minHeight: 320 },
  uploadRow:    { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 },
  dropZone:     { display: "flex", flexDirection: "column", gap: 6, padding: "12px", minHeight: 200, transition: "background 0.15s" },
  dropLabel:    { fontSize: 11, fontWeight: "bold", color: "var(--text)" },
  dropHint:     { fontSize: 10, color: "var(--text-dim)" },
  dropMain:     { flex: 1, display: "flex", alignItems: "center", justifyContent: "center" },
  dropIcon:     { fontSize: 28, fontFamily: "var(--font-mono)", color: "var(--text-dim)" },
  preview:      { width: "100%", maxHeight: 100, objectFit: "cover", borderRadius: 2, border: "1px solid #8aaad0" },
  fileTag:      { display: "flex", alignItems: "center", gap: 6, fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-dim)" },
  statusRow:    { display: "flex", flexDirection: "column", gap: 4 },
  statusItem:   { display: "flex", alignItems: "center", gap: 6, fontSize: 11, padding: "3px 0" },
  errorBox:     { background: "rgba(220,40,40,0.1)", border: "1px solid rgba(200,0,0,0.3)", padding: "6px 10px", fontSize: 11, color: "var(--text)", marginBottom: 8, borderRadius: 2 },
  bottomBar:    { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", background: "rgba(200,215,235,0.8)" },
  statusMsg:    { fontSize: 11, color: "var(--text-dim)" },
  loadingPanel: { padding: "8px 4px" },
  loadRow:      { display: "flex", alignItems: "center", gap: 10, marginBottom: 10 },
};
