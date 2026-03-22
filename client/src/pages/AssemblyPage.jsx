// =============================================================================
// pages/AssemblyPage.jsx -- Page 3 of 3
//
// Mic button: canvas-based radial frequency bar visualizer (like ref image 2).
// Draws imperatively via requestAnimationFrame -- zero React state in render loop.
// Two channels: mic (getUserMedia) + agent (MediaElementAudioSourceNode).
// FFT frequency bins map to radial bars around the button circumference.
// =============================================================================

import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useConversation } from "@elevenlabs/react";

const SAFETY_STEPS = [
  "Confirm PPE: insulated gloves, face shield, arc-flash suit",
  "Verify battery discharged below 5V total pack voltage",
  "Disconnect HV connector and isolate BMS harness",
  "Remove cell modules per recommended config",
  "Inspect cells for swelling, leakage, or thermal marks",
  "Seal and label cells for storage or transport",
];

const MOCK_RESPONSES = [
  "Confirmed. Thermal stress flag is active -- proceed with extra caution.",
  (m) =>
    "Noted. Recommended config is: " +
    (m?.recommended_config ?? "see passport") +
    ".",
  "Check for swelling around cell block C before continuing.",
  (m) =>
    "SOH is " +
    (m?.state_of_health_pct ?? "---") +
    "%. Remaining cells are within safe parameters.",
  "Step logged. Proceed when ready.",
];

// =============================================================================
// useAudioAnalyser -- two-channel Web Audio setup
// =============================================================================
function useAudioAnalyser() {
  const ctxRef = useRef(null);
  const micAn = useRef(null);
  const agentAn = useRef(null);
  const micStream = useRef(null);

  const init = useCallback(async () => {
    if (ctxRef.current) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    ctxRef.current = ctx;

    // Mic analyser -- FFT for frequency bars
    const mAn = ctx.createAnalyser();
    mAn.fftSize = 256;
    mAn.smoothingTimeConstant = 0.82;
    micAn.current = mAn;

    // Agent analyser
    const aAn = ctx.createAnalyser();
    aAn.fftSize = 256;
    aAn.smoothingTimeConstant = 0.82;
    agentAn.current = aAn;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      micStream.current = stream;
      ctx.createMediaStreamSource(stream).connect(mAn);
      // no mic -> destination (prevent feedback)
    } catch (err) {
      console.warn("[ReVolt] Mic:", err.message);
    }
  }, []);

  const connectAgentElement = useCallback((el) => {
    if (!ctxRef.current || !agentAn.current || !el) return;
    try {
      const src = ctxRef.current.createMediaElementSource(el);
      src.connect(agentAn.current);
      src.connect(ctxRef.current.destination);
    } catch {
      /* already connected */
    }
  }, []);

  // Returns merged frequency data (0..255 uint8, length = fftSize/2 = 128)
  const getFrequency = useCallback(() => {
    const size = 128;
    const mic = new Uint8Array(size);
    const agent = new Uint8Array(size);
    micAn.current?.getByteFrequencyData(mic);
    agentAn.current?.getByteFrequencyData(agent);
    const merged = new Uint8Array(size);
    for (let i = 0; i < size; i++) merged[i] = Math.max(mic[i], agent[i]);
    return merged;
  }, []);

  const destroy = useCallback(() => {
    micStream.current?.getTracks().forEach((t) => t.stop());
    ctxRef.current?.close();
    ctxRef.current = micAn.current = agentAn.current = micStream.current = null;
  }, []);

  return { init, destroy, getFrequency, connectAgentElement };
}

// =============================================================================
// MicButton -- canvas drawn imperatively, radial frequency bars like ref image
// =============================================================================
const BTN_SIZE = 160;

function MicButton({ active, pressing, onPressStart, onPressEnd, onClick, getFrequency }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const smoothRef = useRef(new Float32Array(64).fill(0));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = BTN_SIZE;
    const H = BTN_SIZE;
    const cx = W / 2;
    const cy = H / 2;
    const NUM_BARS = 64;
    const INNER_R = W * 0.28; // inner radius where bars start
    const MAX_BAR_H = W * 0.2; // max bar length outward

    function draw() {
      ctx.clearRect(0, 0, W, H);

      if (pressing) {
        const raw = getFrequency(); // Uint8Array[128], use first 64
        const sm = smoothRef.current;
        for (let i = 0; i < NUM_BARS; i++) {
          sm[i] = sm[i] * 0.75 + (raw[i] / 255) * 0.25;
        }

        for (let i = 0; i < NUM_BARS; i++) {
          const angle = (i / NUM_BARS) * Math.PI * 2 - Math.PI / 2;
          const barH = sm[i] * MAX_BAR_H;
          const x1 = cx + INNER_R * Math.cos(angle);
          const y1 = cy + INNER_R * Math.sin(angle);
          const x2 = cx + (INNER_R + barH) * Math.cos(angle);
          const y2 = cy + (INNER_R + barH) * Math.sin(angle);

          const hue = ((i / NUM_BARS) * 200 + 140) % 360;
          const alpha = 0.5 + sm[i] * 0.5;
          ctx.strokeStyle = `hsla(${hue}, 100%, 60%, ${alpha})`;
          ctx.lineWidth = (W / NUM_BARS) * 0.55;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }

        // Inner glow ring
        const grd = ctx.createRadialGradient(
          cx, cy, INNER_R * 0.7, cx, cy, INNER_R,
        );
        grd.addColorStop(0, "rgba(0,255,136,0.0)");
        grd.addColorStop(1, "rgba(0,255,136,0.12)");
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(cx, cy, INNER_R, 0, Math.PI * 2);
        ctx.fill();
      } else if (active) {
        // Session active but not pressing — subtle breathing ring
        smoothRef.current = new Float32Array(64).fill(0);
        const pulse = 0.15 + Math.sin(Date.now() / 600) * 0.08;
        ctx.strokeStyle = `rgba(0,200,120,${pulse})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, INNER_R + 4, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        // Idle: subtle dotted ring
        smoothRef.current = new Float32Array(64).fill(0);
        ctx.strokeStyle = "rgba(100,160,220,0.25)";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.arc(cx, cy, INNER_R + 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [active, pressing, getFrequency]);

  return (
    <button
      onClick={!active ? onClick : undefined}
      onMouseDown={active ? onPressStart : undefined}
      onMouseUp={active ? onPressEnd : undefined}
      onMouseLeave={active && pressing ? onPressEnd : undefined}
      onTouchStart={active ? onPressStart : undefined}
      onTouchEnd={active ? onPressEnd : undefined}
      style={{
        position: "relative",
        width: BTN_SIZE,
        height: BTN_SIZE,
        borderRadius: "50%",
        border: `2px solid ${pressing ? "rgba(0,255,136,0.7)" : active ? "rgba(0,200,120,0.45)" : "rgba(96,144,192,0.55)"}`,
        background: pressing
          ? "radial-gradient(circle at 40% 35%, #0d2318, #040d08)"
          : active
            ? "radial-gradient(circle at 40% 35%, #0a1a12, #030a06)"
            : "radial-gradient(circle at 40% 35%, #ddeeff, #b8d0ec)",
        boxShadow: pressing
          ? "0 0 32px rgba(0,255,136,0.3), inset 0 0 16px rgba(0,0,0,0.65), 2px 2px 0 rgba(0,0,0,0.4)"
          : active
            ? "0 0 12px rgba(0,255,136,0.1), inset 0 0 16px rgba(0,0,0,0.65), 2px 2px 0 rgba(0,0,0,0.4)"
            : "2px 2px 0 rgba(0,0,0,0.4), -1px -1px 0 rgba(255,255,255,0.85), inset 0 1px 0 rgba(255,255,255,0.55)",
        cursor: "pointer",
        overflow: "hidden",
        padding: 0,
        transition: "background 0.2s, box-shadow 0.2s, border-color 0.2s",
        flexShrink: 0,
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      <canvas
        ref={canvasRef}
        width={BTN_SIZE}
        height={BTN_SIZE}
        style={{ position: "absolute", inset: 0, borderRadius: "50%", pointerEvents: "none" }}
      />

      {/* Label changes based on state */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 5,
          opacity: pressing ? 0 : 1,
          transition: "opacity 0.2s",
          pointerEvents: "none",
          zIndex: 2,
        }}
      >
        <span style={{ fontSize: 26, lineHeight: 1 }}>🎙</span>
        <span
          style={{
            fontSize: 8,
            fontFamily: "var(--font-mono)",
            color: active ? "#00ff88" : "var(--text-dim)",
            letterSpacing: "0.1em",
            textShadow: active ? "0 0 6px #00ff88" : "none",
          }}
        >
          {active ? "HOLD TO TALK" : "TAP TO CONNECT"}
        </span>
      </div>

      {/* Live badge when pressing */}
      {pressing && (
        <div
          style={{
            position: "absolute",
            bottom: 14,
            left: 0,
            right: 0,
            textAlign: "center",
            fontSize: 8,
            fontFamily: "var(--font-mono)",
            color: "#00ff88",
            letterSpacing: "0.12em",
            textShadow: "0 0 8px #00ff88",
            pointerEvents: "none",
            zIndex: 2,
          }}
        >
          ● LIVE
        </div>
      )}
    </button>
  );
}

// =============================================================================
// LiveClock
// =============================================================================
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
// AssemblyPage
// =============================================================================
export default function AssemblyPage() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const manifest = state?.manifest;

  // agentId is fetched from GET /api/config on mount.
  // It is never hardcoded here -- the backend reads it from its own .env.
  const [agentId, setAgentId] = useState(null);
  const [agentActive, setAgentActive] = useState(false);
  const [pressing, setPressing] = useState(false);
  const [done, setDone] = useState(new Set());
  const [completing, setCompleting] = useState(false);
  const [transcript, setTranscript] = useState([
    {
      role: "agent",
      text: "Safety foreman online. Battery passport loaded. Ready to begin.",
    },
  ]);
  const mockIdx = useRef(0);
  const transcriptRef = useRef(null);
  const { init, destroy, getFrequency } = useAudioAnalyser();

  // Stable ref so MicButton's useEffect doesn't re-fire
  const freqRef = useRef(getFrequency);
  useEffect(() => {
    freqRef.current = getFrequency;
  }, [getFrequency]);
  const stableFreq = useCallback(() => freqRef.current(), []);

  // Fetch agent ID from backend on mount.
  useEffect(() => {
    fetch("/api/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.elevenlabs_agent_id) setAgentId(data.elevenlabs_agent_id);
      })
      .catch(() => {});
  }, []);

  // ElevenLabs Conversational AI hook.
  // micMuted: true = mic is muted (default). Only unmuted while pressing.
  const conversation = useConversation({
    micMuted: !pressing,
    clientTools: {
      log_milestone: ({ step_index, step_label }) => {
        setDone((prev) => new Set([...prev, step_index]));
        setTranscript((t) => [
          ...t,
          {
            role: "agent",
            text: "Step " + (step_index + 1) + " logged: " + step_label,
          },
        ]);
        return "Milestone logged.";
      },
    },
    onMessage: (event) => {
      // source is "ai" for agent messages, "user" for user transcriptions
      if (event.source === "ai" && event.message) {
        setTranscript((t) => [...t, { role: "agent", text: event.message }]);
      }
      if (event.source === "user" && event.message) {
        setTranscript((t) => [...t, { role: "user", text: event.message }]);
      }
    },
    onError: (err) => console.error("[ElevenLabs]", err),
  });

  /*async function toggleAgent() {
    if (agentActive) {
      await conversation.endSession();
      destroy();
      setAgentActive(false);
      setTranscript((t) => [...t, { role: "agent", text: "Session ended." }]);
    } else {
      await init();
      if (agentId) {
        // Live mode: start ElevenLabs session with battery passport as context
        await conversation.startSession({
          agentId,
          connectionType: "webrtc",
          overrides: manifest
            ? {
                agent: {
                  prompt: {
                    prompt:
                      "BATTERY PASSPORT FOR THIS SESSION:\n" +
                      JSON.stringify(manifest, null, 2),
                  },
                },
              }
            : undefined,
        });
        setTranscript((t) => [
          ...t,
          { role: "agent", text: "Connecting to ElevenLabs..." },
        ]);
      } else {
        // Demo mode: mic visualizer works, agent audio simulated
        setTranscript((t) => [
          ...t,
          {
            role: "agent",
            text: "Demo mode active. Mic is live -- speak to see visualizer.",
          },
        ]);
      }
      setAgentActive(true);
    }
  } */
  async function toggleAgent() {
    if (agentActive) {
      await conversation.endSession();
      destroy();
      setAgentActive(false);
      setPressing(false);
      setTranscript((t) => [...t, { role: "agent", text: "Session ended." }]);
    } else {
      await conversation.startSession({
        agentId,
        connectionType: "webrtc",
        overrides: manifest
          ? {
              agent: {
                prompt: {
                  prompt:
                    "BATTERY PASSPORT FOR THIS SESSION:\n" +
                    JSON.stringify(manifest, null, 2),
                },
              },
            }
          : undefined,
      });
      // Init visualizer AFTER WebRTC is established to avoid AudioContext conflict
      await init();
      setAgentActive(true);
      setTranscript((t) => [
        ...t,
        { role: "agent", text: "Connected. Hold the mic button to speak." },
      ]);
    }
  }

  // Press-to-talk: hold to unmute, release to mute
  function handlePressStart(e) {
    e.preventDefault();
    setPressing(true);
    // ElevenLabs useConversation handles mic automatically via WebRTC
    // The pressing state controls the visual feedback
  }

  function handlePressEnd(e) {
    e.preventDefault();
    setPressing(false);
  }

  // Auto-scroll transcript to bottom
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [transcript]);

  function toggleStep(i) {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(i)) {
        next.delete(i);
        return next;
      }
      next.add(i);
      // Demo mode only: simulate agent response when step is tapped manually.
      // In live mode, the agent drives this via onToolCall above.
      if (!agentId) {
        const resp = MOCK_RESPONSES[mockIdx.current % MOCK_RESPONSES.length];
        mockIdx.current++;
        setTranscript((t) => [
          ...t,
          {
            role: "agent",
            text: typeof resp === "function" ? resp(manifest) : resp,
          },
        ]);
      }
      return next;
    });
  }

  async function completeAssembly() {
    if (!manifest || done.size < SAFETY_STEPS.length) return;
    setCompleting(true);
    const sorted = Array.from(done).sort((a, b) => a - b);
    const record = {
      passport_id: manifest.passport_id,
      completed_at: new Date().toISOString(),
      steps_completed: done.size,
      steps_total: SAFETY_STEPS.length,
      step_labels: sorted.map((i) => SAFETY_STEPS[i]),
      verified: false,
    };
    try {
      const res = await fetch(
        "/api/batteries/" + manifest.passport_id + "/complete-assembly",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(record),
        },
      );
      if (res.ok) Object.assign(record, await res.json());
    } catch {
      /* backend offline */
    }
    navigate("/passport/" + manifest.passport_id, {
      state: {
        manifest: {
          ...manifest,
          status: "disassembly_completed",
          assembly_record: record,
        },
      },
    });
  }

  useEffect(() => () => destroy(), [destroy]);

  const pct = Math.round((done.size / SAFETY_STEPS.length) * 100);
  const allDone = done.size === SAFETY_STEPS.length;

  return (
    <div style={S.desktop}>
      <div style={S.windowWrap}>
        <div className="window" style={S.window}>
          <div className="titlebar">
            <div className="traffic-lights">
              <div
                className="tl close"
                onClick={() => navigate(-1)}
                style={{ cursor: "pointer" }}
              />
              <div className="tl min" />
              <div className="tl max" />
            </div>
            <div className="titlebar-title">
              Assembly Agent -- {manifest?.passport_id ?? "No Passport Loaded"}
            </div>
          </div>

          <div style={S.toolbar}>
            <button className="aqua-btn" onClick={() => navigate(-1)}>
              Passport
            </button>
            <div style={{ flex: 1 }} />
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div
                className={`led ${agentActive ? "green" : "amber"}`}
                style={agentActive ? { animation: "blink 0.8s infinite" } : {}}
              />
              <span
                style={{
                  fontSize: 11,
                  color: "var(--text-dim)",
                  fontWeight: "bold",
                }}
              >
                {pressing ? "LISTENING..." : agentActive ? "AGENT ACTIVE" : "AGENT STANDBY"}
              </span>
            </div>
          </div>

          <div className="divider" style={{ margin: "0 8px" }} />

          <div style={S.body}>
            {/* ---- Left: Checklist ---- */}
            <div style={S.leftCol}>
              <div style={S.colHeader}>DISASSEMBLY PROTOCOL</div>

              {manifest && (
                <div
                  className="lcd"
                  style={{ fontSize: 10, padding: "4px 8px" }}
                >
                  {manifest.battery_id?.manufacturer}{" "}
                  {manifest.battery_id?.model}
                  {" | "}
                  {manifest.health_grade} | {manifest.passport_id}
                </div>
              )}

              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 10,
                    marginBottom: 3,
                    color: "var(--text-dim)",
                  }}
                >
                  <span>PROGRESS</span>
                  <span style={{ fontFamily: "var(--font-mono)" }}>
                    {pct}% ({done.size}/{SAFETY_STEPS.length})
                  </span>
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
                      onClick={() => toggleStep(i)}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 8,
                        padding: "8px 10px",
                        cursor: "pointer",
                        transition: "background 0.15s",
                        background: isDone
                          ? "rgba(0,200,68,0.12)"
                          : "rgba(255,255,255,0.35)",
                        borderColor: isDone
                          ? "rgba(0,180,50,0.4)"
                          : "rgba(100,140,200,0.5)",
                      }}
                    >
                      <div
                        className={`led ${isDone ? "green" : "gray"}`}
                        style={{ flexShrink: 0, marginTop: 2 }}
                      />
                      <div>
                        <div
                          style={{
                            fontSize: 9,
                            fontWeight: "bold",
                            color: "var(--text-dim)",
                            letterSpacing: "0.08em",
                            marginBottom: 2,
                          }}
                        >
                          STEP {String(i + 1).padStart(2, "0")}
                          {isDone && (
                            <span
                              style={{ color: "var(--green)", marginLeft: 6 }}
                            >
                              LOGGED
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: isDone ? "var(--text-dim)" : "var(--text)",
                            textDecoration: isDone ? "line-through" : "none",
                          }}
                        >
                          {label}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {allDone && (
                <button
                  className="aqua-btn primary"
                  style={{
                    width: "100%",
                    padding: "10px 0",
                    fontSize: 12,
                    opacity: completing ? 0.6 : 1,
                  }}
                  onClick={completeAssembly}
                  disabled={completing}
                >
                  {completing
                    ? "Saving record..."
                    : "Complete Assembly -- Return to Passport"}
                </button>
              )}
            </div>

            {/* ---- Right: Voice agent ---- */}
            <div style={S.rightCol}>
              <div style={S.colHeader}>VOICE SAFETY FOREMAN</div>

              {/* Mic button centered with canvas visualizer */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 0 6px",
                }}
              >
                <MicButton
                  active={agentActive}
                  pressing={pressing}
                  onPressStart={handlePressStart}
                  onPressEnd={handlePressEnd}
                  onClick={toggleAgent}
                  getFrequency={stableFreq}
                />

                {/* Channel pills */}
                <div style={{ display: "flex", gap: 6 }}>
                  {[
                    { label: "MIC IN", on: agentActive },
                    { label: "AGENT OUT", on: agentActive && !!agentId },
                    { label: "48kHz", on: agentActive },
                  ].map(({ label, on }) => (
                    <div key={label} style={S.pill}>
                      <div
                        className={`led ${on ? "green" : "gray"}`}
                        style={{ width: 7, height: 7 }}
                      />
                      <span>{label}</span>
                    </div>
                  ))}
                </div>

                {!agentId && (
                  <div
                    className="inset-panel"
                    style={{
                      fontSize: 10,
                      color: "#885500",
                      textAlign: "center",
                      padding: "5px 12px",
                      lineHeight: 1.5,
                      background: "rgba(255,153,0,0.1)",
                      borderColor: "rgba(255,153,0,0.3)",
                    }}
                  >
                    Demo mode -- mic is real, agent audio simulated
                  </div>
                )}
              </div>

              <div className="divider" />

              {/* Transcript */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  flex: 1,
                }}
              >
                <div style={S.colHeader}>TRANSCRIPT</div>
                <div
                  ref={transcriptRef}
                  className="inset-panel"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    padding: 8,
                    minHeight: 120,
                    maxHeight: 280,
                    overflowY: "auto",
                    scrollBehavior: "smooth",
                  }}
                >
                  {transcript.map((msg, i) => (
                    <div key={i} style={{ display: "flex", gap: 6 }}>
                      <div
                        style={{
                          fontSize: 9,
                          fontWeight: "bold",
                          letterSpacing: "0.06em",
                          whiteSpace: "nowrap",
                          marginTop: 1,
                          flexShrink: 0,
                          color:
                            msg.role === "agent"
                              ? "var(--aqua-blue)"
                              : "var(--text-dim)",
                        }}
                      >
                        {msg.role === "agent" ? "FOREMAN:" : "TECH:"}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--text)",
                          lineHeight: 1.5,
                        }}
                      >
                        {msg.text}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {manifest?.thermal_stress_flag && (
                <>
                  <div className="divider" />
                  <div
                    style={{
                      padding: "8px 10px",
                      background: "rgba(255,153,0,0.1)",
                      border: "1px solid rgba(255,153,0,0.35)",
                      borderRadius: 2,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        marginBottom: 4,
                      }}
                    >
                      <div
                        className="led amber"
                        style={{ animation: "blink 1.2s infinite" }}
                      />
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: "bold",
                          letterSpacing: "0.1em",
                          color: "#885500",
                        }}
                      >
                        RISK ALERT
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: "#885500",
                        lineHeight: 1.5,
                      }}
                    >
                      {manifest.risk_summary}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="divider" style={{ margin: "0 8px" }} />
          <div style={S.statusBar}>
            <span>
              {allDone
                ? "All steps complete -- ready to finalise."
                : `${SAFETY_STEPS.length - done.size} steps remaining.`}
            </span>
            <span style={{ fontFamily: "var(--font-mono)" }}>
              Agent: {agentId ?? "not configured"}
            </span>
          </div>
        </div>
      </div>

      <div style={S.taskbar}>
        <button className="aqua-btn" onClick={() => navigate("/audit")}>
          ReVolt OS
        </button>
        <LiveClock />
      </div>
    </div>
  );
}

const S = {
  desktop: {
    minHeight: "100vh",
    background:
      "linear-gradient(135deg, #5578aa 0%, #7a9cc8 50%, #4a6899 100%)",
    display: "flex",
    flexDirection: "column",
  },
  windowWrap: {
    flex: 1,
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    padding: "16px 12px 4px",
  },
  window: { width: "100%", maxWidth: 960 },
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 8px",
    background: "rgba(210,225,245,0.8)",
  },
  body: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 8,
    padding: 10,
  },
  leftCol: { display: "flex", flexDirection: "column", gap: 8 },
  rightCol: { display: "flex", flexDirection: "column", gap: 8 },
  colHeader: {
    fontSize: 9,
    fontWeight: "bold",
    color: "var(--text-dim)",
    letterSpacing: "0.14em",
    marginBottom: 2,
  },
  statusBar: {
    display: "flex",
    justifyContent: "space-between",
    padding: "4px 10px",
    background: "rgba(200,215,235,0.8)",
    fontSize: 10,
    color: "var(--text-dim)",
  },
  taskbar: {
    background: "linear-gradient(180deg, #3a6aaa 0%, #1a4a88 100%)",
    borderTop: "1px solid #6090cc",
    padding: "4px 10px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    boxShadow: "0 -2px 8px rgba(0,0,0,0.4)",
  },
  pill: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    fontSize: 9,
    fontWeight: "bold",
    color: "var(--text-dim)",
    letterSpacing: "0.05em",
    background: "rgba(255,255,255,0.28)",
    border: "1px solid rgba(100,140,200,0.4)",
    borderRadius: 2,
    padding: "2px 6px",
  },
};