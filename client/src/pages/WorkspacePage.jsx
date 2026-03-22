/* =============================================================================
   pages/WorkspacePage.jsx — Three-panel workspace (v2)
   
   Fixes:
   1. Right panel (agent) is ALSO resizable via drag handle
   2. Grade badge is large + color-prominent
   3. Default layout: passport & diagram each take ~half of remaining space
      (agent panel starts at 310px, all three panels resizable)
   4. Scannable QR code linking to passport PDF
   ============================================================================= */

import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useConversation } from "@elevenlabs/react";
import QRCode from "react-qr-code";

// Add this near the top of WorkspacePage.jsx, before the components
const safe = (val) => {
  if (val === null || val === undefined) return "—";
  if (typeof val === "object") return JSON.stringify(val);
  return val;
};

const SAFETY_STEPS = [
  "Confirm PPE: insulated gloves, face shield, arc-flash suit",
  "Verify battery discharged below 5V total pack voltage",
  "Disconnect HV connector and isolate BMS harness",
  "Remove cell modules per recommended config",
  "Inspect cells for swelling, leakage, or thermal marks",
  "Seal and label cells for storage or transport",
];

const GRADE_COLORS = {
  "A+": "#059669", A: "#059669",
  "B+": "#2860a0", B: "#2860a0",
  "C+": "#b7700a", C: "#b7700a",
  D: "#c0392b", F: "#922b21",
};

/* ═══════════════════════════════════════════════════════════════════════════
   LEFT PANEL — Passport sidebar
   ═══════════════════════════════════════════════════════════════════════════ */

function PassportSidebar({ manifest, width }) {
  const hd = manifest.health_details ?? {};
  const mfg = manifest.manufacturer ?? {};
  const ts = manifest.telemetry_summary ?? {};
  const risks = manifest.safety_risks ?? [];
  const workflow = manifest.safety_workflow ?? {};
  const am = manifest.audit_manifest ?? {};
  const grade = manifest.health_grade ?? "?";
  const gradeColor = GRADE_COLORS[grade] ?? GRADE_COLORS[grade[0]] ?? "#777";
  const rej = grade[0] === "F" || grade[0] === "D";

  const STATUS_LED = { Certified: "green", Listed: "green", "Under Review": "amber", "Disassembly Started": "amber", Sold: "gray" };
  const statusLed = STATUS_LED[manifest.status] ?? "green";

  // QR code URL — points to the passport page which can be printed as PDF
  const passportUrl = window.location.origin + "/passport/" + (manifest.battery_id ?? "unknown");

console.log("manifest keys:", JSON.stringify(manifest, null, 2));

  return (
    <div style={{ width, height: "100%", overflowY: "auto", padding: 12, background: "var(--win-bg)", borderRight: "1px solid var(--win-border)", fontSize: 11, color: "var(--text-dim)" }}>
      
      {/* ── Large grade badge ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <div style={{
          width: 64, height: 64, borderRadius: "var(--radius-lg)",
          background: `linear-gradient(135deg, ${gradeColor}, ${gradeColor}dd)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", fontWeight: 800, fontSize: 28,
          boxShadow: `0 4px 12px ${gradeColor}40`,
          flexShrink: 0,
        }}>
          {grade}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{manifest.battery_id}</div>
          <div style={{ fontSize: 10, color: "var(--text-dim)" }}>{mfg.name ?? "Unknown"} · {mfg.chemistry ?? "—"}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3 }}>
            <div className={`led ${statusLed}`} />
            <span style={{ fontSize: 10, fontWeight: 700, color: rej ? "var(--red)" : "var(--green)" }}>{(manifest.status ?? "Listed").toUpperCase()}</span>
          </div>
        </div>
      </div>

      {/* ── Health stats ── */}
      <div className="inset-panel" style={{ padding: 8, marginBottom: 8 }}>
        {[["SOH", (hd.state_of_health_pct ?? "?") + "%", hd.state_of_health_pct < 70],
          ["Cycles", hd.total_cycles, false],
          ["RUL", (hd.remaining_useful_life_years ?? "?") + " yr", false],
          ["Peak T", (hd.peak_temp_recorded_c ?? "?") + "°C", hd.peak_temp_recorded_c > 55],
        ].map(([l, v, warn], i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 10, padding: "3px 0", borderBottom: "1px solid rgba(138,155,176,0.1)" }}>
            <span>{l}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: warn ? "var(--red)" : "var(--text)" }}>{v}</span>
          </div>
        ))}
      </div>

      {/* Gemini summary */}
      {hd.gemini_analysis_summary && (
        <div className="inset-panel" style={{ padding: 8, marginBottom: 8, fontSize: 10, lineHeight: 1.65 }}>
          {hd.gemini_analysis_summary}
        </div>
      )}

      {/* Telemetry */}
      {ts.voltage_min != null && (
        <div className="inset-panel" style={{ padding: 8, marginBottom: 8 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-dim)", letterSpacing: "0.1em", marginBottom: 4 }}>TELEMETRY</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, fontSize: 9 }}>
            {[["V min", ts.voltage_min], ["V max", ts.voltage_max], ["V avg", ts.voltage_mean], ["T min", ts.temp_min_c + "°"], ["T max", ts.temp_max_c + "°"], ["T avg", ts.temp_mean_c + "°"]].map(([l, v], i) => (
              <div key={i} style={{ textAlign: "center", padding: "3px 0", background: "rgba(255,255,255,0.35)", borderRadius: 3 }}>
                <div style={{ color: "var(--text-dim)", fontSize: 8 }}>{l}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text)" }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Safety risks */}
      {risks.length > 0 && risks.map((r, i) => {
        const sev = (r.severity ?? r.sev ?? "").toUpperCase();
        const isHigh = sev.includes("CRIT") || sev.includes("HIGH");
        return (
          <div key={i} className="inset-panel" style={{ padding: 8, marginBottom: 4, borderLeft: `3px solid ${isHigh ? "var(--red)" : "var(--amber)"}` }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: isHigh ? "var(--red)" : "var(--amber)" }}>{sev}</span>
            <span style={{ fontWeight: 600, color: "var(--text)", marginLeft: 4 }}>{r.risk_type ?? r.type}</span>
            <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 2 }}>{r.description ?? r.d}</div>
          </div>
        );
      })}

      {/* Target config */}
      {workflow.target_config && (
        <div className="inset-panel" style={{ padding: 8, marginTop: 6, borderLeft: "3px solid var(--green)" }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: "var(--green)", letterSpacing: "0.1em" }}>TARGET CONFIG</div>
          <div style={{ fontWeight: 600, color: "var(--text)", marginTop: 2 }}>{workflow.target_config}</div>
        </div>
      )}

      {/* EU compliance */}
      {am.eu_compliant && (
        <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 9, background: "rgba(40,96,160,0.08)", color: "var(--aqua-blue)", padding: "1px 7px", borderRadius: 3, border: "1px solid rgba(40,96,160,0.2)" }}>EU Compliant</span>
        </div>
      )}

      {/* ── QR Code — links to passport page for PDF export ── */}
      <div className="inset-panel" style={{ padding: 10, marginTop: 10, textAlign: "center" }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-dim)", letterSpacing: "0.1em", marginBottom: 6 }}>SCAN FOR PASSPORT PDF</div>
        <div style={{ background: "#fff", padding: 8, borderRadius: "var(--radius-sm)", display: "inline-block" }}>
          <QRCode value={passportUrl} size={96} level="M" />
        </div>
        <div style={{ fontSize: 8, color: "var(--text-dim)", marginTop: 4, fontFamily: "var(--font-mono)", wordBreak: "break-all" }}>{passportUrl}</div>
      </div>

      {/* Actions */}
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
        <button className="aqua-btn" onClick={() => window.open(passportUrl, "_blank")} style={{ width: "100%", fontSize: 10 }}>Open Passport Page</button>
        <button className="aqua-btn" onClick={() => window.print()} style={{ width: "100%", fontSize: 10 }}>Print / PDF</button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   CENTER PANEL — 3D viewer + cell data table
   ═══════════════════════════════════════════════════════════════════════════ */

function CenterPanel({ blueprint, modules, sel, onSel }) {
  if (!blueprint || !modules?.length) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--win-bg)", color: "var(--text-dim)", fontSize: 12 }}>
        No blueprint — battery rejected or data not available
      </div>
    );
  }
  const ts = blueprint.target_system ?? {};
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--win-bg)", overflow: "hidden" }}>
      <div style={{ padding: "6px 12px", background: "rgba(220,227,236,0.85)", borderBottom: "1px solid rgba(138,155,176,0.2)", display: "flex", gap: 14, alignItems: "center", fontSize: 10, flexShrink: 0 }}>
        <span style={{ fontWeight: 700, color: "var(--text)" }}>{ts.topology ?? "—"}</span>
        <span style={{ color: "var(--text-dim)" }}>{ts.target_voltage ?? "?"}V · {ts.target_capacity_kwh ?? "?"} kWh</span>
        <span style={{ color: "var(--text-dim)" }}>{ts.name ?? ""}</span>
      </div>
      <div style={{ flex: 1, position: "relative", minHeight: 180, borderBottom: "1px solid var(--win-border)" }}>
        <ThreeViewer modules={modules} sel={sel} onSel={onSel} />
        <div style={{ position: "absolute", top: 8, left: 10, fontSize: 9, fontFamily: "var(--font-mono)", color: "rgba(255,255,255,0.45)", background: "rgba(0,0,0,0.35)", padding: "2px 8px", borderRadius: 3 }}>3D MODULE LAYOUT</div>
        <div style={{ position: "absolute", bottom: 8, left: 10, display: "flex", gap: 8, fontSize: 9, color: "#ddd", background: "rgba(0,0,0,0.35)", padding: "2px 8px", borderRadius: 3 }}>
          {[["#27ae60","Keep"],["#f39c12","Monitor"],["#e74c3c","Bypass"]].map(([c,l])=><span key={l} style={{display:"flex",alignItems:"center",gap:3}}><span style={{width:6,height:6,borderRadius:2,background:c,display:"inline-block"}}/>{l}</span>)}
        </div>
      </div>
      <div style={{ flexShrink: 0, maxHeight: 200, overflowY: "auto" }}>
        <table style={{ width: "100%", fontSize: 10, borderCollapse: "collapse" }}>
          <thead><tr style={{ background: "rgba(220,227,236,0.85)", position: "sticky", top: 0 }}>
            {["Module","Status","SOH","Notes"].map(h=><th key={h} style={{textAlign:"left",padding:"5px 10px",fontSize:9,color:"var(--text-dim)",textTransform:"uppercase",letterSpacing:0.5,borderBottom:"1px solid rgba(138,155,176,0.2)",fontWeight:700}}>{h}</th>)}
          </tr></thead>
          <tbody>{modules.map((mod,i)=>{
            const st=(mod.status??"Keep").toLowerCase();const isK=st.includes("keep");const isB=st.includes("bypass");
            const stC=isB?"var(--red)":isK?"var(--green)":"var(--amber)";
            const stBg=isB?"rgba(192,57,43,0.08)":isK?"rgba(30,132,73,0.08)":"rgba(183,112,10,0.08)";
            return <tr key={i} onClick={()=>onSel(i===sel?null:i)} style={{cursor:"pointer",background:i===sel?"rgba(40,96,160,0.08)":"transparent",borderBottom:"1px solid rgba(138,155,176,0.1)"}}>
              <td style={{padding:"4px 10px",fontWeight:700,color:"var(--text)"}}>M{mod.module_number??mod.module??i+1}</td>
              <td style={{padding:"4px 10px"}}><span style={{padding:"1px 6px",borderRadius:3,fontSize:9,fontWeight:600,background:stBg,color:stC}}>{mod.status??"Keep"}</span></td>
              <td style={{padding:"4px 10px",fontFamily:"var(--font-mono)",color:"var(--text)"}}>{mod.soh_pct??mod.soh??"?"}%</td>
              <td style={{padding:"4px 10px",color:"var(--text-dim)",fontSize:10}}>{mod.reason??mod.notes??mod.n??"—"}</td>
            </tr>})}</tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Three.js Viewer ── */
function ThreeViewer({ modules, sel, onSel }) {
  const ref = useRef(null), stateRef = useRef({}), animId = useRef(null);
  useEffect(() => {
    function initScene() {
      const THREE = window.THREE; if (!THREE || !ref.current) return;
      const el = ref.current, w = el.clientWidth, h = el.clientHeight || 280;
      const scene = new THREE.Scene(); scene.background = new THREE.Color(0x1c2e40);
      const camera = new THREE.PerspectiveCamera(42, w/h, 0.1, 100); camera.position.set(5.5,4.5,7.5); camera.lookAt(0,0,0);
      const renderer = new THREE.WebGLRenderer({antialias:true}); renderer.setSize(w,h); renderer.setPixelRatio(Math.min(window.devicePixelRatio,2)); el.appendChild(renderer.domElement);
      scene.add(new THREE.AmbientLight(0x8090a8,0.75));
      const dl=new THREE.DirectionalLight(0xffffff,0.95); dl.position.set(5,8,5); scene.add(dl);
      const pl=new THREE.PointLight(0x4488cc,0.25,20); pl.position.set(-3,3,3); scene.add(pl);
      const grid=new THREE.GridHelper(10,20,0x2a3e50,0x1e3045); grid.position.y=-1.1; scene.add(grid);
      const cMap={Keep:0x27ae60,Bypass:0xe74c3c,Replace:0xf39c12,Monitor:0xf39c12};
      const group=new THREE.Group(),meshes=[],mW=1.05,mH=0.5,mD=1.65,gap=0.16,cols=Math.ceil(modules.length/2);
      modules.forEach((mod,i)=>{
        const col=i%cols,row=Math.floor(i/cols),st=mod.status??"Keep";
        const mesh=new THREE.Mesh(new THREE.BoxGeometry(mW,mH,mD),new THREE.MeshStandardMaterial({color:cMap[st]??0x7f8c8d,transparent:true,opacity:0.9,roughness:0.3,metalness:0.12}));
        mesh.position.set(-(cols-1)*(mW+gap)/2+col*(mW+gap),0,-(mD+gap)/2+row*(mD+gap));
        mesh.userData={idx:i}; meshes.push(mesh); group.add(mesh);
        const wf=new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry),new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:0.15}));
        wf.position.copy(mesh.position); group.add(wf);
        if(col>0){const prev=meshes[row*cols+col-1];if(prev){const bar=new THREE.Mesh(new THREE.BoxGeometry(gap+0.04,0.05,0.2),new THREE.MeshStandardMaterial({color:0xbcc3ca,roughness:0.4,metalness:0.65}));bar.position.set((prev.position.x+mesh.position.x)/2,mH/2+0.03,mesh.position.z);group.add(bar);}}
      });
      scene.add(group); stateRef.current={scene,camera,renderer,meshes,group};
      let drag=false,pX=0,pY=0,rX=-0.3,rY=0.4; group.rotation.set(rX,rY,0);
      const dn=e=>{drag=true;pX=e.clientX;pY=e.clientY};
      const mv=e=>{if(!drag)return;rY+=(e.clientX-pX)*0.007;rX=Math.max(-1.2,Math.min(0.3,rX+(e.clientY-pY)*0.007));group.rotation.set(rX,rY,0);pX=e.clientX;pY=e.clientY};
      const up=()=>{drag=false};
      const ray=new THREE.Raycaster(),mouse=new THREE.Vector2();
      const clk=e=>{const r=renderer.domElement.getBoundingClientRect();mouse.set(((e.clientX-r.left)/r.width)*2-1,-((e.clientY-r.top)/r.height)*2+1);ray.setFromCamera(mouse,camera);const h=ray.intersectObjects(meshes);if(h.length)onSel(h[0].object.userData.idx)};
      renderer.domElement.addEventListener("pointerdown",dn);window.addEventListener("pointermove",mv);window.addEventListener("pointerup",up);renderer.domElement.addEventListener("click",clk);
      const loop=()=>{animId.current=requestAnimationFrame(loop);if(!drag){rY+=0.0012;group.rotation.y=rY}renderer.render(scene,camera)};loop();
      return()=>{cancelAnimationFrame(animId.current);renderer.domElement.removeEventListener("pointerdown",dn);window.removeEventListener("pointermove",mv);window.removeEventListener("pointerup",up);renderer.domElement.removeEventListener("click",clk);renderer.dispose();if(el.contains(renderer.domElement))el.removeChild(renderer.domElement)};
    }
    if(window.THREE)return initScene();
    else{const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";s.onload=()=>initScene();document.head.appendChild(s);}
  },[modules]);
  useEffect(()=>{const{meshes}=stateRef.current;if(!meshes)return;meshes.forEach((m,i)=>{const on=i===sel;m.scale.setScalar(on?1.1:1.0);m.material.opacity=on?1.0:(sel!==null&&sel!==i)?0.35:0.9;m.material.emissive=new window.THREE.Color(on?0xffffff:0x000000);m.material.emissiveIntensity=on?0.12:0})},[sel]);
  return <div ref={ref} style={{width:"100%",height:"100%",cursor:"grab",minHeight:180}}/>;
}

/* ═══════════════════════════════════════════════════════════════════════════
   RIGHT PANEL — Voice + Chat Agent
   ═══════════════════════════════════════════════════════════════════════════ */

function AgentPanel({ manifest }) {
  const [agentId, setAgentId] = useState(null);
  const [agentActive, setAgentActive] = useState(false);
  const [done, setDone] = useState(new Set());
  const [transcript, setTranscript] = useState([{ role: "agent", text: "Safety foreman online. Battery passport loaded." }]);
  const [input, setInput] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [vizBars, setVizBars] = useState(Array(20).fill(2));
  const transcriptRef = useRef(null), vizRef = useRef(null), mockIdx = useRef(0);

  useEffect(() => { fetch("/api/config").then(r=>r.ok?r.json():null).then(d=>{if(d?.elevenlabs_agent_id)setAgentId(d.elevenlabs_agent_id)}).catch(()=>{}); }, []);

  const conversation = useConversation({
    clientTools: { log_milestone: ({step_index,step_label})=>{setDone(p=>new Set([...p,step_index]));setTranscript(t=>[...t,{role:"agent",text:`Step ${step_index+1}: ${step_label}`}]);return"Logged."} },
    onMessage: (e) => { if(e.source==="ai"&&e.message){setSpeaking(true);setTranscript(t=>[...t,{role:"agent",text:e.message}]);setTimeout(()=>setSpeaking(false),1500)} if(e.source==="user"&&e.message)setTranscript(t=>[...t,{role:"user",text:e.message}]) },
    onError: (err) => console.error("[ElevenLabs]", err),
  });

  useEffect(()=>{if(speaking){vizRef.current=setInterval(()=>setVizBars(Array(20).fill(0).map(()=>Math.random()*22+3)),110)}else{clearInterval(vizRef.current);setVizBars(Array(20).fill(2))}return()=>clearInterval(vizRef.current)},[speaking]);
  useEffect(()=>{if(transcriptRef.current)transcriptRef.current.scrollTop=transcriptRef.current.scrollHeight},[transcript]);

  async function toggleAgent() {
    if(agentActive){await conversation.endSession();setAgentActive(false);setTranscript(t=>[...t,{role:"agent",text:"Session ended."}])}
    else{if(agentId){await conversation.startSession({agentId,connectionType:"webrtc",overrides:manifest?{agent:{prompt:{prompt:"BATTERY PASSPORT:\n"+JSON.stringify(manifest,null,2)}}}:undefined});setTranscript(t=>[...t,{role:"system",text:"Connecting to ElevenLabs..."}])}else{setTranscript(t=>[...t,{role:"system",text:"Demo mode — no agent configured."}])}setAgentActive(true)}
  }
  function toggleStep(i){setDone(p=>{const n=new Set(p);n.has(i)?n.delete(i):n.add(i);if(!agentId&&!n.has(i)===false){const M=["Confirmed. Proceed.","Check for swelling.","Step logged.","SOH safe.","Noted."];setTranscript(t=>[...t,{role:"agent",text:M[mockIdx.current%M.length]}]);mockIdx.current++}return n})}
  function sendChat(){if(!input.trim())return;setTranscript(t=>[...t,{role:"user",text:input.trim()}]);setInput("");if(!agentActive)setTranscript(t=>[...t,{role:"system",text:"Tap the mic first."}])}
  const allDone=done.size>=SAFETY_STEPS.length;

  return (
    <div style={{height:"100%",display:"flex",flexDirection:"column",background:"rgba(255,255,255,0.95)",borderLeft:"1px solid var(--win-border)"}}>
      <div style={{padding:"7px 12px",background:"rgba(220,227,236,0.85)",borderBottom:"1px solid rgba(138,155,176,0.2)",display:"flex",alignItems:"center",gap:6}}>
        <div className={`led ${agentActive?(speaking?"green":"amber"):"gray"}`} style={agentActive&&speaking?{animation:"blink 0.8s infinite"}:{}}/>
        <span style={{fontSize:11,fontWeight:700,color:"var(--text)"}}>Safety Foreman</span>
        <div style={{flex:1}}/><span style={{fontSize:9,fontFamily:"var(--font-mono)",color:"var(--text-dim)"}}>{done.size}/{SAFETY_STEPS.length}</span>
      </div>
      <div style={{padding:12,borderBottom:"1px solid rgba(138,155,176,0.15)",display:"flex",flexDirection:"column",alignItems:"center",gap:8,background:"rgba(244,247,250,0.8)"}}>
        <div style={{position:"relative",width:60,height:60}}>
          <svg width="60" height="60" viewBox="0 0 60 60" style={{position:"absolute",top:0,left:0}}>
            {vizBars.map((h,i)=>{const a=(i/20)*Math.PI*2-Math.PI/2,inner=22,outer=inner+h;return <line key={i} x1={30+Math.cos(a)*inner} y1={30+Math.sin(a)*inner} x2={30+Math.cos(a)*outer} y2={30+Math.sin(a)*outer} stroke={speaking?"var(--green)":"rgba(138,155,176,0.4)"} strokeWidth="2" strokeLinecap="round" style={{transition:"all 0.1s"}}/>})}
          </svg>
          <button onClick={toggleAgent} style={{position:"absolute",top:9,left:9,width:42,height:42,borderRadius:"50%",border:"none",cursor:"pointer",background:agentActive?"linear-gradient(180deg,#27ae60,#1e8449)":"linear-gradient(180deg,#3a7acc,#2860a0)",boxShadow:speaking?"0 0 12px rgba(39,174,96,0.4)":"0 2px 6px rgba(40,96,160,0.25)",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
          </button>
        </div>
        <div style={{fontSize:9,color:speaking?"var(--green)":"var(--text-dim)",fontWeight:500}}>{speaking?"Speaking...":agentActive?"Listening...":"Tap to connect"}</div>
      </div>
      <div style={{padding:"6px 12px",borderBottom:"1px solid rgba(138,155,176,0.15)",display:"flex",gap:2,background:"rgba(244,247,250,0.6)"}}>
        {SAFETY_STEPS.map((_,i)=><div key={i} style={{flex:1,height:4,borderRadius:2,background:done.has(i)?"var(--green)":"rgba(138,155,176,0.2)",transition:"background 0.3s",cursor:"pointer"}} onClick={()=>toggleStep(i)}/>)}
      </div>
      <div style={{padding:"6px 12px",borderBottom:"1px solid rgba(138,155,176,0.15)",maxHeight:110,overflowY:"auto",fontSize:10}}>
        {SAFETY_STEPS.map((s,i)=><div key={i} onClick={()=>toggleStep(i)} style={{display:"flex",alignItems:"center",gap:6,padding:"3px 0",cursor:"pointer",borderBottom:"1px solid rgba(138,155,176,0.08)"}}>
          <div className={`led ${done.has(i)?"green":"gray"}`} style={{width:6,height:6}}/><span style={{color:done.has(i)?"var(--green)":"var(--text-dim)",textDecoration:done.has(i)?"line-through":"none"}}>{s}</span>
        </div>)}
      </div>
      <div ref={transcriptRef} style={{flex:1,overflowY:"auto",padding:10,display:"flex",flexDirection:"column",gap:5}}>
        {transcript.map((msg,i)=>{
          if(msg.role==="system")return <div key={i} style={{fontSize:9,color:"var(--text-dim)",textAlign:"center",padding:2}}>{msg.text}</div>;
          const isU=msg.role==="user";
          return <div key={i} style={{display:"flex",flexDirection:"column",alignItems:isU?"flex-end":"flex-start"}}>
            <div style={{maxWidth:"88%",borderRadius:8,borderBottomLeftRadius:isU?8:2,borderBottomRightRadius:isU?2:8,padding:"6px 10px",background:isU?"var(--aqua-blue)":"rgba(244,247,250,0.9)",color:isU?"#fff":"var(--text)",fontSize:11,lineHeight:1.5,border:isU?"none":"1px solid rgba(138,155,176,0.2)"}}>
              {!isU&&<div style={{fontSize:8,fontWeight:700,color:"var(--green)",marginBottom:2}}>FOREMAN</div>}{msg.text}
            </div>
          </div>})}
      </div>
      <div style={{padding:"8px 10px",borderTop:"1px solid rgba(138,155,176,0.2)",display:"flex",gap:6,background:"rgba(244,247,250,0.8)"}}>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")sendChat()}} placeholder="Type to the agent..." style={{flex:1,background:"#fff",border:"1px solid rgba(138,155,176,0.3)",borderRadius:"var(--radius-sm)",padding:"6px 10px",color:"var(--text)",fontSize:11,outline:"none"}}/>
        <button className="aqua-btn primary" onClick={sendChat} style={{fontSize:10,padding:"6px 12px"}}>Send</button>
      </div>
      {allDone&&<div style={{padding:"8px 10px",borderTop:"1px solid rgba(138,155,176,0.2)",background:"rgba(30,132,73,0.06)"}}>
        <button className="aqua-btn primary" style={{width:"100%",background:"linear-gradient(180deg,#27ae60,#1e8449)",borderColor:"#145a32"}}>Complete Assembly ✓</button>
      </div>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN — Three resizable panels
   ═══════════════════════════════════════════════════════════════════════════ */

export default function WorkspacePage() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const manifest = state?.manifest;

  const [sel, setSel] = useState(null);
  const [leftW, setLeftW] = useState(null);   // passport width (px)
  const [rightW, setRightW] = useState(null);  // agent width (px)
  const [dragSide, setDragSide] = useState(null); // "left" | "right" | null
  const containerRef = useRef(null);

  // Initialize widths based on container — passport & diagram each ~half of (total - agentW)
  useEffect(() => {
    if (containerRef.current && leftW === null) {
      const total = containerRef.current.clientWidth;
      const agent = 310;
      const remaining = total - agent - 8; // 8px for two drag handles
      setLeftW(Math.floor(remaining * 0.4));
      setRightW(agent);
    }
  }, [leftW]);

  useEffect(() => {
    if (!dragSide) return;
    const mv = e => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (dragSide === "left") {
        setLeftW(Math.max(180, Math.min(500, e.clientX - rect.left)));
      } else if (dragSide === "right") {
        setRightW(Math.max(250, Math.min(500, rect.right - e.clientX)));
      }
    };
    const up = () => setDragSide(null);
    window.addEventListener("mousemove", mv);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); };
  }, [dragSide]);

  if (!manifest) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--desktop)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="window" style={{ maxWidth: 400, width: "100%" }}>
          <div className="titlebar"><div className="traffic-lights"><div className="tl close"/><div className="tl min"/><div className="tl max"/></div><div className="titlebar-title">Error — No Data</div></div>
          <div style={{ padding: 24, textAlign: "center" }}><p style={{ marginBottom: 12, color: "var(--text-dim)" }}>No manifest loaded. Run an audit first.</p><button className="aqua-btn primary" onClick={() => navigate("/audit")}>Back to Audit</button></div>
        </div>
      </div>
    );
  }

  const blueprint = manifest.upcycle_blueprint;
  const modules = blueprint?.module_assessment ?? [];

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", fontFamily: "var(--font-ui)" }}>
      <div className="titlebar" style={{ flexShrink: 0 }}>
        <div className="traffic-lights"><div className="tl close" onClick={() => navigate("/")} style={{ cursor: "pointer" }} /><div className="tl min" /><div className="tl max" /></div>
        <div className="titlebar-title">ReVolt OS — Workspace — {manifest.battery_id}</div>
      </div>
      <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", background: "rgba(220,227,236,0.85)", borderBottom: "1px solid rgba(138,155,176,0.3)" }}>
        <button className="aqua-btn" onClick={() => navigate("/")}>← Overview</button>
        <button className="aqua-btn" onClick={() => navigate("/audit")}>New Audit</button>
        <div style={{ flex: 1 }} />
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-dim)" }}>revolt://workspace/{manifest.battery_id}</div>
      </div>

      {/* Three panels with two drag handles */}
      <div ref={containerRef} style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Left: passport */}
        <PassportSidebar manifest={manifest} width={leftW ?? 280} />

        {/* Left drag handle */}
        <div onMouseDown={() => setDragSide("left")} style={{ width: 4, cursor: "col-resize", background: dragSide === "left" ? "var(--aqua-blue)" : "rgba(138,155,176,0.3)", flexShrink: 0 }} />

        {/* Center: 3D + table (takes remaining space) */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <CenterPanel blueprint={blueprint} modules={modules} sel={sel} onSel={i => setSel(i === sel ? null : i)} />
        </div>

        {/* Right drag handle */}
        <div onMouseDown={() => setDragSide("right")} style={{ width: 4, cursor: "col-resize", background: dragSide === "right" ? "var(--aqua-blue)" : "rgba(138,155,176,0.3)", flexShrink: 0 }} />

        {/* Right: agent */}
        <div style={{ width: rightW ?? 310, flexShrink: 0 }}>
          <AgentPanel manifest={manifest} />
        </div>
      </div>
    </div>
  );
}
