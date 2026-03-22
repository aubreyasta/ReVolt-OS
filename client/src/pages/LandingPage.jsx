/* =============================================================================
   pages/LandingPage.jsx
   Two equal-width OS windows side by side, each independently scrollable.
   Left:  Pitch + Problem + Pipeline (what/why)
   Right: Components + Tech Stack (how)
   ============================================================================= */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

function LiveClock() {
  const [t, setT] = useState(() =>
    new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  );
  useEffect(() => {
    const id = setInterval(
      () => setT(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })),
      10000
    );
    return () => clearInterval(id);
  }, []);
  return <span style={S.clock}>{t}</span>;
}

function Stat({ val, label }) {
  return (
    <div className="inset-panel" style={S.stat}>
      <div style={S.statVal}>{val}</div>
      <div style={S.statLabel}>{label}</div>
    </div>
  );
}

function H2({ children }) {
  return <h2 style={S.h2}>{children}</h2>;
}

function Feature({ icon, title, children }) {
  return (
    <div style={S.featureRow}>
      <div style={S.featureIcon}>{icon}</div>
      <div>
        <div style={S.featureTitle}>{title}</div>
        <div style={S.featureBody}>{children}</div>
      </div>
    </div>
  );
}

function Callout({ children }) {
  return (
    <div className="inset-panel" style={S.callout}>
      {children}
    </div>
  );
}

function SectionDivider({ label }) {
  return (
    <div style={S.dividerWrap}>
      <div className="divider" style={{ flex: 1 }} />
      <span style={S.dividerLabel}>{label}</span>
      <div className="divider" style={{ flex: 1 }} />
    </div>
  );
}

// Shared window chrome wrapper
function OSWindow({ title, addrPath, children, onClose }) {
  return (
    <div className="window" style={S.window}>
      <div className="titlebar">
        <div className="traffic-lights">
          <div className="tl close" onClick={onClose} style={onClose ? { cursor: "pointer" } : {}} />
          <div className="tl min" />
          <div className="tl max" />
        </div>
        <div className="titlebar-title">{title}</div>
      </div>
      <div style={S.toolbar}>
        <button className="aqua-btn" disabled>File</button>
        <button className="aqua-btn" disabled>Edit</button>
        <button className="aqua-btn" disabled>View</button>
        <div style={S.sep} />
        <div style={S.addrBar}>
          <span style={S.addrLabel}>Location:</span>
          <span style={S.addrVal}>revolt://{addrPath}</span>
        </div>
      </div>
      <div className="divider" style={{ margin: "0 8px" }} />
      <div style={S.pane}>
        {children}
      </div>
      <div className="divider" style={{ margin: "0 8px" }} />
      <div style={S.statusBar}>
        <span>revolt://{addrPath}</span>
        <span style={{ fontFamily: "var(--font-mono)" }}>
          {new Date().toLocaleDateString("en-GB")}
        </span>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();

  function giveItAGo() {
    const headers = "timestamp,voltage_v,current_a,temp_c,soc_pct,cycle_count";
    const rows = Array.from({ length: 40 }, (_, i) => {
      const t = `2024-03-${String(Math.floor(i / 4) + 1).padStart(2, "0")} ${String((i % 4) * 6).padStart(2, "0")}:00:00`;
      const voltage = (3.85 - i * 0.008 + Math.random() * 0.02).toFixed(3);
      const current = (i % 8 < 4 ? -18 : 22 + Math.random() * 5).toFixed(1);
      const temp = (28 + i * 0.4 + Math.random() * 2).toFixed(1);
      const soc = Math.max(20, 95 - i * 1.8).toFixed(0);
      const cycle = 380 + Math.floor(i / 4);
      return `${t},${voltage},${current},${temp},${soc},${cycle}`;
    });
    const csvContent = [headers, ...rows].join("\n");
    const csvFile = new File([csvContent], "demo_telemetry.csv", { type: "text/csv" });

    const imageBytes = Uint8Array.from(atob(
      "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AJQAB/9k="
    ), c => c.charCodeAt(0));
    const imageFile = new File([imageBytes], "demo_battery_sticker.jpg", { type: "image/jpeg" });
    const imagePreview = URL.createObjectURL(imageFile);

    navigate("/audit", {
      state: {
        demoFiles: {
          imageFile,
          imagePreview,
          csvFile,
          csvHeaders: headers.split(","),
          csvRows: rows.slice(0, 5).map(r => r.split(",")),
        },
      },
    });
  }

  return (
    <div style={S.desktop}>

      {/* Taskbar */}
      <div style={S.taskbar}>
        <div style={{ display: "flex", gap: 4 }}>
          <button className="aqua-btn" style={{ fontWeight: "bold" }}
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
            ⚡ ReVolt OS
          </button>
          <button className="aqua-btn" onClick={() => navigate("/audit")}>
            Launch Audit
          </button>
        </div>
        <LiveClock />
      </div>

      {/* Two-window desktop */}
      <div style={S.desktop2col}>

        {/* ── LEFT WINDOW - What & Why ── */}
        <OSWindow title="about_revolt.txt - What & Why" addrPath="about/pitch">
          <div style={S.article}>

            <div style={S.eyebrow}>Moonshot Hackathon 2026</div>
            <h1 style={S.h1}>ReVolt OS - The Circular Energy Operating System</h1>
            <p style={S.lead}>
              The real target is anyone who has battery data and a reason to trust it.
              Retired EV batteries still hold decades of usable energy. The problem isn't
              the batteries - it's that there's no software layer to certify, grade, and
              safely repurpose them. That's what ReVolt OS is.
            </p>

            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <button className="aqua-btn primary" style={S.heroCta} onClick={() => navigate("/audit")}>
                ⚡ Open Audit - bring your own files
              </button>
              <button className="aqua-btn" style={S.heroCta} onClick={giveItAGo}>
                🎲 Demo - preload example data & try now
              </button>
            </div>

            <SectionDivider label="WHO IS THIS FOR" />

            <H2>Three people, one passport</H2>
            <p style={S.p}>
              ReVolt OS serves three people: the technician who audits the battery,
              the builder who repurposes it, and the buyer who needs to trust it.
              The Battery Passport is the thing that connects all three.
            </p>

            <Feature icon="🏭" title="SMEs - Solar installers, EV repair shops, battery resellers">
              They buy in volume, they have technical staff, and a bad $15,000 battery
              purchase kills their margin. The passport gives them a procurement tool with
              real grading behind it. This is the strongest market - the risk is highest
              and the willingness to pay is real.
            </Feature>

            <Feature icon="🔧" title="Technically capable individuals - The DIY builder">
              Someone who pulled their own Nissan Leaf battery, has a multimeter and basic
              electrical knowledge, and wants to build a home solar wall. They exist, they're
              active on forums like r/diybatteries, and they have no trusted tool today.
              ReVolt OS is exactly what they need - and the three-screen flow is clean
              enough for this person without intimidating them.
            </Feature>

            <Feature icon="🛒" title="The buyer side - The person scanning the QR code">
              This is the one nobody is talking about. The person who scans the QR code on
              the passport is also a consumer. Someone buying a second-hand e-bike or solar
              storage unit on Facebook Marketplace scans it, sees "Grade B - 78% health -
              4.2 years remaining" and makes a confident purchase. They never touch the
              audit tool at all. That's a consumer too.
            </Feature>

            <SectionDivider label="THE PIPELINE" />

            <H2>How it works - 4 steps</H2>

            <Feature icon="📥" title="Step 1 - Ingest">
              Upload a CSV of battery telemetry (voltage, temperature, cycles, state of
              charge) and a photo of the physical battery sticker. No reformatting, no
              templates. Raw data, exactly as it comes out of a Battery Management System.
            </Feature>

            <Feature icon="🧠" title="Step 2 - Process (Gemini Audit)">
              Both files go to Gemini simultaneously. It reads the image for manufacturer
              and serial number, and reads the entire CSV to identify thermal stress events,
              fast-charge abuse, and voltage sag curves. Output: a health grade (A-F),
              a Remaining Useful Life estimate, and a full upcycle blueprint.
            </Feature>

            <Feature icon="🗄️" title="Step 3 - Store (Battery Passport + Digital Twin)">
              Results are saved to MongoDB as a Digital Twin. A Battery Passport is issued
              (EU Battery Regulation 2023/1542 compliant) with a scannable QR code.
              The telemetry is also vectorised into a 256-dimension behavioral fingerprint
              for future similarity search.
            </Feature>

            <Feature icon="🎙️" title="Step 4 - Act (Voice Agent Assembly Guide)">
              The ElevenLabs voice agent is pre-loaded with the exact battery on the bench.
              It knows the health grade, flagged cells, and expected voltages at every step.
              Hands-free. Steps cannot be skipped.
            </Feature>

          </div>
        </OSWindow>

        {/* ── RIGHT WINDOW - How ── */}
        <OSWindow title="technical_overview.txt - How It Works" addrPath="about/tech" onClose={() => navigate("/audit")}>
          <div style={S.article}>

            <SectionDivider label="THE COMPONENTS" />

            <H2>What each page actually does</H2>

            <h3 style={S.h3}>🔍 The Audit Page</h3>
            <p style={S.p}>
              Accepts a multipart form upload (image + CSV). The image is base64-encoded
              and sent inline with the CSV as a single Gemini multimodal request - not two
              separate calls. Gemini's 1M token context window means the entire telemetry
              log is in-context at once, so it can reason over long-term patterns rather
              than just averages.
            </p>
            <Callout>
              React FormData POST to Flask /api/audit. Flask calls Gemini 3.0 Flash with
              both inputs in one request. Response is parsed into a structured JSON manifest
              and written to MongoDB before the frontend receives anything.
            </Callout>

            {/* Example input preview */}
            <div style={S.exampleWrap}>
              <div style={S.exampleLabel}>EXAMPLE INPUT - what you'd upload</div>
              <div style={S.exampleRow}>

                <div style={S.examplePanel}>
                  <div style={S.examplePanelLabel}>battery_sticker.jpg</div>
                  <div className="inset-panel" style={S.exampleImageBox}>
                    <div style={S.fakeSticker}>
                      <div style={S.fakeStickerRow}><span style={S.fsk}>MFG</span><span style={S.fsv}>Nissan / AESC</span></div>
                      <div style={S.fakeStickerRow}><span style={S.fsk}>MODEL</span><span style={S.fsv}>Leaf Gen2 24kWh</span></div>
                      <div style={S.fakeStickerRow}><span style={S.fsk}>CHEM</span><span style={S.fsv}>NMC Li-ion</span></div>
                      <div style={S.fakeStickerRow}><span style={S.fsk}>S/N</span><span style={S.fsv}>AESC-2019-7742B</span></div>
                      <div style={S.fakeStickerRow}><span style={S.fsk}>VOLT</span><span style={S.fsv}>360V nominal</span></div>
                      <div style={{ ...S.fakeStickerRow, borderTop: "1px dashed #aaa", paddingTop: 4, marginTop: 5 }}>
                        <span style={S.fsk}>⚠️</span>
                        <span style={{ ...S.fsv, color: "#cc0000", fontSize: 8 }}>HIGH VOLTAGE - DO NOT OPEN</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div style={S.examplePanel}>
                  <div style={S.examplePanelLabel}>telemetry.csv - 40 rows</div>
                  <div className="inset-panel" style={{ padding: 0, overflow: "hidden" }}>
                    <table style={S.csvTable}>
                      <thead>
                        <tr>
                          {["timestamp", "voltage_v", "temp_c", "soc_pct", "cycles"].map(h => (
                            <th key={h} style={S.csvTh}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          ["2024-03-01 00:00", "3.850", "28.3", "95", "380"],
                          ["2024-03-01 06:00", "3.838", "29.1", "91", "380"],
                          ["2024-03-01 12:00", "3.821", "31.4", "87", "381"],
                          ["2024-03-01 18:00", "3.809", "33.2", "83", "381"],
                          ["2024-03-02 00:00", "3.794", "35.0", "79", "382"],
                        ].map((row, ri) => (
                          <tr key={ri} style={{ background: ri % 2 === 0 ? "rgba(255,255,255,0.55)" : "rgba(200,218,240,0.35)" }}>
                            {row.map((cell, ci) => <td key={ci} style={S.csvTd}>{cell}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div style={S.csvMore}>+35 more rows...</div>
                  </div>
                </div>

              </div>
            </div>

            <h3 style={S.h3}>📋 The Battery Passport</h3>
            <p style={S.p}>
              The manifest JSON returned by the audit is rendered as a structured passport
              document. Fields include: manufacturer, chemistry, health grade (A-F), state
              of health percentage, total cycles, peak recorded temperature, fast-charge
              ratio, remaining useful life in years, and the full upcycle blueprint.
              A QR code is generated client-side pointing to the live MongoDB record -
              so anyone who scans it gets the current status, not a static snapshot.
            </p>
            <Callout>
              Health grades: A = 90%+ SOH, B = 80-90%, C = 70-80%, D = 60-70%, F = below 60%.
              Grade B is the practical sweet spot for home energy storage repurposing.
              The passport is printable and PDF-exportable via window.print().
            </Callout>

            <h3 style={S.h3}>🗺️ The Upcycle Blueprint</h3>
            <p style={S.p}>
              Gemini doesn't just grade - it produces an engineering spec. The blueprint
              contains: target cell configuration (e.g. 14S2P for a 48V system), a list
              of cell blocks to bypass with reasoning (e.g. "Block C shows 340mV delta
              under load - bypass risk"), expected output voltage, estimated capacity after
              reconfiguration, and step-by-step assembly instructions. It also generates
              OpenSCAD code for 3D-printable mounting brackets specific to the module dimensions.
            </p>
            <Callout>
              Series (S) wiring raises voltage. Parallel (P) wiring raises capacity.
              14S2P = 14 cells in series * 2 in parallel = ~50.4V nominal, doubled capacity.
              "Bypass" = remove a degraded block from the circuit entirely and rewire around it.
            </Callout>

            <h3 style={S.h3}>🎙️ The Assembly Page</h3>
            <p style={S.p}>
              The ElevenLabs Conversational Agent API is initialised with a dynamic system
              prompt built from the battery's passport data. Before the session starts, the
              agent already knows the battery ID, grade, specific voltage checkpoints, and
              which cells are flagged. The agent uses a webhook to call GET /api/batteries/:id
              live during the conversation - so if the passport is updated mid-session (e.g.
              a cell block is marked failed), the agent's next response reflects it.
            </p>
            <Callout>
              The agent enforces step order server-side - skipping is refused, not just warned.
              If smoke, burning smell, or sparking is mentioned, the agent halts the session
              and issues an emergency protocol regardless of where in the workflow it is.
            </Callout>

            <SectionDivider label="THE TECH" />

            <H2>Stack and integration details</H2>

            <Feature icon="🧠" title="Google Gemini 3.0 Flash">
              Single multimodal call with image + full CSV + OEM manual injected into the
              1M-token context. Output is a strict JSON schema - health grade, SOH%, RUL,
              risk flags, cell bypass list, config recommendation, and OpenSCAD snippet.
              A second call to gemini-embedding-001 produces the 256-dim telemetry vector.
            </Feature>

            <Feature icon="🍃" title="MongoDB Atlas - schema + vector layer">
              Each battery document stores the full manifest plus a behavior_embedding field
              (float[256]). Atlas Vector Search index on behavior_embedding enables cosine
              similarity queries - upload any unlabelled 5-second voltage trace and the
              system returns the closest known battery profile. Atlas Change Streams watch
              the assembly_record field and auto-trigger EU compliance status updates.
            </Feature>

            <Feature icon="🎙️" title="ElevenLabs Conversational Agent API">
              Not TTS. The agent has tool_use enabled - it calls the Flask webhook
              GET /api/batteries/:id mid-conversation. The system prompt is rebuilt per
              session from the battery manifest. Voice ID and persona are fixed to
              "ReVolt" - a custom industrial safety inspector voice tuned for clarity
              over warehouse background noise.
            </Feature>

            <Feature icon="⚛️" title="Frontend - React + Vite + React Router">
              All inter-page data flows via React Router location.state - no localStorage,
              no global store. The design system is 100% CSS variables defined in index.css:
              macOS Aqua chrome (titlebar gradients, traffic lights, bevelled buttons,
              LED indicators, LCD readouts). Zero UI library dependencies.
            </Feature>

            <Feature icon="🐍" title="Backend - Python + Flask">
              Four active endpoints: POST /api/audit (runs the full pipeline),
              GET /api/batteries/:id (full document for the agent webhook),
              GET /api/batteries/:id/passport (lighter, no embedding, for the UI),
              PATCH /api/batteries/:id/status (assembly step completion updates).
            </Feature>

            <div style={{ height: 16 }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button className="aqua-btn primary" style={S.heroCta} onClick={() => navigate("/audit")}>
                ⚡ Open Audit - bring your own files
              </button>
              <button className="aqua-btn" style={S.heroCta} onClick={giveItAGo}>
                🎲 Demo - preload example data & try now
              </button>
            </div>
            <p style={{ ...S.p, marginTop: 12, fontSize: 10, color: "var(--text-dim)" }}>
              Moonshot Hackathon 2026 * Gemini * ElevenLabs * MongoDB Atlas
            </p>

          </div>
        </OSWindow>

      </div>
    </div>
  );
}

const S = {
  desktop: {
    height: "100vh",
    overflow: "hidden",
    background: "linear-gradient(160deg, #4a6899 0%, #6b8cba 40%, #5578aa 100%)",
    display: "flex",
    flexDirection: "column",
    fontFamily: "var(--font-ui)",
  },
  taskbar: {
    position: "sticky",
    top: 0,
    zIndex: 100,
    background: "linear-gradient(180deg, #3a6aaa 0%, #1a4a88 100%)",
    borderBottom: "1px solid #2a5a99",
    padding: "4px 12px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
  },
  clock: {
    color: "#ddeeff",
    fontSize: 11,
    fontFamily: "var(--font-mono)",
    background: "rgba(0,0,0,0.3)",
    padding: "2px 8px",
    borderRadius: 2,
  },

  // Two-column desktop layout
  desktop2col: {
    flex: 1,
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
    padding: "16px 14px",
    // Subtract taskbar height so windows fill exactly the viewport
    height: "calc(100vh - 33px)",
    boxSizing: "border-box",
  },

  // Each window fills the column and clips overflow for independent scroll
  window: {
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    height: "100%",
  },

  // The scrollable pane inside each window
  pane: {
    flex: 1,
    overflowY: "auto",
  },

  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "4px 8px",
    background: "rgba(210,225,245,0.8)",
    flexShrink: 0,
  },
  sep: { width: 1, height: 18, background: "rgba(0,0,60,0.2)", margin: "0 4px" },
  addrBar: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "rgba(255,255,255,0.7)",
    border: "1px solid #8aaad0",
    borderRadius: 2,
    padding: "2px 8px",
    boxShadow: "var(--inset)",
    minWidth: 0,
  },
  addrLabel: { color: "var(--text-dim)", fontSize: 10, fontWeight: "bold", flexShrink: 0 },
  addrVal: { fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  statusBar: {
    display: "flex",
    justifyContent: "space-between",
    padding: "4px 10px",
    background: "rgba(200,215,235,0.8)",
    fontSize: 10,
    color: "var(--text-dim)",
    flexShrink: 0,
  },

  // Article content inside each pane
  article: {
    padding: "20px 24px 28px",
  },

  eyebrow: {
    fontSize: 9,
    fontWeight: "bold",
    letterSpacing: "0.16em",
    color: "var(--aqua-blue)",
    textTransform: "uppercase",
    marginBottom: 8,
  },
  h1: {
    fontSize: 20,
    fontWeight: "bold",
    lineHeight: 1.25,
    color: "var(--text)",
    marginBottom: 12,
  },
  lead: {
    fontSize: 12,
    lineHeight: 1.8,
    color: "var(--text-dim)",
    marginBottom: 16,
  },
  statRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 6,
    marginBottom: 16,
  },
  stat: {
    padding: "8px 10px",
    textAlign: "center",
  },
  statVal: {
    fontFamily: "var(--font-mono)",
    fontSize: 14,
    fontWeight: "bold",
    color: "var(--aqua-blue)",
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 9,
    color: "var(--text-dim)",
    lineHeight: 1.4,
  },
  heroCta: { fontSize: 12, padding: "7px 20px", flex: 1 },

  dividerWrap: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    margin: "22px 0 16px",
  },
  dividerLabel: {
    fontSize: 8,
    fontWeight: "bold",
    letterSpacing: "0.18em",
    color: "var(--text-dim)",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
  },

  h2: {
    fontSize: 15,
    fontWeight: "bold",
    color: "var(--text)",
    marginBottom: 8,
    marginTop: 2,
    lineHeight: 1.25,
  },
  h3: {
    fontSize: 12,
    fontWeight: "bold",
    color: "var(--text)",
    marginBottom: 6,
    marginTop: 18,
  },
  p: {
    fontSize: 11,
    lineHeight: 1.8,
    color: "var(--text-dim)",
    marginBottom: 10,
  },

  featureRow: {
    display: "flex",
    gap: 12,
    marginBottom: 14,
    alignItems: "flex-start",
  },
  featureIcon: { fontSize: 18, flexShrink: 0, marginTop: 1 },
  featureTitle: {
    fontSize: 11,
    fontWeight: "bold",
    color: "var(--text)",
    marginBottom: 3,
  },
  featureBody: {
    fontSize: 11,
    lineHeight: 1.75,
    color: "var(--text-dim)",
  },

  callout: {
    margin: "10px 0 14px",
    padding: "10px 14px",
    fontSize: 11,
    lineHeight: 1.7,
    color: "var(--text)",
  },

  // Example input preview
  exampleWrap: { marginBottom: 4 },
  exampleLabel: {
    fontSize: 8, fontWeight: "bold", letterSpacing: "0.14em",
    color: "var(--text-dim)", textTransform: "uppercase", marginBottom: 6,
  },
  exampleRow: { display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 8 },
  examplePanel: { display: "flex", flexDirection: "column", gap: 4 },
  examplePanelLabel: { fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--text-dim)" },
  exampleImageBox: { padding: 10, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 100 },
  fakeSticker: {
    width: "100%",
    background: "#fffff0",
    border: "1px solid #bbb",
    borderRadius: 2,
    padding: "8px 10px",
    fontFamily: "var(--font-mono)",
    boxShadow: "1px 1px 4px rgba(0,0,0,0.15)",
  },
  fakeStickerRow: { display: "flex", gap: 6, marginBottom: 3, alignItems: "baseline" },
  fsk: { fontSize: 7, fontWeight: "bold", color: "#666", width: 38, flexShrink: 0, textTransform: "uppercase" },
  fsv: { fontSize: 8, color: "#111" },
  csvTable: { width: "100%", borderCollapse: "collapse", fontSize: 8, fontFamily: "var(--font-mono)" },
  csvTh: {
    background: "linear-gradient(180deg, #4a7fc1 0%, #2a5fa0 100%)",
    color: "#fff", padding: "3px 5px", textAlign: "left", fontSize: 7,
    fontWeight: "bold", whiteSpace: "nowrap",
  },
  csvTd: {
    padding: "3px 5px", color: "var(--text)", fontSize: 8,
    whiteSpace: "nowrap", borderBottom: "1px solid rgba(100,140,200,0.15)",
  },
  csvMore: {
    fontSize: 8, fontFamily: "var(--font-mono)", color: "var(--text-dim)",
    padding: "3px 6px", background: "rgba(200,218,240,0.35)",
  },
};
