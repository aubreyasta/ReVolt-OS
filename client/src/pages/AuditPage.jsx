/* =============================================================================
   pages/AuditPage.jsx -- Page 1 of 3
   ============================================================================= */

import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { MOCK_MANIFEST, USE_MOCK } from "../mocks/manifest.mock";

const LOADING_STEPS = [
  "Initializing Gemini Vision...",
  "Parsing telemetry data...",
  "Running health audit + embedding...",
  "Comparing failure state library...",
  "Saving to MongoDB + building passport...",
];

// Fixed height shared by both drop zones -- keeps layout balanced
const ZONE_H = 260;

export default function AuditPage() {
  const [image, setImage] = useState(null);
  const [csv, setCsv] = useState(null);
  const [imagePrev, setImagePrev] = useState(null);
  const [csvPreview, setCsvPreview] = useState(null);
  const [step, setStep] = useState(0);
  const [error, setError] = useState(null);

  const imageRef = useRef();
  const csvRef = useRef();
  const navigate = useNavigate();

  function onImage(e) {
    const f = e.target.files[0];
    if (!f) return;
    setImage(f);
    setImagePrev(URL.createObjectURL(f));
  }

  function onCsv(e) {
    const f = e.target.files[0];
    if (!f) return;
    setCsv(f);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const lines = evt.target.result.trim().split("\n").filter(Boolean);
      if (!lines.length) return;
      setCsvPreview({
        headers: lines[0].split(",").map((h) => h.trim()),
        rows: lines.slice(1, 6).map((l) => l.split(",").map((c) => c.trim())),
        total: lines.length - 1,
      });
    };
    reader.readAsText(f);
  }

  async function submit() {
    if (!csv) {
      setError("CSV file required.");
      return;
    }
    setError(null);

    if (USE_MOCK) {
      for (let i = 1; i <= 5; i++) {
        setStep(i);
        await new Promise((r) => setTimeout(r, 900));
      }
      navigate("/passport/mock", { state: { manifest: MOCK_MANIFEST } });
      return;
    }

    // Fake ticker -- advances UI while Gemini pipeline runs in background
    setStep(1);
    const t1 = setTimeout(() => setStep(2), 5000);
    const t2 = setTimeout(() => setStep(3), 20000);
    const t3 = setTimeout(() => setStep(4), 45000);

    try {
      const form = new FormData();
      if (image) form.append("image", image);
      form.append("csv_file", csv);
      const res = await fetch("/api/audit", { method: "POST", body: form });
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      setStep(5);
      const auditResult = await res.json();
      navigate(`/passport/${auditResult.battery_id}`, {
        state: { manifest: auditResult },
      });
    } catch (err) {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      setError(err.message);
      setStep(0);
    }
  }

  const busy = step > 0;
  const ready = !!csv;

  return (
    <div style={S.desktop}>
      <div style={S.taskbar}>
        <div style={S.taskbarLogo}>ReVolt OS</div>
        <LiveClock />
      </div>

      <div style={S.windowWrap}>
        <div className="window" style={S.window}>
          <div className="titlebar">
            <div className="traffic-lights">
              <div className="tl close" />
              <div className="tl min" />
              <div className="tl max" />
            </div>
            <div className="titlebar-title">
              ReVolt OS -- Battery Audit System v2.6
            </div>
          </div>

          <div style={S.toolbar}>
            <button className="aqua-btn" disabled>
              File
            </button>
            <button className="aqua-btn" disabled>
              Edit
            </button>
            <button className="aqua-btn" disabled>
              View
            </button>
            <div style={S.toolbarSep} />
            <div style={S.addressBar}>
              <span style={S.addressLabel}>Location:</span>
              <span style={S.addressVal}>revolt://audit/new</span>
            </div>
          </div>

          <div className="divider" style={{ margin: "0 8px" }} />

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
                    emptyContent={<EmptyImagePlaceholder />}
                  />
                  <DropZone
                    label="Telemetry CSV"
                    hint="Cycle log: voltage, temp, current"
                    accept=".csv,text/csv"
                    file={csv}
                    csvPreview={csvPreview}
                    inputRef={csvRef}
                    onChange={onCsv}
                    emptyContent={<EmptyCsvPlaceholder />}
                  />
                </div>

                {error && <div style={S.errorBox}>! {error}</div>}

                <div style={S.statusRow}>
                  <StatusItem
                    label="Image"
                    ok={!!image}
                    val={image?.name || "No file selected"}
                  />
                  <StatusItem
                    label="CSV"
                    ok={!!csv}
                    val={csv?.name || "No file selected"}
                  />
                </div>
              </>
            )}
          </div>

          <div className="divider" style={{ margin: "0 8px" }} />

          <div style={S.bottomBar}>
            <div style={S.statusMsg}>
              {busy
                ? `Processing... step ${step}/5`
                : ready
                  ? "Ready to run audit."
                  : "Select both files to continue."}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                className="aqua-btn"
                onClick={() => {
                  setImage(null);
                  setCsv(null);
                  setImagePrev(null);
                  setCsvPreview(null);
                  setError(null);
                }}
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

// =============================================================================
// Empty state placeholders -- lorem ipsum so nothing looks unfinished
// =============================================================================
function EmptyImagePlaceholder() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        opacity: 0.45,
      }}
    >
      <span style={{ fontSize: 32 }}>🖼</span>
      <div
        style={{
          fontSize: 9,
          fontFamily: "var(--font-mono)",
          color: "var(--text-dim)",
          textAlign: "center",
          lineHeight: 1.6,
          maxWidth: 140,
        }}
      >
        Lorem ipsum JPG vel PNG.
        <br />
        Sticker physici depingit.
      </div>
    </div>
  );
}

function EmptyCsvPlaceholder() {
  // Fake lorem-ipsum table so the zone looks as rich as the image zone
  const fakeHeaders = ["timestamp", "voltage_v", "temp_c", "soc_pct"];
  const fakeRows = [
    ["lorem-01 00:00", "---", "---", "---"],
    ["lorem-01 00:05", "---", "---", "---"],
    ["lorem-01 00:10", "---", "---", "---"],
  ];
  return (
    <div style={{ width: "100%", opacity: 0.38 }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 9,
          fontFamily: "var(--font-mono)",
        }}
      >
        <thead>
          <tr>
            {fakeHeaders.map((h, i) => (
              <th
                key={i}
                style={{
                  background:
                    "linear-gradient(180deg, #4a7fc1 0%, #2a5fa0 100%)",
                  color: "#fff",
                  padding: "3px 6px",
                  textAlign: "left",
                  fontSize: 8,
                  whiteSpace: "nowrap",
                  borderRight: "1px solid rgba(255,255,255,0.15)",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {fakeRows.map((row, ri) => (
            <tr
              key={ri}
              style={{
                background:
                  ri % 2 === 0
                    ? "rgba(255,255,255,0.4)"
                    : "rgba(200,218,240,0.3)",
              }}
            >
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  style={{
                    color: "var(--text-dim)",
                    padding: "3px 6px",
                    fontSize: 9,
                    borderBottom: "1px solid rgba(100,140,200,0.15)",
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div
        style={{
          fontSize: 8,
          color: "var(--text-dim)",
          marginTop: 4,
          fontFamily: "var(--font-mono)",
          textAlign: "center",
        }}
      >
        ipsum telemetria .csv
      </div>
    </div>
  );
}

// =============================================================================
// DropZone -- fixed height, overflow hidden for balance
// =============================================================================
function DropZone({
  label,
  hint,
  accept,
  file,
  preview,
  csvPreview,
  inputRef,
  onChange,
  emptyContent,
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      className="inset-panel"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "12px",
        height: ZONE_H,
        background: hover ? "rgba(255,255,255,0.62)" : "rgba(255,255,255,0.38)",
        cursor: "pointer",
        transition: "background 0.15s",
        overflow: "hidden", // ← critical: prevents CSV table from blowing height
      }}
      onClick={() => inputRef.current.click()}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        style={{ display: "none" }}
        onChange={onChange}
      />

      <div style={{ fontSize: 11, fontWeight: "bold", color: "var(--text)" }}>
        {label}
      </div>
      <div style={{ fontSize: 10, color: "var(--text-dim)" }}>{hint}</div>

      {/* Content area -- fixed remaining height, overflow hidden */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          minHeight: 0,
        }}
      >
        {preview ? (
          <img
            src={preview}
            alt="preview"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              borderRadius: 2,
              border: "1px solid #8aaad0",
            }}
          />
        ) : csvPreview ? (
          <CsvPreviewTable preview={csvPreview} />
        ) : (
          emptyContent
        )}
      </div>

      {/* File status tag */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 10,
          fontFamily: "var(--font-mono)",
          color: "var(--text-dim)",
          flexShrink: 0,
        }}
        onClick={(e) => file && e.stopPropagation()}
      >
        <div className={`led ${file ? "green" : "gray"}`} />
        {file ? file.name : "Click to browse..."}
      </div>
    </div>
  );
}

// =============================================================================
// CsvPreviewTable -- aqua titlebar headers, alternating rows
// =============================================================================
function CsvPreviewTable({ preview }) {
  const { headers, rows, total } = preview;
  return (
    <div
      style={{ width: "100%", overflowX: "hidden", overflowY: "hidden" }}
      onClick={(e) => e.stopPropagation()}
    >
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 10,
          fontFamily: "var(--font-mono)",
          tableLayout: "fixed",
        }}
      >
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th
                key={i}
                style={{
                  background:
                    "linear-gradient(180deg, #4a7fc1 0%, #2a5fa0 100%)",
                  color: "#fff",
                  padding: "4px 6px",
                  textAlign: "left",
                  fontWeight: "bold",
                  fontSize: 9,
                  letterSpacing: "0.04em",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  borderRight: "1px solid rgba(255,255,255,0.15)",
                  textShadow: "0 1px 1px rgba(0,0,0,0.4)",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr
              key={ri}
              style={{
                background:
                  ri % 2 === 0
                    ? "rgba(255,255,255,0.55)"
                    : "rgba(200,218,240,0.35)",
              }}
            >
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  style={{
                    color: "var(--text)",
                    padding: "3px 6px",
                    borderBottom: "1px solid rgba(100,140,200,0.2)",
                    borderRight: "1px solid rgba(100,140,200,0.1)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    fontSize: 10,
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {total > 5 && (
        <div
          style={{
            fontSize: 9,
            color: "var(--text-dim)",
            marginTop: 3,
            fontFamily: "var(--font-mono)",
            textAlign: "right",
            padding: "0 2px",
          }}
        >
          +{total - 5} more rows
        </div>
      )}
    </div>
  );
}

// =============================================================================
// StatusItem / LoadingPanel / LiveClock
// =============================================================================
function StatusItem({ label, ok, val }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11,
        padding: "3px 0",
      }}
    >
      <div className={`led ${ok ? "green" : "gray"}`} />
      <span style={{ color: "var(--text-dim)", fontWeight: "bold" }}>
        {label}:
      </span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          color: ok ? "var(--text)" : "var(--text-dim)",
        }}
      >
        {val}
      </span>
    </div>
  );
}

function LoadingPanel({ step }) {
  return (
    <div style={{ padding: "8px 4px" }}>
      <div
        className="lcd"
        style={{ marginBottom: 16, fontSize: 13, padding: "8px 12px" }}
      >
        REVOLT_OS AUDIT ENGINE v2.6
      </div>
      {LOADING_STEPS.map((label, i) => {
        const idx = i + 1;
        const done = step > idx;
        const active = step === idx;
        return (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 10,
            }}
          >
            <div
              className={`led ${done ? "green" : active ? "amber" : "gray"}`}
              style={
                active ? { animation: "blink 0.8s ease-in-out infinite" } : {}
              }
            />
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: done
                  ? "var(--green)"
                  : active
                    ? "var(--amber)"
                    : "var(--text-dim)",
              }}
            >
              {done ? "[DONE] " : active ? "[....] " : "[    ] "}
              {label}
            </span>
          </div>
        );
      })}
      <div style={{ marginTop: 16 }}>
        <div className="progress-track" style={{ width: "100%" }}>
          <div
            className="progress-fill"
            style={{ width: `${(step / 5) * 100}%` }}
          />
        </div>
        <div
          style={{
            textAlign: "right",
            fontSize: 10,
            marginTop: 3,
            color: "var(--text-dim)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {Math.round((step / 5) * 100)}%
        </div>
      </div>
    </div>
  );
}

function LiveClock() {
  const [t, setT] = useState(() =>
    new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  );
  useEffect(() => {
    const id = setInterval(
      () =>
        setT(
          new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        ),
      10000,
    );
    return () => clearInterval(id);
  }, []);
  return (
    <div
      style={{
        color: "#ddeeff",
        fontSize: 11,
        fontFamily: "var(--font-mono)",
        background: "rgba(0,0,0,0.3)",
        padding: "2px 8px",
        borderRadius: 2,
      }}
    >
      {t}
    </div>
  );
}

// =============================================================================
// Styles
// =============================================================================
const S = {
  desktop: {
    minHeight: "100vh",
    background:
      "linear-gradient(135deg, #5578aa 0%, #7a9cc8 50%, #4a6899 100%)",
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
    order: 99,
    marginTop: "auto",
    boxShadow: "0 -2px 8px rgba(0,0,0,0.4)",
  },
  taskbarLogo: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 12,
    textShadow: "0 1px 2px rgba(0,0,0,0.5)",
    letterSpacing: "0.05em",
  },
  windowWrap: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px 16px 8px",
  },
  window: { width: "100%", maxWidth: 700 },
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "4px 8px",
    background: "rgba(210,225,245,0.8)",
  },
  toolbarSep: {
    width: 1,
    height: 18,
    background: "rgba(0,0,60,0.2)",
    margin: "0 4px",
  },
  addressBar: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "rgba(255,255,255,0.7)",
    border: "1px solid #8aaad0",
    borderRadius: 2,
    padding: "2px 8px",
    boxShadow: "var(--inset)",
  },
  addressLabel: { color: "var(--text-dim)", fontSize: 10, fontWeight: "bold" },
  addressVal: {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    color: "var(--text)",
  },
  body: { padding: "12px", minHeight: 320 },
  uploadRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
    marginBottom: 10,
    alignItems: "stretch",
  },
  statusRow: { display: "flex", flexDirection: "column", gap: 4 },
  errorBox: {
    background: "rgba(220,40,40,0.1)",
    border: "1px solid rgba(200,0,0,0.3)",
    padding: "6px 10px",
    fontSize: 11,
    color: "var(--text)",
    marginBottom: 8,
    borderRadius: 2,
  },
  bottomBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "6px 10px",
    background: "rgba(200,215,235,0.8)",
  },
  statusMsg: { fontSize: 11, color: "var(--text-dim)" },
};
