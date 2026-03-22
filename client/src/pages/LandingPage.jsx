/* =============================================================================
   pages/LandingPage.jsx  (combined v2)
   
   Merges:
   - Friend's two-window layout with project pitch, pipeline, tech stack
   - Our Sporisk-style stat cards & AI system breakdown
   - macOS Aqua chrome throughout (uses index.css classes)
   
   Left window:  Pitch + Problem + Pipeline + Stats (what/why)
   Right window:  Components + Tech Stack + AI Systems (how)
   
   Both windows independently scrollable.
   ============================================================================= */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

/* ── Shared sub-components ── */

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

function Stat({ val, label, color }) {
  return (
    <div className="inset-panel" style={S.stat}>
      <div style={{ ...S.statVal, color: color || "var(--aqua-blue)" }}>{val}</div>
      <div style={S.statLabel}>{label}</div>
    </div>
  );
}

function H2({ children }) { return <h2 style={S.h2}>{children}</h2>; }

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
  return <div className="inset-panel" style={S.callout}>{children}</div>;
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
      <div style={S.pane}>{children}</div>
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

/* ── AI System Card (new) ── */
function AICard({ icon, name, tag, tagColor, desc, detail }) {
  return (
    <div className="inset-panel" style={{ padding: "10px 12px", marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 16 }}>{icon}</span>
          <span style={{ fontSize: 11, fontWeight: "bold", color: "var(--text)" }}>{name}</span>
        </div>
        <span style={{ fontSize: 8, fontWeight: "bold", color: tagColor, background: tagColor + "18", padding: "1px 8px", borderRadius: 10, border: `1px solid ${tagColor}40` }}>{tag}</span>
      </div>
      <p style={{ fontSize: 10, lineHeight: 1.7, color: "var(--text-dim)", marginBottom: 6 }}>{desc}</p>
      <div className="lcd" style={{ fontSize: 9, padding: "3px 6px" }}>{detail}</div>
    </div>
  );
}

/* ── Pipeline Step Row (new) ── */
function PipelineStep({ n, name, desc, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "rgba(255,255,255,0.35)", border: "1px solid rgba(100,140,200,0.3)", borderRadius: 3, marginBottom: 3 }}>
      <span style={{ fontSize: 10, color: "var(--text-dim)", fontFamily: "var(--font-mono)", width: 18, fontWeight: "bold" }}>{n}</span>
      <div className="led" style={{ width: 7, height: 7, background: color, boxShadow: `0 0 4px ${color}`, border: "none" }} />
      <span style={{ fontSize: 10, fontWeight: "bold", color: "var(--text)" }}>{name}</span>
      <span style={{ fontSize: 10, color: "var(--text-dim)", flex: 1 }}>{desc}</span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ══════════════════════════════════════════════════════════════════════════════ */

export default function LandingPage() {
  const navigate = useNavigate();

  // Generate demo data and navigate to audit with it pre-loaded
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
        demoFiles: { imageFile, imagePreview, csvFile, csvHeaders: headers.split(","), csvRows: rows.slice(0, 5).map(r => r.split(",")) },
      },
    });
  }

  return (
    <div style={S.desktop}>
      {/* ── Taskbar ── */}
      <div style={S.taskbar}>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <button className="aqua-btn" style={{ fontWeight: "bold" }}
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
            ⚡ ReVolt OS
          </button>
          <button className="aqua-btn" onClick={() => navigate("/audit")}>
            Launch Audit
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div className="led green" style={{ width: 8, height: 8 }} />
          <span style={{ fontSize: 9, color: "#aaddff", fontFamily: "var(--font-mono)" }}>LIVE MODEL</span>
          <LiveClock />
        </div>
      </div>

      {/* ── Two-window desktop ── */}
      <div style={S.desktop2col}>

        {/* ═══ LEFT WINDOW: What & Why ═══ */}
        <OSWindow title="about_revolt.txt — What & Why" addrPath="about/pitch">
          <div style={S.article}>
            <div style={S.eyebrow}>Moonshot Hackathon 2026</div>
            <h1 style={S.h1}>ReVolt OS — The Circular Energy Operating System</h1>
            <p style={S.lead}>
              Retired EV batteries still hold decades of usable energy. The problem isn't
              the batteries — it's that there's no software layer to certify, grade, and
              safely repurpose them. That's what ReVolt OS is.
            </p>

            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <button className="aqua-btn primary" style={S.heroCta} onClick={() => navigate("/audit")}>
                ⚡ Open Audit — bring your own files
              </button>
              <button className="aqua-btn" style={S.heroCta} onClick={giveItAGo}>
                🎲 Demo — preload example data
              </button>
            </div>

            <SectionDivider label="THE PROBLEM" />

            <div style={S.statRow}>
              <Stat val="14M tons" label="Li-ion batteries reaching end-of-life by 2030" color="#dd2222" />
              <Stat val="70%" label="cheaper than new — used EV packs for home storage" color="#00cc44" />
              <Stat val="400V" label="lethal pack voltage — needs step-down to 48V" color="#ff9900" />
              <Stat val="0" label="certification systems for SME upcyclers today" color="#dd2222" />
            </div>

            <SectionDivider label="WHO IS THIS FOR" />

            <H2>Three people, one passport</H2>

            <Feature icon="🏭" title="SMEs — Solar installers, repair shops, battery resellers">
              A bad $15,000 battery purchase kills their margin. The passport gives them a
              procurement tool with real AI grading behind it.
            </Feature>

            <Feature icon="🔧" title="DIY builders — The person pulling their own Leaf battery">
              Has a multimeter and basic electrical knowledge. Wants to build a home solar
              wall. Active on r/diybatteries. No trusted tool today.
            </Feature>

            <Feature icon="🛒" title="The buyer — Scanning the QR code on Marketplace">
              Sees "Grade B — 78% health — 4.2 years remaining" and makes a confident
              purchase. Never touches the audit tool. That's a consumer too.
            </Feature>

            <SectionDivider label="THE PIPELINE" />

            <H2>From upload to upcycle — 7 steps</H2>

            <PipelineStep n="01" name="Upload" desc="CSV + battery photo" color="#4a9fd8" />
            <PipelineStep n="02" name="Gemini Vision" desc="Manufacturer, model, damage" color="#8855cc" />
            <PipelineStep n="03" name="Health Grade" desc="A-F · EN 18061:2025 gate" color="#00cc44" />
            <PipelineStep n="04" name="Embedding" desc="3072-dim vector fingerprint" color="#ff9900" />
            <PipelineStep n="05" name="Failure Scan" desc="Cosine sim vs known failures" color="#dd2222" />
            <PipelineStep n="06" name="Blueprint" desc="Topology + step-by-step rewiring" color="#00cc44" />
            <PipelineStep n="07" name="Voice Agent" desc="ElevenLabs walks through it" color="#4a9fd8" />

            <SectionDivider label="AUDIT GATE" />

            <H2>The decision: certify or reject</H2>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
              <div className="inset-panel" style={{ padding: 10, borderLeft: "3px solid #dd2222" }}>
                <div style={{ fontSize: 9, fontWeight: "bold", color: "#dd2222", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Reject — Grade D/F</div>
                <div style={{ fontSize: 10, lineHeight: 1.7, color: "var(--text-dim)" }}>
                  Sustained temps &gt;60°C, voltage plateaus (Li plating), cell delta &gt;300mV, physical oxidation.
                </div>
                <div style={{ marginTop: 6, fontSize: 10, color: "#dd2222", fontWeight: "bold" }}>→ Recycling manifest</div>
              </div>
              <div className="inset-panel" style={{ padding: 10, borderLeft: "3px solid #00cc44" }}>
                <div style={{ fontSize: 9, fontWeight: "bold", color: "#00cc44", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Certify — Grade A-C</div>
                <div style={{ fontSize: 10, lineHeight: 1.7, color: "var(--text-dim)" }}>
                  &gt;70% SOH, healthy vector profile, no failure matches. Passport + blueprint generated.
                </div>
                <div style={{ marginTop: 6, fontSize: 10, color: "#00cc44", fontWeight: "bold" }}>→ Blueprint + voice walkthrough</div>
              </div>
            </div>

          </div>
        </OSWindow>

        {/* ═══ RIGHT WINDOW: How ═══ */}
        <OSWindow title="technical_overview.txt — How It Works" addrPath="about/tech" onClose={() => navigate("/audit")}>
          <div style={S.article}>

            <SectionDivider label="AI SYSTEMS" />

            <H2>Three AI engines power the audit</H2>

            <AICard icon="🧠" name="Gemini 2.5 Flash" tag="Multimodal" tagColor="#8855cc"
              desc="Single call: image + full CSV in 1M-token context. Outputs health grade, SOH%, RUL, risk flags, cell bypass list, config recommendation, and upcycle blueprint."
              detail="CSV + JPG → Digital Twin JSON · strict schema" />

            <AICard icon="📐" name="Gemini Embeddings" tag="Vector" tagColor="#4a9fd8"
              desc="3072-dim behavior fingerprints. Upload 5 seconds of voltage and find the closest known battery. Also compares every new battery against thermal runaway, Li plating, and cell imbalance failure states."
              detail="gemini-embedding-001 · cosine · MongoDB Atlas Vector Search" />

            <AICard icon="🗣️" name="ElevenLabs Agent" tag="Voice" tagColor="#00cc44"
              desc="Not TTS. The agent has tool_use — calls GET /api/batteries/:id mid-conversation. Blueprint-aware: knows exact voltage checkpoints and flagged cells. Emergency protocol if smoke/sparking mentioned."
              detail="WebRTC · webhook to Flask · step order enforced server-side" />

            <SectionDivider label="THE COMPONENTS" />

            <H2>What each page actually does</H2>

            <h3 style={S.h3}>🔍 The Audit Page</h3>
            <p style={S.p}>
              Multipart form upload (image + CSV). Image is base64-encoded and sent inline
              with the CSV as a single Gemini multimodal request. The entire telemetry log
              is in-context at once — Gemini reasons over long-term patterns, not just averages.
            </p>
            <Callout>
              React FormData POST to Flask /api/audit. Flask calls Gemini with both inputs.
              Response parsed into structured JSON manifest, written to MongoDB before
              the frontend receives anything.
            </Callout>

            {/* Example input preview */}
            <div style={S.exampleWrap}>
              <div style={S.exampleLabel}>EXAMPLE INPUT</div>
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
                    </div>
                  </div>
                </div>
                <div style={S.examplePanel}>
                  <div style={S.examplePanelLabel}>telemetry.csv — 40 rows</div>
                  <div className="inset-panel" style={{ padding: 0, overflow: "hidden" }}>
                    <table style={S.csvTable}>
                      <thead><tr>
                        {["timestamp","voltage_v","temp_c","soc_pct","cycles"].map(h =>
                          <th key={h} style={S.csvTh}>{h}</th>
                        )}
                      </tr></thead>
                      <tbody>
                        {[["2024-03-01 00:00","3.850","28.3","95","380"],["2024-03-01 06:00","3.838","29.1","91","380"],["2024-03-01 12:00","3.821","31.4","87","381"],["2024-03-01 18:00","3.809","33.2","83","381"],["2024-03-02 00:00","3.794","35.0","79","382"]].map((row,ri) =>
                          <tr key={ri} style={{background:ri%2===0?"rgba(255,255,255,0.55)":"rgba(200,218,240,0.35)"}}>
                            {row.map((cell,ci) => <td key={ci} style={S.csvTd}>{cell}</td>)}
                          </tr>
                        )}
                      </tbody>
                    </table>
                    <div style={S.csvMore}>+35 more rows...</div>
                  </div>
                </div>
              </div>
            </div>

            <h3 style={S.h3}>📋 The Battery Passport</h3>
            <p style={S.p}>
              Manifest JSON rendered as a structured passport. Fields: manufacturer, chemistry,
              health grade A-F, SOH%, total cycles, peak temp, RUL, and the full blueprint.
              QR code points to live MongoDB record — current status, not a static snapshot.
            </p>
            <Callout>
              A = 90%+ SOH, B = 80-90%, C = 70-80%, D = 60-70%, F = below 60%.
              Grade B is the sweet spot for home energy storage repurposing.
            </Callout>

            <h3 style={S.h3}>🗺️ The Upcycle Blueprint</h3>
            <p style={S.p}>
              Gemini produces an engineering spec: target cell config (e.g. 14S2P for 48V),
              cell blocks to bypass with reasoning, expected output voltage, estimated capacity,
              step-by-step assembly with expected multimeter readings at each point.
            </p>

            <h3 style={S.h3}>🎙️ The Assembly Page</h3>
            <p style={S.p}>
              ElevenLabs agent initialized with a dynamic prompt built from the battery's
              passport data. Before the session starts, the agent knows the battery ID, grade,
              voltage checkpoints, and flagged cells. Steps cannot be skipped — enforced server-side.
            </p>

            <SectionDivider label="THE STACK" />

            <H2>Integration details</H2>

            <Feature icon="🍃" title="MongoDB Atlas — schema + vector layer">
              Each battery document stores the full manifest plus a behavior_embedding
              field (float[3072]). Atlas Vector Search enables cosine similarity queries.
              Change Streams watch assembly_record for auto EU compliance updates.
            </Feature>

            <Feature icon="⚛️" title="Frontend — React + Vite + React Router">
              Inter-page data via React Router location.state. Design system: 100% CSS
              variables — macOS Aqua chrome. Zero UI library dependencies.
            </Feature>

            <Feature icon="🐍" title="Backend — Python + Flask on Railway">
              POST /api/audit (full pipeline), GET /api/batteries/:id (agent webhook),
              GET /api/batteries/:id/passport (lighter for UI),
              PATCH /api/batteries/:id/status (assembly updates).
            </Feature>

            <div style={{ height: 16 }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button className="aqua-btn primary" style={S.heroCta} onClick={() => navigate("/audit")}>
                ⚡ Open Audit
              </button>
              <button className="aqua-btn" style={S.heroCta} onClick={giveItAGo}>
                🎲 Demo — preload example data
              </button>
            </div>
            <p style={{ ...S.p, marginTop: 12, fontSize: 10, color: "var(--text-dim)" }}>
              Moonshot Hackathon 2026 · Gemini · ElevenLabs · MongoDB Atlas
            </p>
          </div>
        </OSWindow>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
   STYLES
   Uses CSS variables from index.css (--text, --text-dim, --aqua-blue, etc.)
   and classes (.window, .titlebar, .aqua-btn, .inset-panel, .lcd, .led, .divider)
   ══════════════════════════════════════════════════════════════════════════════ */

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
    position: "sticky", top: 0, zIndex: 100,
    background: "linear-gradient(180deg, #3a6aaa 0%, #1a4a88 100%)",
    borderBottom: "1px solid #2a5a99",
    padding: "4px 12px",
    display: "flex", justifyContent: "space-between", alignItems: "center",
    boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
  },
  clock: {
    color: "#ddeeff", fontSize: 11, fontFamily: "var(--font-mono)",
    background: "rgba(0,0,0,0.3)", padding: "2px 8px", borderRadius: 2,
  },
  desktop2col: {
    flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12,
    padding: "16px 14px", height: "calc(100vh - 33px)", boxSizing: "border-box",
  },
  window: { display: "flex", flexDirection: "column", overflow: "hidden", height: "100%" },
  pane: { flex: 1, overflowY: "auto" },
  toolbar: {
    display: "flex", alignItems: "center", gap: 4, padding: "4px 8px",
    background: "rgba(210,225,245,0.8)", flexShrink: 0,
  },
  sep: { width: 1, height: 18, background: "rgba(0,0,60,0.2)", margin: "0 4px" },
  addrBar: {
    flex: 1, display: "flex", alignItems: "center", gap: 6,
    background: "rgba(255,255,255,0.7)", border: "1px solid #8aaad0",
    borderRadius: 2, padding: "2px 8px", boxShadow: "var(--inset)", minWidth: 0,
  },
  addrLabel: { color: "var(--text-dim)", fontSize: 10, fontWeight: "bold", flexShrink: 0 },
  addrVal: { fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  statusBar: {
    display: "flex", justifyContent: "space-between", padding: "4px 10px",
    background: "rgba(200,215,235,0.8)", fontSize: 10, color: "var(--text-dim)", flexShrink: 0,
  },
  article: { padding: "20px 24px 28px" },
  eyebrow: { fontSize: 9, fontWeight: "bold", letterSpacing: "0.16em", color: "var(--aqua-blue)", textTransform: "uppercase", marginBottom: 8 },
  h1: { fontSize: 20, fontWeight: "bold", lineHeight: 1.25, color: "var(--text)", marginBottom: 12 },
  lead: { fontSize: 12, lineHeight: 1.8, color: "var(--text-dim)", marginBottom: 16 },
  statRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 16 },
  stat: { padding: "8px 10px", textAlign: "center" },
  statVal: { fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: "bold", color: "var(--aqua-blue)", marginBottom: 2 },
  statLabel: { fontSize: 9, color: "var(--text-dim)", lineHeight: 1.4 },
  heroCta: { fontSize: 12, padding: "7px 20px", flex: 1 },
  dividerWrap: { display: "flex", alignItems: "center", gap: 10, margin: "22px 0 16px" },
  dividerLabel: { fontSize: 8, fontWeight: "bold", letterSpacing: "0.18em", color: "var(--text-dim)", textTransform: "uppercase", whiteSpace: "nowrap" },
  h2: { fontSize: 15, fontWeight: "bold", color: "var(--text)", marginBottom: 8, marginTop: 2, lineHeight: 1.25 },
  h3: { fontSize: 12, fontWeight: "bold", color: "var(--text)", marginBottom: 6, marginTop: 18 },
  p: { fontSize: 11, lineHeight: 1.8, color: "var(--text-dim)", marginBottom: 10 },
  featureRow: { display: "flex", gap: 12, marginBottom: 14, alignItems: "flex-start" },
  featureIcon: { fontSize: 18, flexShrink: 0, marginTop: 1 },
  featureTitle: { fontSize: 11, fontWeight: "bold", color: "var(--text)", marginBottom: 3 },
  featureBody: { fontSize: 11, lineHeight: 1.75, color: "var(--text-dim)" },
  callout: { margin: "10px 0 14px", padding: "10px 14px", fontSize: 11, lineHeight: 1.7, color: "var(--text)" },
  exampleWrap: { marginBottom: 4 },
  exampleLabel: { fontSize: 8, fontWeight: "bold", letterSpacing: "0.14em", color: "var(--text-dim)", textTransform: "uppercase", marginBottom: 6 },
  exampleRow: { display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 8 },
  examplePanel: { display: "flex", flexDirection: "column", gap: 4 },
  examplePanelLabel: { fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--text-dim)" },
  exampleImageBox: { padding: 10, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 100 },
  fakeSticker: { width: "100%", background: "#fffff0", border: "1px solid #bbb", borderRadius: 2, padding: "8px 10px", fontFamily: "var(--font-mono)", boxShadow: "1px 1px 4px rgba(0,0,0,0.15)" },
  fakeStickerRow: { display: "flex", gap: 6, marginBottom: 3, alignItems: "baseline" },
  fsk: { fontSize: 7, fontWeight: "bold", color: "#666", width: 38, flexShrink: 0, textTransform: "uppercase" },
  fsv: { fontSize: 8, color: "#111" },
  csvTable: { width: "100%", borderCollapse: "collapse", fontSize: 8, fontFamily: "var(--font-mono)" },
  csvTh: { background: "linear-gradient(180deg, #4a7fc1 0%, #2a5fa0 100%)", color: "#fff", padding: "3px 5px", textAlign: "left", fontSize: 7, fontWeight: "bold", whiteSpace: "nowrap" },
  csvTd: { padding: "3px 5px", color: "var(--text)", fontSize: 8, whiteSpace: "nowrap", borderBottom: "1px solid rgba(100,140,200,0.15)" },
  csvMore: { fontSize: 8, fontFamily: "var(--font-mono)", color: "var(--text-dim)", padding: "3px 6px", background: "rgba(200,218,240,0.35)" },
};
