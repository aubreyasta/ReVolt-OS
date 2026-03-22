// =============================================================================
// pages/BlueprintPage.jsx -- Upcycle Blueprint Viewer
//
// Reached via: navigate("/blueprint/<id>", { state: { manifest } })
// from PassportPage when user clicks "View Blueprint".
//
// Features:
//   - Target system stats grid
//   - Three.js 3D rotating module visualization (from blueprint_viewer.html)
//   - Module assessment cards (keep/bypass/replace)
//   - Step-by-step procedure (click to expand)
//   - Tools + parts sidebar
//   - Pre-upcycle checklist gating the Start Assembly button
//   - Post-upcycle verification table
//   - Gemini engineering notes
// =============================================================================

import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

// =============================================================================
// Three.js 3D Module Viewer -- loaded via CDN script tag
// =============================================================================
function ThreeModuleViewer({ modules }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || !modules?.length) return;

    // Load Three.js from CDN if not already loaded
    function initScene() {
      const THREE = window.THREE;
      if (!THREE) return;

      const container = containerRef.current;
      if (!container) return;

      const w = container.clientWidth;
      const h = 280;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x080c14);

      const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100);
      camera.position.set(5, 4, 7);
      camera.lookAt(0, 0, 0);

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      container.appendChild(renderer.domElement);

      // Lighting
      scene.add(new THREE.AmbientLight(0x404060, 0.6));
      const dir = new THREE.DirectionalLight(0xffffff, 0.8);
      dir.position.set(5, 8, 5);
      scene.add(dir);
      const pt = new THREE.PointLight(0x22d3ee, 0.4, 20);
      pt.position.set(-3, 3, 3);
      scene.add(pt);

      // Grid
      const grid = new THREE.GridHelper(10, 20, 0x1e293b, 0x111827);
      grid.position.y = -1.5;
      scene.add(grid);

      const colorMap = { Keep: 0x22c55e, Bypass: 0xef4444, Replace: 0xf59e0b };

      const group = new THREE.Group();
      const MW = 1.0,
        MH = 0.6,
        MD = 1.8,
        gap = 0.15;
      const cols = Math.ceil(modules.length / 2);

      modules.forEach((m, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = (col - (cols - 1) / 2) * (MW + gap);
        const y = row * (MH + gap);

        const geo = new THREE.BoxGeometry(MW, MH, MD);
        const mat = new THREE.MeshPhongMaterial({
          color: colorMap[m.status] || 0x64748b,
          transparent: true,
          opacity: m.status === "Bypass" ? 0.4 : 0.85,
          specular: 0x222222,
          shininess: 30,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y, 0);
        group.add(mesh);

        const edges = new THREE.EdgesGeometry(geo);
        const wire = new THREE.LineSegments(
          edges,
          new THREE.LineBasicMaterial({
            color: 0x94a3b8,
            transparent: true,
            opacity: 0.3,
          }),
        );
        wire.position.copy(mesh.position);
        group.add(wire);

        // Busbar between adjacent keep modules
        if (
          m.status === "Keep" &&
          i < modules.length - 1 &&
          modules[i + 1]?.status === "Keep"
        ) {
          const nextCol = (i + 1) % cols;
          if (Math.floor((i + 1) / cols) === row) {
            const nextX = (nextCol - (cols - 1) / 2) * (MW + gap);
            const bar = new THREE.Mesh(
              new THREE.CylinderGeometry(0.04, 0.04, gap + 0.1, 8),
              new THREE.MeshPhongMaterial({ color: 0xf59e0b, shininess: 80 }),
            );
            bar.rotation.z = Math.PI / 2;
            bar.position.set((x + nextX) / 2, y, 0.6);
            group.add(bar);
          }
        }
      });

      scene.add(group);

      // Orbit state
      let isDragging = false,
        prevX = 0,
        prevY = 0,
        rotX = 0.3,
        rotY = 0,
        zoom = 7;

      const el = renderer.domElement;
      el.addEventListener("mousedown", (e) => {
        isDragging = true;
        prevX = e.clientX;
        prevY = e.clientY;
      });
      el.addEventListener("mouseup", () => (isDragging = false));
      el.addEventListener("mouseleave", () => (isDragging = false));
      el.addEventListener("mousemove", (e) => {
        if (!isDragging) return;
        rotY += (e.clientX - prevX) * 0.005;
        rotX = Math.max(-1, Math.min(1.2, rotX + (e.clientY - prevY) * 0.005));
        prevX = e.clientX;
        prevY = e.clientY;
      });
      el.addEventListener(
        "wheel",
        (e) => {
          e.preventDefault();
          zoom = Math.max(3, Math.min(15, zoom + e.deltaY * 0.01));
        },
        { passive: false },
      );

      let rafId;
      function animate() {
        rafId = requestAnimationFrame(animate);
        rotY += 0.002;
        camera.position.x = Math.sin(rotY) * Math.cos(rotX) * zoom;
        camera.position.y = Math.sin(rotX) * zoom * 0.6 + 2;
        camera.position.z = Math.cos(rotY) * Math.cos(rotX) * zoom;
        camera.lookAt(0, 0, 0);
        renderer.render(scene, camera);
      }
      animate();

      // Resize
      const ro = new ResizeObserver(() => {
        if (!container) return;
        const nw = container.clientWidth;
        camera.aspect = nw / h;
        camera.updateProjectionMatrix();
        renderer.setSize(nw, h);
      });
      ro.observe(container);

      // Cleanup
      return () => {
        cancelAnimationFrame(rafId);
        ro.disconnect();
        renderer.dispose();
        if (container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement);
        }
      };
    }

    if (window.THREE) {
      const cleanup = initScene();
      return cleanup;
    } else {
      const script = document.createElement("script");
      script.src =
        "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
      script.onload = () => {
        const cleanup = initScene();
        // store cleanup for effect teardown -- not directly possible here so we skip for CDN load path
      };
      document.head.appendChild(script);
    }
  }, [modules]);

  return (
    <div style={{ position: "relative" }}>
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: 280,
          borderRadius: 10,
          overflow: "hidden",
          border: "1px solid rgba(148,163,184,.15)",
          background: "#080c14",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 8,
          left: "50%",
          transform: "translateX(-50%)",
          fontSize: 11,
          color: "#64748b",
          background: "rgba(0,0,0,.6)",
          padding: "3px 10px",
          borderRadius: 4,
          pointerEvents: "none",
        }}
      >
        Drag to rotate · Scroll to zoom
      </div>
    </div>
  );
}

// =============================================================================
// Main page
// =============================================================================
export default function BlueprintPage() {
  const { state } = useLocation();
  const { id } = useParams();
  const navigate = useNavigate();
  const manifest = state?.manifest;
  const blueprint = manifest?.upcycle_blueprint;

  const [activeStep, setActiveStep] = useState(0);
  const [checked, setChecked] = useState(new Set());

  const totalChecks = blueprint?.pre_upcycle_checklist?.length ?? 0;
  const allChecked = checked.size >= totalChecks && totalChecks > 0;

  function toggleCheck(i) {
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  if (!manifest) {
    return (
      <div style={S.desktop}>
        <div style={S.center}>
          <div style={S.errorBox}>
            <div style={{ fontSize: 13, marginBottom: 8 }}>
              No manifest loaded for ID: <b>{id}</b>
            </div>
            <button
              className="aqua-btn primary"
              onClick={() => navigate("/audit")}
            >
              Back to Audit
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!blueprint) {
    return (
      <div style={S.desktop}>
        <PageHeader manifest={manifest} navigate={navigate} />
        <div style={S.center}>
          <div style={S.rejectedBox}>
            <div
              style={{
                fontSize: 18,
                fontWeight: "bold",
                color: "#ef4444",
                marginBottom: 12,
              }}
            >
              REJECTED FOR RECYCLING
            </div>
            <div
              style={{
                fontSize: 13,
                color: "#94a3b8",
                marginBottom: 16,
                lineHeight: 1.7,
              }}
            >
              This battery did not pass the EN 18061:2025 audit gate.
              <br />
              No upcycle blueprint was generated.
            </div>
            {manifest.audit_manifest?.rejection_reasons?.map((r, i) => (
              <div key={i} style={S.rejectionReason}>
                {r}
              </div>
            ))}
            <button
              className="aqua-btn"
              style={{ marginTop: 16 }}
              onClick={() => navigate(-1)}
            >
              Back to Passport
            </button>
          </div>
        </div>
      </div>
    );
  }

  const ts = blueprint.target_system ?? {};
  const modules = blueprint.module_assessment ?? [];
  const steps = blueprint.upcycle_steps ?? [];
  const tools = blueprint.required_tools ?? [];
  const parts = blueprint.required_parts ?? [];
  const checks = blueprint.pre_upcycle_checklist ?? [];
  const verifs = blueprint.post_upcycle_verification ?? [];
  const notes = blueprint.gemini_engineering_notes;

  return (
    <div style={S.desktop}>
      <PageHeader
        manifest={manifest}
        navigate={navigate}
        blueprint={blueprint}
      />

      <div style={S.layout}>
        {/* ==================== MAIN ==================== */}
        <div style={S.main}>
          {/* Target system */}
          <Sect title="TARGET SYSTEM">
            <div style={S.targetGrid}>
              <StatBox label="Topology" value={ts.topology} color="#22d3ee" />
              <StatBox label="Voltage" value={(ts.target_voltage ?? 0) + "V"} />
              <StatBox
                label="Capacity"
                value={(ts.target_capacity_kwh ?? 0) + " kWh"}
              />
              <StatBox
                label="Output"
                value={(ts.estimated_output_power_w ?? 0) + "W"}
              />
              <StatBox
                label="Lifespan"
                value={(ts.estimated_lifespan_years ?? 0) + " yrs"}
                color="#22c55e"
              />
              <StatBox
                label="Difficulty"
                value={blueprint.difficulty_level ?? "---"}
              />
              <StatBox
                label="Est. time"
                value={(blueprint.estimated_total_time_hours ?? 0) + " hrs"}
              />
              <StatBox
                label="Inverters"
                value={(ts.compatible_inverters ?? []).join(", ")}
                small
              />
            </div>
            {ts.topology_explanation && (
              <div style={S.topologyExplain}>{ts.topology_explanation}</div>
            )}
          </Sect>

          {/* 3D module viewer */}
          <Sect title="3D MODULE LAYOUT">
            <ThreeModuleViewer modules={modules} />
            <div style={{ display: "flex", gap: 16, marginTop: 10 }}>
              {[
                ["#22c55e", "Keep"],
                ["#ef4444", "Bypass"],
                ["#f59e0b", "Replace"],
              ].map(([c, l]) => (
                <div
                  key={l}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    color: "#94a3b8",
                  }}
                >
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 3,
                      background: c,
                    }}
                  />
                  {l}
                </div>
              ))}
            </div>
          </Sect>

          {/* Module assessment */}
          <Sect title="MODULE ASSESSMENT">
            <div style={S.modulesGrid}>
              {modules.map((m, i) => {
                const c =
                  m.status === "Keep"
                    ? "#22c55e"
                    : m.status === "Bypass"
                      ? "#ef4444"
                      : "#f59e0b";
                return (
                  <div key={i} style={{ ...S.modCard, borderLeftColor: c }}>
                    <div
                      style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}
                    >
                      {m.module_id}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        fontFamily: "monospace",
                        color: c,
                        marginBottom: 4,
                      }}
                    >
                      {m.status.toUpperCase()} · {m.cell_voltage_expected}V
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "#94a3b8",
                        lineHeight: 1.4,
                      }}
                    >
                      {m.reason}
                    </div>
                    {m.notes && (
                      <div
                        style={{
                          fontSize: 11,
                          color: "#64748b",
                          marginTop: 4,
                          fontStyle: "italic",
                        }}
                      >
                        {m.notes}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Sect>

          {/* Step-by-step */}
          <Sect title="STEP-BY-STEP PROCEDURE">
            {steps.map((s, i) => {
              const isActive = i === activeStep;
              const isDone = i < activeStep;
              return (
                <div
                  key={i}
                  style={{
                    ...S.stepCard,
                    borderColor: isActive
                      ? "#22d3ee"
                      : isDone
                        ? "#22c55e"
                        : "rgba(148,163,184,.15)",
                    opacity: isDone ? 0.65 : 1,
                  }}
                >
                  <div
                    style={S.stepHeader}
                    onClick={() => setActiveStep(isActive ? -1 : i)}
                  >
                    <div
                      style={{
                        ...S.stepNum,
                        background: isActive
                          ? "rgba(34,211,238,.15)"
                          : isDone
                            ? "rgba(34,197,94,.15)"
                            : "#1e293b",
                        color: isActive
                          ? "#22d3ee"
                          : isDone
                            ? "#22c55e"
                            : "#94a3b8",
                      }}
                    >
                      {s.step_number}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontSize: 10,
                          color: "#64748b",
                          textTransform: "uppercase",
                          letterSpacing: ".5px",
                        }}
                      >
                        {s.phase}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>
                        {s.title}
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "#64748b",
                        fontFamily: "monospace",
                      }}
                    >
                      {s.estimated_minutes}m
                    </div>
                  </div>

                  {isActive && (
                    <div style={{ padding: "0 14px 14px 54px" }}>
                      <div
                        style={{
                          fontSize: 13,
                          color: "#94a3b8",
                          lineHeight: 1.7,
                          marginBottom: 10,
                        }}
                      >
                        {s.instruction}
                      </div>
                      {s.expected_reading && (
                        <div style={S.metaReading}>
                          <b>EXPECTED: </b>
                          {s.expected_reading}
                        </div>
                      )}
                      {s.safety_warning && (
                        <div style={S.metaWarning}>
                          <b>WARNING: </b>
                          {s.safety_warning}
                        </div>
                      )}
                      {s.voice_agent_note && (
                        <div style={S.metaVoice}>
                          <b>VOICE AGENT: </b>
                          {s.voice_agent_note}
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                        {i > 0 && (
                          <button
                            className="aqua-btn"
                            style={{ fontSize: 11 }}
                            onClick={() => setActiveStep(i - 1)}
                          >
                            Prev
                          </button>
                        )}
                        {i < steps.length - 1 && (
                          <button
                            className="aqua-btn primary"
                            style={{ fontSize: 11 }}
                            onClick={() => setActiveStep(i + 1)}
                          >
                            Next step
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </Sect>

          {/* Verification */}
          {verifs.length > 0 && (
            <Sect title="POST-UPCYCLE VERIFICATION">
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 12,
                }}
              >
                <thead>
                  <tr>
                    {["Test", "Method", "Expected", "If fail"].map((h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: "left",
                          padding: 8,
                          fontSize: 10,
                          textTransform: "uppercase",
                          letterSpacing: ".5px",
                          color: "#64748b",
                          borderBottom: "1px solid rgba(148,163,184,.15)",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {verifs.map((v, i) => (
                    <tr
                      key={i}
                      style={{
                        background: i % 2 === 0 ? "#151d2e" : "transparent",
                      }}
                    >
                      <td style={{ ...S.td, fontWeight: "bold" }}>{v.test}</td>
                      <td style={S.td}>{v.method}</td>
                      <td style={{ ...S.td, color: "#22c55e" }}>
                        {v.expected_result}
                      </td>
                      <td style={{ ...S.td, color: "#ef4444" }}>
                        {v.fail_action}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Sect>
          )}

          {/* Engineering notes */}
          {notes && (
            <Sect title="GEMINI ENGINEERING NOTES">
              <div
                style={{
                  fontSize: 13,
                  color: "#94a3b8",
                  lineHeight: 1.7,
                  fontStyle: "italic",
                  padding: "12px 16px",
                  borderLeft: "2px solid #22d3ee",
                  background: "rgba(34,211,238,.04)",
                  borderRadius: "0 8px 8px 0",
                }}
              >
                {notes}
              </div>
            </Sect>
          )}
        </div>

        {/* ==================== SIDEBAR ==================== */}
        <div style={S.sidebar}>
          <div style={S.sideSection}>
            <div style={S.sideTitle}>Required tools</div>
            {tools.map((t, i) => (
              <div key={i} style={S.listItem}>
                <div style={{ fontWeight: 500, fontSize: 13 }}>{t.tool}</div>
                <div
                  style={{
                    fontSize: 11,
                    fontFamily: "monospace",
                    color: "#22d3ee",
                  }}
                >
                  {t.specification}
                </div>
                <div style={{ fontSize: 11, color: "#64748b" }}>
                  {t.purpose}
                </div>
              </div>
            ))}
          </div>

          <div style={S.sideSection}>
            <div style={S.sideTitle}>Required parts</div>
            {parts.map((p, i) => (
              <div key={i} style={S.listItem}>
                <div style={{ fontWeight: 500, fontSize: 13 }}>
                  {p.part} × {p.quantity}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    fontFamily: "monospace",
                    color: "#22d3ee",
                  }}
                >
                  {p.specification}
                </div>
                <div style={{ fontSize: 11, color: "#64748b" }}>
                  {p.purpose}
                </div>
              </div>
            ))}
          </div>

          <div style={S.sideSection}>
            <div style={S.sideTitle}>Pre-upcycle checklist</div>
            {checks.map((item, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  marginBottom: 8,
                  cursor: "pointer",
                }}
                onClick={() => toggleCheck(i)}
              >
                <div
                  style={{
                    width: 18,
                    height: 18,
                    border: `1.5px solid ${checked.has(i) ? "#22c55e" : "#64748b"}`,
                    borderRadius: 4,
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: checked.has(i) ? "#22c55e" : "transparent",
                    marginTop: 1,
                    transition: "all .15s",
                  }}
                >
                  {checked.has(i) && (
                    <span
                      style={{
                        color: "#fff",
                        fontSize: 11,
                        fontWeight: "bold",
                      }}
                    >
                      ✓
                    </span>
                  )}
                </div>
                <span
                  style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.5 }}
                >
                  {item}
                </span>
              </div>
            ))}

            <button
              style={{
                width: "100%",
                padding: 14,
                marginTop: 12,
                border: "none",
                borderRadius: 10,
                background: "linear-gradient(135deg, #0891b2, #06b6d4)",
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                cursor: allChecked ? "pointer" : "not-allowed",
                opacity: allChecked ? 1 : 0.4,
                transition: "opacity .2s",
                fontFamily: "inherit",
              }}
              disabled={!allChecked}
              onClick={() => navigate("/assembly", { state: { manifest } })}
            >
              Start Assembly
            </button>
            <div
              style={{
                fontSize: 11,
                color: "#64748b",
                textAlign: "center",
                marginTop: 6,
              }}
            >
              {allChecked
                ? "All checks complete"
                : `${totalChecks - checked.size} items remaining`}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================
function PageHeader({ manifest, navigate, blueprint }) {
  const certified = (manifest?.status ?? "").includes("Certified");
  return (
    <div style={S.header}>
      <button className="aqua-btn" onClick={() => navigate("/")}>← Overview</button>
      <div style={S.logo}>ReVolt OS</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)" }}>Upcycle Blueprint</div>
        <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2, fontFamily: "var(--font-mono)" }}>
          {manifest?.battery_id} · {manifest?.manufacturer?.name ?? "Unknown"} · {manifest?.health_grade}
        </div>
      </div>
      {blueprint && (
        <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-dim)" }}>
          {blueprint.upcycle_steps?.length ?? 0} steps · {blueprint.estimated_total_time_hours ?? 0}h · {blueprint.difficulty_level}
        </div>
      )}
      <div style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: "var(--radius-sm)", background: certified ? "rgba(30,132,73,0.1)" : "rgba(192,57,43,0.1)", color: certified ? "var(--green)" : "var(--red)", border: `1px solid ${certified ? "rgba(30,132,73,0.3)" : "rgba(192,57,43,0.3)"}` }}>
        {certified ? "CERTIFIED" : "REJECTED"}
      </div>
      <button className="aqua-btn" style={{ marginLeft: 6 }} onClick={() => navigate(-1)}>Passport</button>
    </div>
  );
}

function Sect({ title, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "1.5px",
          textTransform: "uppercase",
          color: "#6a7d8f",
          marginBottom: 12,
          paddingBottom: 8,
          borderBottom: "1px solid rgba(138,155,176,0.1)",
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function StatBox({ label, value, color, small }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          color: "#6a7d8f",
          textTransform: "uppercase",
          letterSpacing: ".5px",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: small ? 12 : 20,
          fontWeight: 600,
          fontFamily: "monospace",
          color: color ?? "#c8d0dc",
          wordBreak: "break-word",
          lineHeight: 1.3,
        }}
      >
        {value ?? "---"}
      </div>
    </div>
  );
}

// =============================================================================
// Styles
// =============================================================================
const S = {
  desktop: {
    minHeight: "100vh",
    background: "#0e1420",
    color: "#c8d0dc",
    fontFamily: "var(--font-ui)",
    display: "flex",
    flexDirection: "column",
  },
  center: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  errorBox: {
    background: "#1a2332",
    border: "1px solid rgba(138,155,176,0.2)",
    borderRadius: "var(--radius-lg)",
    padding: 24,
    textAlign: "center",
  },
  rejectedBox: {
    background: "#1a2332",
    border: "1px solid rgba(192,57,43,0.3)",
    borderRadius: "var(--radius-lg)",
    padding: 32,
    textAlign: "center",
    maxWidth: 480,
  },
  rejectionReason: {
    fontSize: 11,
    color: "#e0908a",
    background: "rgba(192,57,43,0.1)",
    border: "1px solid rgba(192,57,43,0.2)",
    padding: "6px 12px",
    borderRadius: "var(--radius-sm)",
    marginBottom: 4,
  },
  header: {
    padding: "12px 20px",
    borderBottom: "1px solid rgba(138,155,176,0.2)",
    display: "flex",
    alignItems: "center",
    gap: 12,
    background: "rgba(220,227,236,0.85)",
    flexWrap: "wrap",
  },
  logo: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1.5,
    color: "var(--aqua-blue)",
    background: "rgba(40,96,160,0.08)",
    padding: "4px 10px",
    borderRadius: "var(--radius-sm)",
    border: "1px solid rgba(40,96,160,0.2)",
    whiteSpace: "nowrap",
  },
  layout: { display: "grid", gridTemplateColumns: "1fr 300px", flex: 1 },
  main: { padding: "22px 26px", overflowY: "auto" },
  sidebar: { borderLeft: "1px solid rgba(138,155,176,0.15)", overflowY: "auto" },
  targetGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 14,
    background: "#1a2332",
    border: "1px solid rgba(138,155,176,0.15)",
    borderRadius: "var(--radius-lg)",
    padding: 18,
    marginBottom: 0,
  },
  topologyExplain: {
    marginTop: 12,
    padding: "10px 14px",
    background: "rgba(40,96,160,0.06)",
    borderLeft: "2px solid var(--aqua-blue)",
    borderRadius: "0 var(--radius-sm) var(--radius-sm) 0",
    fontSize: 12,
    color: "#8a9bb0",
    lineHeight: 1.7,
  },
  modulesGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
    gap: 8,
  },
  modCard: {
    background: "#1a2332",
    border: "1px solid rgba(138,155,176,0.15)",
    borderLeft: "3px solid",
    borderRadius: "var(--radius)",
    padding: 12,
  },
  stepCard: {
    background: "#1a2332",
    border: "1px solid",
    borderRadius: "var(--radius)",
    marginBottom: 8,
    overflow: "hidden",
    transition: "border-color .2s",
  },
  stepHeader: {
    padding: "12px 14px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: "var(--radius-sm)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 12,
    fontWeight: 600,
    fontFamily: "var(--font-mono)",
    flexShrink: 0,
  },
  metaReading: {
    fontSize: 11,
    padding: "6px 10px",
    borderRadius: "var(--radius-sm)",
    lineHeight: 1.5,
    marginBottom: 6,
    background: "rgba(40,96,160,0.1)",
    color: "#7aa3cc",
    border: "1px solid rgba(40,96,160,0.2)",
  },
  metaWarning: {
    fontSize: 11,
    padding: "6px 10px",
    borderRadius: "var(--radius-sm)",
    lineHeight: 1.5,
    marginBottom: 6,
    background: "rgba(192,57,43,0.1)",
    color: "#e0908a",
    border: "1px solid rgba(192,57,43,0.2)",
  },
  metaVoice: {
    fontSize: 11,
    padding: "6px 10px",
    borderRadius: "var(--radius-sm)",
    lineHeight: 1.5,
    marginBottom: 6,
    background: "rgba(124,58,237,0.08)",
    color: "#b4a0e0",
    border: "1px solid rgba(124,58,237,0.2)",
  },
  td: {
    padding: 8,
    color: "#8a9bb0",
    borderBottom: "1px solid rgba(138,155,176,0.1)",
    lineHeight: 1.4,
  },
  sideSection: { padding: 14, borderBottom: "1px solid rgba(138,155,176,0.15)" },
  sideTitle: { fontSize: 12, fontWeight: 700, marginBottom: 10 },
  listItem: {
    paddingBottom: 10,
    marginBottom: 10,
    borderBottom: "1px solid rgba(138,155,176,0.1)",
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
};
