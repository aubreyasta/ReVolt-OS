// =============================================================================
// pages/AssemblyPage.jsx -- Page 3 of 3
//
// PURPOSE:
//   Hands-free safety guide for battery disassembly.
//   Left panel:  6-step safety checklist (tapped manually or auto-checked by agent)
//   Right panel: ElevenLabs voice agent -- mic, transcript, risk alert
//
// ASSEMBLY COMPLETION FLOW:
//   When all steps are done, "Complete Assembly" button appears.
//   Clicking it POSTs the completed milestone record to FastAPI.
//   The backend is responsible for verification / signing (not the frontend).
//   On success, the frontend navigates back to PassportPage with an enriched
//   manifest: { ...original, status: "disassembly_completed", assembly_record }
//   PassportCard renders assembly_record as a green "Verified" badge.
//   If the POST fails (backend not yet wired), it falls back to navigating
//   with a locally-constructed record marked as unverified.
//
// ELEVENLABS SETUP -- see comment block before ELEVENLABS_AGENT_ID.
// =============================================================================

import { useState, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

// -----------------------------------------------------------------------------
// ELEVENLABS AGENT SETUP -- what to do before wiring the live SDK
//
// 1. Create agent at elevenlabs.io --> Conversational AI --> New Agent
//    Name: "ReVolt Safety Foreman"
//    Voice: calm authoritative voice (e.g. "Clyde" or "Arnold")
//    System prompt:
//      "You are an industrial safety foreman guiding a technician through
//       high-voltage EV battery disassembly. Be calm, authoritative, precise.
//       The battery passport will be injected as context before the session.
//       Confirm each safety step verbally, then call log_milestone with
//       step_index (0-based) and step_label."
//
// 2. Add a Tool in the agent dashboard:
//    Tool name:  log_milestone
//    Type:       Webhook (POST)
//    URL:        http://localhost:8000/api/batteries/{passport_id}/log-milestone
//    Parameters: { "step_index": number, "step_label": string }
//    When the agent calls this, onToolCall below fires and updates the checklist.
//
// 3. npm install @elevenlabs/react
//
// 4. Paste the Agent ID in the constant below.
//
// 5. Uncomment the useConversation block inside the component (search UNCOMMENT).
// -----------------------------------------------------------------------------
const ELEVENLABS_AGENT_ID = null; // e.g. "agent_01jqabcdefghij"

const SAFETY_STEPS = [
  "Confirm PPE: insulated gloves, face shield, arc-flash suit",
  "Verify battery discharged below 5V total pack voltage",
  "Disconnect HV connector and isolate BMS harness",
  "Remove cell modules per recommended config",
  "Inspect cells for swelling, leakage, or thermal marks",
  "Seal and label cells for storage or transport",
];

// Canned responses for demo mode only.
// In live mode these are replaced entirely by the ElevenLabs audio stream.
const MOCK_RESPONSES = [
  "Confirmed. Thermal stress flag is active -- proceed with extra caution.",
  (m) => "Noted. Recommended config is: " + (m?.recommended_config ?? "see passport") + ".",
  "Check for swelling around cell block C before continuing.",
  (m) => "SOH is " + (m?.state_of_health_pct ?? "---") + "%. Remaining cells are within safe parameters.",
  "Step logged. Proceed when ready.",
];

export default function AssemblyPage() {
  const { state } = useLocation();
  const navigate  = useNavigate();
  const manifest  = state?.manifest;

  const [agentActive, setAgentActive] = useState(false);
  const [done,        setDone]        = useState(new Set());
  const [completing,  setCompleting]  = useState(false);
  const [transcript,  setTranscript]  = useState([
    { role: "agent", text: "Safety foreman online. Battery passport loaded. Ready to begin." },
  ]);
  const mockResponseIdx = useRef(0);

  // ---------------------------------------------------------------------------
  // UNCOMMENT THIS BLOCK when ELEVENLABS_AGENT_ID is set.
  // Also add at the top:  import { useConversation } from "@elevenlabs/react";
  //
  // const conversation = useConversation({
  //   agentId: ELEVENLABS_AGENT_ID,
  //   overrides: manifest ? {
  //     agent: {
  //       prompt: {
  //         prompt: "BATTERY PASSPORT FOR THIS SESSION:\n" + JSON.stringify(manifest, null, 2)
  //       }
  //     }
  //   } : undefined,
  //   onMessage: ({ message }) => {
  //     setTranscript(t => [...t, { role: "agent", text: message }]);
  //   },
  //   onToolCall: ({ toolName, parameters }) => {
  //     if (toolName === "log_milestone") {
  //       const idx = parameters.step_index;
  //       setDone(prev => new Set([...prev, idx]));
  //       setTranscript(t => [...t, {
  //         role: "agent",
  //         text: "Step " + (idx + 1) + " logged: " + parameters.step_label,
  //       }]);
  //     }
  //   },
  //   onError: (err) => console.error("ElevenLabs error:", err),
  // });
  //
  // Replace toggleAgent() body with:
  //   if (agentActive) {
  //     conversation.endSession();
  //     setAgentActive(false);
  //   } else {
  //     await conversation.startSession({ agentId: ELEVENLABS_AGENT_ID });
  //     setAgentActive(true);
  //   }
  // ---------------------------------------------------------------------------

  function toggleAgent() {
    setAgentActive(v => {
      if (!v) {
        setTranscript(t => [...t, {
          role: "agent",
          text: ELEVENLABS_AGENT_ID
            ? "Connecting to ElevenLabs agent..."
            : "Demo mode. Tap checklist steps to simulate agent responses.",
        }]);
      }
      return !v;
    });
  }

  function toggleStep(i) {
    setDone(prev => {
      const next = new Set(prev);
      if (next.has(i)) { next.delete(i); return next; }
      next.add(i);
      if (!ELEVENLABS_AGENT_ID) {
        const resp = MOCK_RESPONSES[mockResponseIdx.current % MOCK_RESPONSES.length];
        mockResponseIdx.current++;
        setTranscript(t => [...t, {
          role: "agent",
          text: typeof resp === "function" ? resp(manifest) : resp,
        }]);
      }
      return next;
    });
  }

  // ---------------------------------------------------------------------------
  // completeAssembly
  //
  // Builds a plain assembly_record object (no hashing -- that is the backend's job)
  // and POSTs it to FastAPI. The backend is responsible for verification / signing.
  //
  // BACKEND DEPENDENCY -- POST /api/batteries/:id/complete-assembly
  //   This endpoint does not exist yet in server/main.py. Add it:
  //
  //     @app.post("/api/batteries/{passport_id}/complete-assembly")
  //     def complete_assembly(passport_id: str, body: dict):
  //         # body contains: { steps_completed, steps_total, step_labels, completed_at }
  //         # 1. Save record to MongoDB
  //         # 2. Sign the record (HMAC or JCS seal) for tamper-evidence
  //         # 3. Update battery status to "disassembly_completed" in MongoDB
  //         # 4. Return the saved record with a "verified": true field
  //         #
  //         # Until MongoDB is wired, return a stub:
  //         return { **body, "verified": True, "signed_by": "revolt-os-server" }
  //
  // FALLBACK:
  //   If the POST fails (backend not yet live), we navigate anyway with
  //   verified: false so the badge renders in its unverified state.
  //   This keeps the demo working end-to-end without the backend.
  // ---------------------------------------------------------------------------
  async function completeAssembly() {
    if (!manifest || done.size < SAFETY_STEPS.length) return;
    setCompleting(true);

    const completedIndices = Array.from(done).sort((a, b) => a - b);

    const record = {
      passport_id:     manifest.passport_id,
      completed_at:    new Date().toISOString(),
      steps_completed: done.size,
      steps_total:     SAFETY_STEPS.length,
      step_labels:     completedIndices.map(i => SAFETY_STEPS[i]),
      verified:        false,  // Backend sets this to true after signing
    };

    try {
      const res = await fetch(
        "/api/batteries/" + manifest.passport_id + "/complete-assembly",
        {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(record),
        }
      );
      if (res.ok) {
        const serverRecord = await res.json();
        // Backend may return { ...record, verified: true, signed_by: "..." }
        Object.assign(record, serverRecord);
      }
    } catch {
      // Backend not yet live -- fall through with verified: false
    }

    navigate("/passport/" + manifest.passport_id, {
      state: {
        manifest: {
          ...manifest,
          status:          "disassembly_completed",
          assembly_record: record,
        },
      },
    });
  }

  const progress = done.size;
  const total    = SAFETY_STEPS.length;
  const pct      = Math.round((progress / total) * 100);
  const allDone  = progress === total;

  return (
    <div style={S.desktop}>
      <div style={S.windowWrap}>
        <div className="window" style={S.window}>

          <div className="titlebar">
            <div className="traffic-lights">
              <div className="tl close" onClick={() => navigate(-1)} style={{ cursor: "pointer" }} />
              <div className="tl min" />
              <div className="tl max" />
            </div>
            <div className="titlebar-title">
              Assembly Agent -- {manifest?.passport_id ?? "No Passport Loaded"}
            </div>
          </div>

          <div style={S.toolbar}>
            <button className="aqua-btn" onClick={() => navigate(-1)}>Passport</button>
            <div style={{ flex: 1 }} />
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div
                className={`led ${agentActive ? "green" : "amber"}`}
                style={agentActive ? { animation: "blink 0.8s infinite" } : {}}
              />
              <span style={{ fontSize: 11, color: "var(--text-dim)", fontWeight: "bold" }}>
                {agentActive ? "AGENT ACTIVE" : "AGENT STANDBY"}
              </span>
            </div>
          </div>

          <div className="divider" style={{ margin: "0 8px" }} />

          <div style={S.body}>

            {/* Left: Checklist */}
            <div style={S.leftCol}>
              <div style={S.colHeader}>DISASSEMBLY PROTOCOL</div>

              {manifest && (
                <div className="lcd" style={{ fontSize: 10, padding: "4px 8px" }}>
                  {manifest.battery_id?.manufacturer} {manifest.battery_id?.model}
                  {" | "}{manifest.health_grade} | {manifest.passport_id}
                </div>
              )}

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 3, color: "var(--text-dim)" }}>
                  <span>PROGRESS</span>
                  <span style={{ fontFamily: "var(--font-mono)" }}>{pct}% ({progress}/{total})</span>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${pct}%` }} />
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {SAFETY_STEPS.map((label, i) => {
                  const isDone = done.has(i);
                  return (
                    <div
                      key={i}
                      className="inset-panel"
                      style={{
                        display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 10px",
                        background: isDone ? "rgba(0,200,68,0.12)" : "rgba(255,255,255,0.35)",
                        borderColor: isDone ? "rgba(0,180,50,0.4)" : "rgba(100,140,200,0.5)",
                        cursor: "pointer", transition: "background 0.15s",
                      }}
                      onClick={() => toggleStep(i)}
                    >
                      <div className={`led ${isDone ? "green" : "gray"}`} style={{ flexShrink: 0, marginTop: 2 }} />
                      <div>
                        <div style={{ fontSize: 9, fontWeight: "bold", color: "var(--text-dim)", letterSpacing: "0.08em", marginBottom: 2 }}>
                          STEP {String(i + 1).padStart(2, "0")}
                          {isDone && <span style={{ color: "var(--green)", marginLeft: 6 }}>LOGGED</span>}
                        </div>
                        <div style={{
                          fontSize: 11,
                          color: isDone ? "var(--text-dim)" : "var(--text)",
                          textDecoration: isDone ? "line-through" : "none",
                        }}>
                          {label}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Complete button -- appears only when all steps are done */}
              {allDone && (
                <button
                  className="aqua-btn primary"
                  style={{ width: "100%", padding: "10px 0", fontSize: 12, opacity: completing ? 0.6 : 1 }}
                  onClick={completeAssembly}
                  disabled={completing}
                >
                  {completing ? "Saving record..." : "Complete Assembly -- Return to Passport"}
                </button>
              )}
            </div>

            {/* Right: Voice agent */}
            <div style={S.rightCol}>
              <div style={S.colHeader}>VOICE SAFETY FOREMAN</div>

              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "8px 0" }}>
                <button
                  className="aqua-btn"
                  style={{
                    width: 100, height: 100, borderRadius: "50%",
                    display: "flex", flexDirection: "column", alignItems: "center",
                    justifyContent: "center", gap: 6, transition: "background 0.2s",
                    background: agentActive
                      ? "linear-gradient(180deg, #88ffaa 0%, #00cc44 40%, #008822 100%)"
                      : undefined,
                    borderColor: agentActive ? "#006618" : undefined,
                    color:       agentActive ? "#003308" : undefined,
                  }}
                  onClick={toggleAgent}
                >
                  <span style={{ fontSize: 20, fontFamily: "var(--font-mono)" }}>
                    {agentActive ? "[REC]" : "[MIC]"}
                  </span>
                  <span style={{ fontSize: 10, letterSpacing: "0.06em" }}>
                    {agentActive ? "TAP TO END" : "TAP TO SPEAK"}
                  </span>
                </button>

                {!ELEVENLABS_AGENT_ID && (
                  <div className="inset-panel" style={{
                    fontSize: 10, color: "#885500", textAlign: "center",
                    padding: "6px 10px", maxWidth: 260, lineHeight: 1.5,
                    background: "rgba(255,153,0,0.1)", borderColor: "rgba(255,153,0,0.3)",
                  }}>
                    Demo mode -- set ELEVENLABS_AGENT_ID at the top of this file to go live
                  </div>
                )}
              </div>

              <div className="divider" />

              <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                <div style={S.colHeader}>TRANSCRIPT</div>
                <div className="inset-panel" style={{
                  display: "flex", flexDirection: "column", gap: 8,
                  padding: 8, minHeight: 120, maxHeight: 220, overflowY: "auto",
                }}>
                  {transcript.map((msg, i) => (
                    <div key={i} style={{ display: "flex", gap: 6 }}>
                      <div style={{
                        fontSize: 9, fontWeight: "bold", letterSpacing: "0.06em",
                        whiteSpace: "nowrap", marginTop: 1, flexShrink: 0,
                        color: msg.role === "agent" ? "var(--aqua-blue)" : "var(--text-dim)",
                      }}>
                        {msg.role === "agent" ? "FOREMAN:" : "TECH:"}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text)", lineHeight: 1.5 }}>
                        {msg.text}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {manifest?.thermal_stress_flag && (
                <>
                  <div className="divider" />
                  <div style={{ padding: "8px 10px", background: "rgba(255,153,0,0.1)", border: "1px solid rgba(255,153,0,0.35)", borderRadius: 2 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <div className="led amber" style={{ animation: "blink 1.2s infinite" }} />
                      <span style={{ fontSize: 9, fontWeight: "bold", letterSpacing: "0.1em", color: "#885500" }}>RISK ALERT</span>
                    </div>
                    <div style={{ fontSize: 10, color: "#885500", lineHeight: 1.5 }}>{manifest.risk_summary}</div>
                  </div>
                </>
              )}
            </div>

          </div>

          <div className="divider" style={{ margin: "0 8px" }} />
          <div style={S.statusBar}>
            <span>{allDone ? "All steps complete -- ready to finalise." : `${total - progress} steps remaining.`}</span>
            <span style={{ fontFamily: "var(--font-mono)" }}>Agent: {ELEVENLABS_AGENT_ID ?? "not configured"}</span>
          </div>

        </div>
      </div>

      <div style={S.taskbar}>
        <button className="aqua-btn" onClick={() => navigate("/audit")}>ReVolt OS</button>
        <div style={S.clock}>{new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
      </div>
    </div>
  );
}

const S = {
  desktop:   { minHeight: "100vh", background: "linear-gradient(135deg, #5578aa 0%, #7a9cc8 50%, #4a6899 100%)", display: "flex", flexDirection: "column" },
  windowWrap:{ flex: 1, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "16px 12px 4px" },
  window:    { width: "100%", maxWidth: 960 },
  toolbar:   { display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", background: "rgba(210,225,245,0.8)" },
  body:      { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: 10 },
  leftCol:   { display: "flex", flexDirection: "column", gap: 8 },
  rightCol:  { display: "flex", flexDirection: "column", gap: 8 },
  colHeader: { fontSize: 9, fontWeight: "bold", color: "var(--text-dim)", letterSpacing: "0.14em", marginBottom: 2 },
  statusBar: { display: "flex", justifyContent: "space-between", padding: "4px 10px", background: "rgba(200,215,235,0.8)", fontSize: 10, color: "var(--text-dim)" },
  taskbar:   { background: "linear-gradient(180deg, #3a6aaa 0%, #1a4a88 100%)", borderTop: "1px solid #6090cc", padding: "4px 10px", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 -2px 8px rgba(0,0,0,0.4)" },
  clock:     { color: "#ddeeff", fontSize: 11, fontFamily: "var(--font-mono)", background: "rgba(0,0,0,0.3)", padding: "2px 8px", borderRadius: 2 },
};
