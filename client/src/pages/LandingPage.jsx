/* =============================================================================
   pages/LandingPage.jsx
   Two OS windows side by side — project overview dashboard.
   Left:  Pitch + Problem + Pipeline + Audit Gate
   Right: AI Systems + Components + Tech Stack
   Refined modern style using index.css design system.
   ============================================================================= */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

function LiveClock() {
  const [t, setT] = useState(() => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
  useEffect(() => { const id = setInterval(() => setT(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })), 10000); return () => clearInterval(id); }, []);
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
      <div><div style={S.featureTitle}>{title}</div><div style={S.featureBody}>{children}</div></div>
    </div>
  );
}

function Callout({ children }) { return <div className="inset-panel" style={S.callout}>{children}</div>; }

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
          <div className="tl min" /><div className="tl max" />
        </div>
        <div className="titlebar-title">{title}</div>
      </div>
      <div style={S.toolbar}>
        <div style={S.addrBar}>
          <span style={S.addrLabel}>Location:</span>
          <span style={S.addrVal}>revolt://{addrPath}</span>
        </div>
      </div>
      <div style={S.pane}>{children}</div>
      <div style={S.statusBar}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>revolt://{addrPath}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>{new Date().toLocaleDateString("en-GB")}</span>
      </div>
    </div>
  );
}

function AICard({ icon, name, tag, tagColor, desc, detail }) {
  return (
    <div className="inset-panel" style={{ padding: "12px 14px", marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 16 }}>{icon}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{name}</span>
        </div>
        <span style={{ fontSize: 9, fontWeight: 600, color: tagColor, background: tagColor + "15", padding: "2px 10px", borderRadius: 10, border: `1px solid ${tagColor}30` }}>{tag}</span>
      </div>
      <p style={{ fontSize: 11, lineHeight: 1.7, color: "var(--text-dim)", marginBottom: 8 }}>{desc}</p>
      <div className="lcd" style={{ fontSize: 9, padding: "4px 8px" }}>{detail}</div>
    </div>
  );
}

function PipelineStep({ n, name, desc, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 12px", background: "rgba(255,255,255,0.4)", border: "1px solid rgba(138,155,176,0.25)", borderRadius: "var(--radius-sm)", marginBottom: 3 }}>
      <span style={{ fontSize: 10, color: "var(--text-dim)", fontFamily: "var(--font-mono)", width: 18, fontWeight: 600 }}>{n}</span>
      <div className="led" style={{ width: 7, height: 7, background: color, boxShadow: `0 0 4px ${color}80`, border: "none" }} />
      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text)" }}>{name}</span>
      <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{desc}</span>
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
    const imageBytes = Uint8Array.from(atob("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AJQAB/9k="), c => c.charCodeAt(0));
    const imageFile = new File([imageBytes], "demo_battery_sticker.jpg", { type: "image/jpeg" });
    const imagePreview = URL.createObjectURL(imageFile);
    navigate("/audit", { state: { demoFiles: { imageFile, imagePreview, csvFile, csvHeaders: headers.split(","), csvRows: rows.slice(0, 5).map(r => r.split(",")) } } });
  }

  return (
    <div style={S.desktop}>
      <div style={S.taskbar}>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button className="aqua-btn" style={{ fontWeight: 700 }} onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>⚡ ReVolt OS</button>
          <button className="aqua-btn" onClick={() => navigate("/audit")}>Launch Audit</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div className="led green" style={{ width: 6, height: 6 }} />
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", fontFamily: "var(--font-mono)" }}>LIVE</span>
          <LiveClock />
        </div>
      </div>

      <div style={S.desktop2col}>
        {/* LEFT */}
        <OSWindow title="ReVolt OS — Project Overview" addrPath="about/pitch">
          <div style={S.article}>
            <div style={S.eyebrow}>Moonshot Hackathon 2026</div>
            <h1 style={S.h1}>ReVolt OS</h1>
            <p style={{ fontSize: 16, fontWeight: 700, color: "var(--aqua-blue)", marginBottom: 8, lineHeight: 1.3 }}>The Circular Energy<br />Operating System</p>
            <p style={S.lead}>Retired EV batteries still hold decades of usable energy. The problem isn't the batteries — it's that there's no software layer to certify, grade, and safely repurpose them.</p>

            <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
              <button className="aqua-btn primary" style={S.heroCta} onClick={() => navigate("/audit")}>⚡ Open Audit</button>
              <button className="aqua-btn" style={S.heroCta} onClick={giveItAGo}>🎲 Demo — preload data</button>
            </div>

            <SectionDivider label="THE PROBLEM" />
            <div style={S.statRow}>
              <Stat val="14M tons" label="Li-ion end-of-life by 2030" color="var(--red)" />
              <Stat val="70%" label="cheaper — used EV packs" color="var(--green)" />
              <Stat val="400V" label="lethal pack voltage" color="var(--amber)" />
              <Stat val="0" label="certification systems today" color="var(--red)" />
            </div>

            <SectionDivider label="WHO IS THIS FOR" />
            <H2>Three people, one passport</H2>
            <Feature icon="🏭" title="SMEs — Solar installers, repair shops, resellers">A bad $15k battery kills margin. The passport is a procurement tool with AI grading.</Feature>
            <Feature icon="🔧" title="DIY builders — Pulling their own Leaf battery">Has a multimeter, wants a solar wall. Active on r/diybatteries. No trusted tool today.</Feature>
            <Feature icon="🛒" title="The buyer — Scanning the QR on Marketplace">Sees "Grade B, 78% SOH, 4.2yr remaining" and buys with confidence. Never touches the audit.</Feature>

            <SectionDivider label="THE PIPELINE" />
            <H2>From upload to upcycle</H2>
            <PipelineStep n="01" name="Upload" desc="CSV + battery photo" color="#2860a0" />
            <PipelineStep n="02" name="Gemini Vision" desc="Manufacturer, model, damage" color="#7c3aed" />
            <PipelineStep n="03" name="Health Grade" desc="A-F · EN 18061:2025" color="#059669" />
            <PipelineStep n="04" name="Embedding" desc="3072-dim fingerprint" color="#d97706" />
            <PipelineStep n="05" name="Failure Scan" desc="Cosine vs known failures" color="#dc2626" />
            <PipelineStep n="06" name="Blueprint" desc="Topology + rewiring steps" color="#059669" />
            <PipelineStep n="07" name="Voice Agent" desc="ElevenLabs walkthrough" color="#2860a0" />

            <SectionDivider label="AUDIT GATE" />
            <H2>Certify or reject</H2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
              <div className="inset-panel" style={{ padding: 12, borderLeft: "3px solid var(--red)", borderRadius: "var(--radius-sm)" }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "var(--red)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Reject — D/F</div>
                <div style={{ fontSize: 10, lineHeight: 1.7, color: "var(--text-dim)" }}>Sustained &gt;60°C, Li plating plateaus, cell delta &gt;300mV, physical oxidation.</div>
                <div style={{ marginTop: 6, fontSize: 10, color: "var(--red)", fontWeight: 600 }}>→ Recycling manifest</div>
              </div>
              <div className="inset-panel" style={{ padding: 12, borderLeft: "3px solid var(--green)", borderRadius: "var(--radius-sm)" }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: "var(--green)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Certify — A-C</div>
                <div style={{ fontSize: 10, lineHeight: 1.7, color: "var(--text-dim)" }}>&gt;70% SOH, healthy vector profile, no failure matches. Passport + blueprint generated.</div>
                <div style={{ marginTop: 6, fontSize: 10, color: "var(--green)", fontWeight: 600 }}>→ Blueprint + voice walkthrough</div>
              </div>
            </div>
          </div>
        </OSWindow>

        {/* RIGHT */}
        <OSWindow title="Technical Overview" addrPath="about/tech" onClose={() => navigate("/audit")}>
          <div style={S.article}>
            <SectionDivider label="AI SYSTEMS" />
            <H2>Three AI engines</H2>
            <AICard icon="🧠" name="Gemini 2.5 Flash" tag="Multimodal" tagColor="#7c3aed" desc="Single call: image + full CSV in 1M-token context. Outputs health grade, SOH%, RUL, risk flags, bypass list, upcycle blueprint." detail="CSV + JPG → Digital Twin JSON · strict schema" />
            <AICard icon="📐" name="Gemini Embeddings" tag="Vector" tagColor="#2860a0" desc="3072-dim behavior fingerprints. 'Shazam for batteries' — similarity search + failure pattern matching against thermal runaway, Li plating, cell imbalance." detail="gemini-embedding-001 · cosine · MongoDB Atlas Vector Search" />
            <AICard icon="🗣️" name="ElevenLabs Agent" tag="Voice" tagColor="#059669" desc="Not TTS. Has tool_use — calls GET /api/batteries/:id mid-conversation. Blueprint-aware. Emergency protocol if smoke/sparking mentioned. Steps enforced server-side." detail="WebRTC · webhook to Flask · per-session prompt from manifest" />

            <SectionDivider label="COMPONENTS" />
            <H2>What each page does</H2>

            <Feature icon="🔍" title="Audit Page">Multipart upload → single Gemini multimodal call with image + CSV. Full telemetry in-context. Result saved to MongoDB before frontend receives it.</Feature>
            <Callout>React FormData POST → Flask /api/audit → Gemini → MongoDB → JSON manifest back to client.</Callout>

            <Feature icon="📋" title="Battery Passport">Structured passport from the manifest. QR code points to live MongoDB record. Health grades: A = 90%+, B = 80-90%, C = 70-80%, D = 60-70%, F = below 60%.</Feature>

            <Feature icon="🗺️" title="Upcycle Blueprint">Engineering spec: target config (14S2P for 48V), cell blocks to bypass with reasoning, expected voltages, step-by-step assembly with multimeter readings.</Feature>

            <Feature icon="🎙️" title="Assembly Page">ElevenLabs agent pre-loaded with battery's passport data. Knows ID, grade, voltage checkpoints, flagged cells. Steps cannot be skipped.</Feature>

            <SectionDivider label="THE STACK" />
            <H2>Integration</H2>
            <Feature icon="🍃" title="MongoDB Atlas">Full manifest + behavior_embedding (float[3072]). Atlas Vector Search for cosine similarity. Change Streams for auto compliance updates.</Feature>
            <Feature icon="⚛️" title="React + Vite + Router">Data flows via location.state. Design system: CSS variables. Zero UI library deps.</Feature>
            <Feature icon="🐍" title="Flask on Railway">POST /api/audit, GET /api/batteries/:id, GET /api/batteries/:id/passport, PATCH /api/batteries/:id/status.</Feature>

            <div style={{ height: 16 }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button className="aqua-btn primary" style={S.heroCta} onClick={() => navigate("/audit")}>⚡ Open Audit</button>
              <button className="aqua-btn" style={S.heroCta} onClick={giveItAGo}>🎲 Demo data</button>
            </div>
            <p style={{ ...S.p, marginTop: 12, fontSize: 10, color: "var(--text-dim)" }}>Moonshot Hackathon 2026 · Gemini · ElevenLabs · MongoDB Atlas</p>
          </div>
        </OSWindow>
      </div>
    </div>
  );
}

const S = {
  desktop: { height: "100vh", overflow: "hidden", background: "var(--desktop)", display: "flex", flexDirection: "column", fontFamily: "var(--font-ui)" },
  taskbar: { position: "sticky", top: 0, zIndex: 100, background: "linear-gradient(180deg, #4a6a8a 0%, #2a4a6a 100%)", borderBottom: "1px solid #1e3a5a", padding: "5px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.25)" },
  clock: { color: "rgba(255,255,255,0.7)", fontSize: 10, fontFamily: "var(--font-mono)", background: "rgba(0,0,0,0.2)", padding: "2px 8px", borderRadius: 3 },
  desktop2col: { flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, padding: "16px 14px", height: "calc(100vh - 37px)", boxSizing: "border-box" },
  window: { display: "flex", flexDirection: "column", overflow: "hidden", height: "100%" },
  pane: { flex: 1, overflowY: "auto" },
  toolbar: { display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", background: "rgba(220,227,236,0.85)", flexShrink: 0, borderBottom: "1px solid rgba(138,155,176,0.3)" },
  addrBar: { flex: 1, display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.6)", border: "1px solid rgba(138,155,176,0.4)", borderRadius: 4, padding: "3px 10px", boxShadow: "var(--inset)", minWidth: 0 },
  addrLabel: { color: "var(--text-dim)", fontSize: 10, fontWeight: 600, flexShrink: 0 },
  addrVal: { fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  statusBar: { display: "flex", justifyContent: "space-between", padding: "4px 12px", background: "rgba(220,227,236,0.85)", fontSize: 10, color: "var(--text-dim)", flexShrink: 0, borderTop: "1px solid rgba(138,155,176,0.2)" },
  article: { padding: "22px 26px 30px" },
  eyebrow: { fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", color: "var(--aqua-blue)", textTransform: "uppercase", marginBottom: 6 },
  h1: { fontSize: 24, fontWeight: 800, lineHeight: 1.2, color: "var(--text)", marginBottom: 6 },
  lead: { fontSize: 12, lineHeight: 1.8, color: "var(--text-dim)", marginBottom: 16 },
  statRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 },
  stat: { padding: "10px 12px", textAlign: "center" },
  statVal: { fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 800, marginBottom: 2 },
  statLabel: { fontSize: 10, color: "var(--text-dim)", lineHeight: 1.4 },
  heroCta: { fontSize: 11, padding: "7px 18px", flex: 1 },
  dividerWrap: { display: "flex", alignItems: "center", gap: 10, margin: "20px 0 14px" },
  dividerLabel: { fontSize: 8, fontWeight: 700, letterSpacing: "0.16em", color: "var(--text-dim)", textTransform: "uppercase", whiteSpace: "nowrap" },
  h2: { fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 8, lineHeight: 1.3 },
  h3: { fontSize: 12, fontWeight: 700, color: "var(--text)", marginBottom: 6, marginTop: 16 },
  p: { fontSize: 11, lineHeight: 1.8, color: "var(--text-dim)", marginBottom: 10 },
  featureRow: { display: "flex", gap: 10, marginBottom: 12, alignItems: "flex-start" },
  featureIcon: { fontSize: 16, flexShrink: 0, marginTop: 1 },
  featureTitle: { fontSize: 11, fontWeight: 700, color: "var(--text)", marginBottom: 3 },
  featureBody: { fontSize: 11, lineHeight: 1.75, color: "var(--text-dim)" },
  callout: { margin: "8px 0 12px", padding: "10px 14px", fontSize: 10, lineHeight: 1.7, color: "var(--text)" },
};
