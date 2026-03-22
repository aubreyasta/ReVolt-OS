/* =============================================================================
   components/BatteryCellDiagram.jsx

   Self-contained 3D battery cell/module diagram using Three.js.
   Renders each module as a colored 3D rectangular prism:
     - Green  = Keep
     - Red    = Bypass  (semi-transparent)
     - Amber  = Replace

   Props:
     modules  — array from upcycle_blueprint.module_assessment
                Each item: { module_id, status, cell_voltage_expected, reason, notes }

   Usage:
     <BatteryCellDiagram modules={blueprint.module_assessment} />

   Three.js is loaded from a CDN via a <script> tag injected at mount time.
   This avoids adding Three.js to the npm bundle.
   ============================================================================= */

import { useEffect, useRef, useState } from "react";

// Color map: module status → hex integer (Three.js color format)
const COLOR_MAP = {
  Keep:    0x22c55e,   // green
  Bypass:  0xef4444,   // red
  Replace: 0xf59e0b,   // amber
};

// How see-through bypass modules appear (0 = invisible, 1 = solid)
const BYPASS_OPACITY = 0.35;

// Module box dimensions (Three.js units)
const MOD_W = 1.0;
const MOD_H = 0.6;
const MOD_D = 1.8;
const GAP   = 0.18;

// ─── Utility: load Three.js from CDN once ────────────────────────────────────
let threeLoadPromise = null;

function loadThree() {
  if (threeLoadPromise) return threeLoadPromise;
  threeLoadPromise = new Promise((resolve, reject) => {
    // Already loaded by another component instance
    if (window.THREE) { resolve(window.THREE); return; }
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
    script.onload  = () => resolve(window.THREE);
    script.onerror = () => reject(new Error("Failed to load Three.js"));
    document.head.appendChild(script);
  });
  return threeLoadPromise;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function BatteryCellDiagram({ modules = [] }) {
  const containerRef = useRef(null);
  const rendererRef  = useRef(null);   // stored so we can dispose on unmount
  const animFrameRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [hovered, setHovered] = useState(null); // module_id of hovered block

  // ── Build the Three.js scene once the container is mounted & THREE is loaded ─
  useEffect(() => {
    if (!modules.length) return;

    let cancelled = false;

    loadThree().then((THREE) => {
      if (cancelled || !containerRef.current) return;

      const container = containerRef.current;
      const w = container.clientWidth  || 640;
      const h = container.clientHeight || 320;

      // Scene
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x080c14);

      // Camera
      const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100);
      camera.position.set(5, 4, 7);
      camera.lookAt(0, 0, 0);

      // Renderer
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      container.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      // ── Lighting ──────────────────────────────────────────────────────────
      scene.add(new THREE.AmbientLight(0x404060, 0.6));

      const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
      dirLight.position.set(5, 8, 5);
      scene.add(dirLight);

      const pointLight = new THREE.PointLight(0x22d3ee, 0.4, 20);
      pointLight.position.set(-3, 3, 3);
      scene.add(pointLight);

      // ── Ground grid ───────────────────────────────────────────────────────
      const grid = new THREE.GridHelper(12, 24, 0x1e293b, 0x111827);
      grid.position.y = -1.2;
      scene.add(grid);

      // ── Module geometry ───────────────────────────────────────────────────
      const moduleGroup = new THREE.Group();
      const totalModules = modules.length;
      const cols = Math.ceil(totalModules / 2);  // 2 rows max

      // We'll track mesh → module so we can do hover later
      const meshToModule = new Map();

      modules.forEach((mod, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);

        // Position: spread columns along X, rows along Y
        const x = (col - (cols - 1) / 2) * (MOD_W + GAP);
        const y = row * (MOD_H + GAP);
        const z = 0;

        // Main box
        const geo = new THREE.BoxGeometry(MOD_W, MOD_H, MOD_D);
        const color   = COLOR_MAP[mod.status] ?? 0x64748b;
        const isBypass = mod.status === "Bypass";

        const mat = new THREE.MeshPhongMaterial({
          color,
          transparent: true,
          opacity: isBypass ? BYPASS_OPACITY : 0.85,
          specular: 0x222222,
          shininess: 30,
        });

        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y, z);
        moduleGroup.add(mesh);
        meshToModule.set(mesh, mod);

        // Wireframe edges
        const edges   = new THREE.EdgesGeometry(geo);
        const lineMat = new THREE.LineBasicMaterial({
          color: 0x94a3b8, transparent: true, opacity: isBypass ? 0.15 : 0.3,
        });
        const wf = new THREE.LineSegments(edges, lineMat);
        wf.position.copy(mesh.position);
        moduleGroup.add(wf);

        // Busbar connector between adjacent KEEP modules in the same row
        if (
          mod.status === "Keep" &&
          i < totalModules - 1 &&
          modules[i + 1]?.status === "Keep"
        ) {
          const nextCol = (i + 1) % cols;
          const nextRow = Math.floor((i + 1) / cols);
          if (nextRow === row) {
            const nextX = (nextCol - (cols - 1) / 2) * (MOD_W + GAP);
            const barGeo = new THREE.CylinderGeometry(0.04, 0.04, GAP + 0.1, 8);
            const barMat = new THREE.MeshPhongMaterial({
              color: 0xfbbf24, shininess: 80, specular: 0x444444,
            });
            const bar = new THREE.Mesh(barGeo, barMat);
            bar.rotation.z = Math.PI / 2;
            bar.position.set((x + nextX) / 2, y, MOD_D * 0.35);
            moduleGroup.add(bar);
          }
        }
      });

      scene.add(moduleGroup);

      // ── Orbit controls (manual — no OrbitControls import needed) ──────────
      let isDragging = false;
      let prevX = 0, prevY = 0;
      let rotX = 0.3, rotY = 0;
      let zoom = 8;

      const onMouseDown = (e) => { isDragging = true; prevX = e.clientX; prevY = e.clientY; };
      const onMouseUp   = ()    => { isDragging = false; };
      const onMouseMove = (e)   => {
        if (!isDragging) return;
        rotY += (e.clientX - prevX) * 0.005;
        rotX += (e.clientY - prevY) * 0.005;
        rotX = Math.max(-1, Math.min(1.2, rotX));
        prevX = e.clientX; prevY = e.clientY;
      };
      const onWheel = (e) => {
        e.preventDefault();
        zoom = Math.max(3, Math.min(18, zoom + e.deltaY * 0.01));
      };

      // Touch support
      const onTouchStart = (e) => { isDragging = true; prevX = e.touches[0].clientX; prevY = e.touches[0].clientY; };
      const onTouchEnd   = ()    => { isDragging = false; };
      const onTouchMove  = (e)   => {
        if (!isDragging || !e.touches[0]) return;
        rotY += (e.touches[0].clientX - prevX) * 0.005;
        rotX += (e.touches[0].clientY - prevY) * 0.005;
        rotX = Math.max(-1, Math.min(1.2, rotX));
        prevX = e.touches[0].clientX; prevY = e.touches[0].clientY;
      };

      container.addEventListener("mousedown", onMouseDown);
      container.addEventListener("mouseup",   onMouseUp);
      container.addEventListener("mouseleave",onMouseUp);
      container.addEventListener("mousemove", onMouseMove);
      container.addEventListener("wheel",     onWheel, { passive: false });
      container.addEventListener("touchstart",onTouchStart);
      container.addEventListener("touchend",  onTouchEnd);
      container.addEventListener("touchmove", onTouchMove);

      // ── Resize handler ────────────────────────────────────────────────────
      const onResize = () => {
        if (!container) return;
        const nw = container.clientWidth;
        const nh = container.clientHeight;
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
        renderer.setSize(nw, nh);
      };
      window.addEventListener("resize", onResize);

      // ── Animation loop ────────────────────────────────────────────────────
      function animate() {
        animFrameRef.current = requestAnimationFrame(animate);
        // Gentle auto-rotate when not dragging
        if (!isDragging) rotY += 0.003;
        camera.position.x = Math.sin(rotY) * Math.cos(rotX) * zoom;
        camera.position.y = Math.sin(rotX) * zoom * 0.6 + 2;
        camera.position.z = Math.cos(rotY) * Math.cos(rotX) * zoom;
        camera.lookAt(0, 0, 0);
        renderer.render(scene, camera);
      }
      animate();

      setReady(true);

      // ── Cleanup ───────────────────────────────────────────────────────────
      return () => {
        cancelled = true;
        cancelAnimationFrame(animFrameRef.current);
        window.removeEventListener("resize", onResize);
        container.removeEventListener("mousedown", onMouseDown);
        container.removeEventListener("mouseup",   onMouseUp);
        container.removeEventListener("mouseleave",onMouseUp);
        container.removeEventListener("mousemove", onMouseMove);
        container.removeEventListener("wheel",     onWheel);
        container.removeEventListener("touchstart",onTouchStart);
        container.removeEventListener("touchend",  onTouchEnd);
        container.removeEventListener("touchmove", onTouchMove);
        renderer.dispose();
        if (container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement);
        }
      };
    });

    return () => { cancelled = true; };
  }, [modules]);

  if (!modules.length) return null;

  return (
    <div style={styles.wrapper}>
      {/* ── Legend ── */}
      <div style={styles.legend}>
        <LegendDot color="#22c55e" label="Keep" />
        <LegendDot color="#ef4444" label="Bypass" />
        <LegendDot color="#f59e0b" label="Replace" />
        <span style={styles.legendHint}>Drag to rotate · Scroll to zoom</span>
      </div>

      {/* ── Three.js canvas mount point ── */}
      <div ref={containerRef} style={styles.canvas}>
        {!ready && (
          <div style={styles.loading}>
            <span style={styles.loadingDot} />
            Loading 3D diagram…
          </div>
        )}
      </div>

      {/* ── Module cards below the 3D view ── */}
      <div style={styles.grid}>
        {modules.map((mod) => (
          <ModuleCard key={mod.module_id} mod={mod} />
        ))}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LegendDot({ color, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
      <div style={{ width: 10, height: 10, borderRadius: 3, background: color }} />
      <span style={{ color: "#94a3b8" }}>{label}</span>
    </div>
  );
}

function ModuleCard({ mod }) {
  const statusColor = {
    Keep:    "#22c55e",
    Bypass:  "#ef4444",
    Replace: "#f59e0b",
  }[mod.status] ?? "#64748b";

  const borderLeft = `3px solid ${statusColor}`;

  return (
    <div style={{ ...styles.modCard, borderLeft }}>
      <div style={styles.modName}>{mod.module_id}</div>
      <div style={{ ...styles.modStatus, color: statusColor }}>
        {mod.status.toUpperCase()} · {mod.cell_voltage_expected}V
      </div>
      <div style={styles.modReason}>{mod.reason}</div>
      {mod.notes && <div style={styles.modNotes}>{mod.notes}</div>}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = {
  wrapper: {
    marginTop: 16,
  },
  legend: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    marginBottom: 10,
    flexWrap: "wrap",
  },
  legendHint: {
    marginLeft: "auto",
    fontSize: 11,
    color: "#64748b",
    fontFamily: "var(--font-mono, monospace)",
  },
  canvas: {
    width: "100%",
    height: 300,
    borderRadius: 10,
    overflow: "hidden",
    border: "1px solid rgba(148,163,184,.15)",
    background: "#080c14",
    position: "relative",
    marginBottom: 12,
    cursor: "grab",
  },
  loading: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    fontSize: 13,
    color: "#64748b",
    fontFamily: "var(--font-mono, monospace)",
  },
  loadingDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#22d3ee",
    animation: "blink 0.8s ease-in-out infinite",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
    gap: 8,
  },
  modCard: {
    background: "rgba(255,255,255,0.45)",
    border: "1px solid rgba(138,155,176,0.3)",
    borderRadius: 8,
    padding: "10px 12px",
    cursor: "default",
  },
  modName: {
    fontWeight: 700,
    fontSize: 13,
    marginBottom: 3,
    color: "var(--text, #1e293b)",
  },
  modStatus: {
    fontSize: 11,
    fontFamily: "var(--font-mono, monospace)",
    marginBottom: 4,
    fontWeight: 600,
  },
  modReason: {
    fontSize: 11,
    color: "var(--text-dim, #64748b)",
    lineHeight: 1.4,
  },
  modNotes: {
    fontSize: 10,
    color: "var(--text-dim, #64748b)",
    marginTop: 4,
    fontStyle: "italic",
    lineHeight: 1.4,
  },
};
