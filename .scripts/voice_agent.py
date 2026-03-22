"""
voice_agent.py — ElevenLabs Safety Foreman Integration
=======================================================
This script runs ALONGSIDE the Flask API server.
It watches MongoDB for safety workflow state changes and
triggers the ElevenLabs Safety Foreman agent automatically.

HOW IT CONNECTS TO EVERYTHING:
  - MongoDB Change Stream → detects when a battery state changes
  - ElevenLabs Agent      → gets notified so it can guide the technician
  - Flask API             → the agent calls /api/batteries/:id/safety to log steps

Run this in a separate terminal while the Flask API is also running:
  python .scripts/voice_agent.py

You need these in your .env file:
  MONGODB_URI=...
  ELEVENLABS_API_KEY=...
  ELEVENLABS_AGENT_ID=...
"""

import os
import certifi
import requests
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

# --- CONFIGURATION ---
MONGODB_URI         = os.getenv("MONGODB_URI")
DB_NAME             = os.getenv("DB_NAME", "revolt_db")
COLLECTION_NAME     = "battery_twins"
ELEVENLABS_API_KEY  = os.getenv("ELEVENLABS_API_KEY")
ELEVENLABS_AGENT_ID = os.getenv("ELEVENLABS_AGENT_ID")

# Connect to MongoDB
mongo_client = MongoClient(MONGODB_URI, tlsCAFile=certifi.where())
collection   = mongo_client[DB_NAME][COLLECTION_NAME]


def update_agent_context(battery_id: str, current_state: str, safety_risks: list, battery_data: dict):
    """
    Called every time a safety workflow state changes.

    WHY THIS EXISTS:
    The Safety Foreman agent needs to know WHAT STATE the technician is in
    so it can give the right instructions. When MongoDB detects a state change,
    we update the agent's dynamic variables so it stays in sync.

    For example:
      State changes to "Discharging"
      → Agent now says: "Good. Now drain the battery to below 50V.
                         Confirm with your multimeter before proceeding."

      State changes to "Module Separation"
      → Agent now says: "Discharging confirmed. You may now begin unbolting
                         the modules. Remember — Cell #3 showed swelling."
    """

    if not ELEVENLABS_API_KEY or not ELEVENLABS_AGENT_ID:
        print("  ⚠ ELEVENLABS_API_KEY or ELEVENLABS_AGENT_ID not set in .env")
        return

    # Build a risk summary the agent can read
    risk_summary = ""
    if safety_risks:
        risk_lines = [
            f"- [{r.get('severity','?').upper()}] {r.get('risk_type','?')}: {r.get('description','')}"
            for r in safety_risks
        ]
        risk_summary = "\n".join(risk_lines)
    else:
        risk_summary = "No safety risks detected."

    # Extract battery-specific technical context from the Digital Twin
    mfg = battery_data.get("manufacturer", {})
    hd = battery_data.get("health_details", {})
    ts = battery_data.get("telemetry_summary", {})
    workflow = battery_data.get("safety_workflow", {})
    manifest = battery_data.get("audit_manifest", {})
    target_config = workflow.get("target_config") or "48V stationary storage"

    # Extract the upcycle blueprint if it exists
    blueprint = battery_data.get("upcycle_blueprint")
    blueprint_context = ""
    if blueprint:
        target_sys = blueprint.get("target_system", {})
        modules = blueprint.get("module_assessment", [])
        steps = blueprint.get("upcycle_steps", [])
        tools = blueprint.get("required_tools", [])
        parts = blueprint.get("required_parts", [])
        checklist = blueprint.get("pre_upcycle_checklist", [])
        verifications = blueprint.get("post_upcycle_verification", [])

        # Build module summary
        module_lines = []
        for m in modules:
            module_lines.append(f"  - {m.get('module_id','?')}: {m.get('status','?')} — {m.get('reason','')}")
        module_text = "\n".join(module_lines) if module_lines else "  No module data"

        # Build step summary (the voice agent needs these)
        step_lines = []
        for s in steps:
            sn = s.get("step_number", "?")
            title = s.get("title", "")
            instruction = s.get("instruction", "")
            expected = s.get("expected_reading", "")
            warning = s.get("safety_warning", "")
            note = s.get("voice_agent_note", "")
            step_lines.append(
                f"  STEP {sn}: {title}\n"
                f"    Instruction: {instruction}\n"
                f"    Expected reading: {expected or 'N/A'}\n"
                f"    Safety warning: {warning or 'None'}\n"
                f"    Voice note: {note}"
            )
        step_text = "\n\n".join(step_lines) if step_lines else "  No steps available"

        # Build tools/parts lists
        tool_text = "\n".join([f"  - {t.get('tool','?')}: {t.get('specification','')}" for t in tools]) or "  None listed"
        part_text = "\n".join([f"  - {p.get('part','?')} x{p.get('quantity',1)}: {p.get('specification','')}" for p in parts]) or "  None listed"
        checklist_text = "\n".join([f"  ☐ {item}" for item in checklist]) or "  None listed"

        blueprint_context = f"""

UPCYCLE BLUEPRINT (Gemini-generated prescription for this specific battery):
Target System: {target_sys.get('name', '?')} | {target_sys.get('topology', '?')} | {target_sys.get('target_voltage', '?')}V
Topology Rationale: {target_sys.get('topology_explanation', 'N/A')}
Estimated Time: {blueprint.get('estimated_total_time_hours', '?')} hours
Difficulty: {blueprint.get('difficulty_level', '?')}

MODULE ASSESSMENT:
{module_text}

REQUIRED TOOLS:
{tool_text}

REQUIRED PARTS:
{part_text}

PRE-UPCYCLE CHECKLIST:
{checklist_text}

STEP-BY-STEP UPCYCLE PROCEDURE:
{step_text}

ENGINEERING NOTES: {blueprint.get('gemini_engineering_notes', 'N/A')}"""

    battery_context = f"""BATTERY IDENTITY:
- ID: {battery_id}
- Manufacturer: {mfg.get('name', 'Unknown')}
- Model: {mfg.get('model', 'Unknown')}
- Chemistry: {mfg.get('chemistry', 'Unknown')}
- Nominal voltage: {mfg.get('nominal_voltage', 'Unknown')}V per cell
- Pack capacity: {mfg.get('nominal_capacity_kwh', 'Unknown')} kWh

HEALTH ASSESSMENT:
- Health grade: {battery_data.get('health_grade', 'Unknown')}
- State of health: {hd.get('state_of_health_pct', 'Unknown')}%
- Total cycles: {hd.get('total_cycles', 'Unknown')}
- Peak temperature recorded: {hd.get('peak_temp_recorded_c', 'Unknown')}°C
- Average discharge rate: {hd.get('avg_discharge_rate_c', 'Unknown')}C
- Physical condition: {hd.get('physical_condition', 'Unknown')}
- Gemini analysis: {hd.get('gemini_analysis_summary', 'No analysis available')}

TELEMETRY SUMMARY:
- Voltage range: {ts.get('voltage_min', '?')}V – {ts.get('voltage_max', '?')}V
- Temperature range: {ts.get('temp_min_c', '?')}°C – {ts.get('temp_max_c', '?')}°C
- Capacity fade: {ts.get('capacity_fade_pct', '?')}%

TARGET CONFIGURATION: {target_config}
EN 18061:2025 STATUS: {manifest.get('en_18061_status', battery_data.get('status', 'Unknown'))}
{blueprint_context}"""

    # Detailed state-specific instructions with real technical procedures
    state_instructions = {
        "Not Started": """Greet the technician by name if known. Ask them to confirm:
1. They are wearing Class 0 insulated gloves rated for 1000V
2. Safety glasses with side shields are on
3. Arc flash suit or flame-resistant clothing is worn
4. A Class D fire extinguisher is within arm's reach
5. The work area is dry with no conductive materials nearby
6. Another person is present or aware of the work being done
Only proceed when ALL items are confirmed.""",

        "Inspection": """Walk the technician through a visual inspection of the battery:
1. Check for any bulging, swelling, or deformation of cells
2. Look for white powder deposits near terminals (electrolyte leakage)
3. Check for burn marks, discoloration, or melted plastic
4. Verify all connector integrity — no corrosion or green oxidation
5. Confirm the battery orientation matches the expected layout
6. Read the voltage on the main busbar with a multimeter — state the expected reading based on the battery specs
If ANY visual red flags are found, STOP the workflow and advise the technician to mark the unit for recycling.""",

        "Discharging": f"""Guide the technician through safe discharge:
1. Connect the resistive load bank to the main terminals
2. Set the load to draw current at 0.5C rate or lower
3. Monitor the voltage — it should drop steadily
4. For {mfg.get('chemistry', 'NMC')} chemistry, the safe cutoff is:
   - NMC/NCA: Drain to 3.0V per cell (approximately 50V for a typical pack)
   - LFP: Drain to 2.5V per cell (approximately 40V for a typical pack)
5. Once target voltage is reached, disconnect the load
6. Wait 5 minutes for voltage to stabilize
7. Re-measure with multimeter — confirm voltage is BELOW 50V
8. Only then confirm the discharge step is complete
CRITICAL: If voltage spikes back up after disconnecting the load, there may be a cell reversal. Do NOT proceed.""",

        "Module Separation": f"""Guide the technician through physical disassembly:
1. Confirm the pack voltage is still below 50V before touching anything
2. Identify the main busbar connections between modules
3. Use insulated tools ONLY — standard tools can arc
4. Remove the compression rods or bolts holding the stack together
5. Disconnect busbars ONE AT A TIME, starting from the positive terminal
6. Label each module as you remove it (Module 1, Module 2, etc.)
7. Check individual module voltage as you separate — it should be {round(mfg.get('nominal_voltage', 3.7) * 4, 1)}V for a 4-cell module

IMPORTANT SAFETY NOTES FOR THIS SPECIFIC BATTERY:
{risk_summary}

If the technician asks about specific wiring, connectors, or pin layouts:
- Describe the physical location using clock positions (12 o'clock = top)
- Reference colors: positive terminals are typically RED, negative BLACK
- BMS harness pins: read them left-to-right, Pin 1 is always the ground reference
- If you're unsure about a specific detail, tell them to check the knowledge base PDF or stop and verify""",

        "Reassembly": f"""Guide the technician through building the {target_config}:
1. Lay out the approved modules in the target configuration
2. Before connecting: measure EACH module's voltage
   - All modules must be within 0.1V of each other (cell voltage delta)
   - If any module is more than 0.1V off, it must be balanced first
   - Connecting unbalanced modules causes Joule heating and can spark
3. For a 48V configuration:
   - Series connection: modules in line (voltages ADD UP)
   - Parallel connection: modules side by side (capacity ADDS UP)
   - 48V target = approximately 13-14 cells in series for NMC (3.7V × 13 = 48.1V)
   - 48V target = approximately 15-16 cells in series for LFP (3.2V × 15 = 48.0V)
4. Connect busbars in the correct series/parallel arrangement
5. Connect the BMS (Battery Management System):
   - Balance leads go to each cell junction point
   - Main positive and negative to the pack terminals
   - Temperature sensor to the center of the pack
6. Verify output voltage: should read approximately 48V (±2V)
7. Do NOT connect to the inverter until voltage is confirmed

CRITICAL: If the measured output voltage is significantly different from expected, disconnect everything and re-check the wiring. A reversed module will show roughly ZERO volts at the pack level.""",

        "Complete": f"""Congratulate the technician on completing the upcycle.
Final verification checklist:
1. Confirm the final pack voltage reading
2. Confirm the BMS is showing all cells balanced
3. Confirm no unusual heat from any module (touch test with back of hand)
4. The battery is now a certified Secondary Life Asset
5. The Battery Passport has been updated with the completion timestamp
6. This unit is ready for connection to a 48V solar inverter

Log the completion and close the session. Remind the technician that the full compliance trail has been recorded in the Digital Battery Passport.""",
    }

    next_instruction = state_instructions.get(current_state, "Guide the technician through the current step safely.")

    print(f"\n🔔 State change detected: {battery_id} → {current_state}")
    print(f"   Battery: {mfg.get('name', '?')} {mfg.get('model', '?')}")
    print(f"   Grade: {battery_data.get('health_grade', '?')} | SOH: {hd.get('state_of_health_pct', '?')}%")
    print(f"   Risks: {len(safety_risks)}")
    print(f"   Target: {target_config}")

    # Update the agent's prompt via ElevenLabs API
    response = requests.patch(
        f"https://api.elevenlabs.io/v1/convai/agents/{ELEVENLABS_AGENT_ID}",
        headers={
            "xi-api-key":   ELEVENLABS_API_KEY,
            "Content-Type": "application/json",
        },
        json={
            "conversation_config": {
                "agent": {
                    "prompt": {
                        "prompt": f"""You are "Safety Foreman," a calm, authoritative Industrial Safety Inspector with deep expertise in lithium-ion battery systems. You sound like a senior electrical engineer who has done hundreds of battery upcycling jobs.

You are currently guiding a technician through the upcycling of a specific battery. Here is everything you know about it:

{battery_context}

CURRENT WORKFLOW STATE: {current_state}

YOUR TASK FOR THIS STATE:
{next_instruction}

ACTIVE SAFETY RISKS:
{risk_summary}

COMMUNICATION STYLE:
- Speak calmly and clearly, like a mentor guiding an apprentice
- Use specific technical terms: busbars, compression rods, BMS harness, cell voltage delta
- When the technician is confused, break the instruction into smaller steps
- Reference specific pin numbers, wire colors, and physical locations when asked
- If the technician asks "which wire" or "which connector," describe it by position (left/right, top/bottom, Pin 1/Pin 2)
- Always state the EXPECTED voltage or reading BEFORE the technician measures, so they can verify

ABSOLUTE RULES:
- Steps must be completed in order: Inspection → Discharging → Module Separation → Reassembly → Complete
- If a technician tries to skip a step, refuse firmly and explain the safety reason
- If the technician mentions smoke, burning smell, sparking, or unusual heat — IMMEDIATELY tell them to:
  1. Step back from the battery
  2. Do NOT touch anything
  3. Call emergency services if fire is visible
  4. Use the Class D extinguisher ONLY if trained
- Never guess about safety procedures. If uncertain about a specific model detail, say "Let me check the passport" and reference the knowledge base
- Always confirm the technician's multimeter reading matches the expected value before proceeding"""
                    }
                }
            }
        },
    )

    if response.status_code == 200:
        print(f"   ✓ Agent context updated for state: {current_state}")
    else:
        print(f"   ⚠ Agent update failed ({response.status_code}): {response.text}")


def watch_safety_workflow():
    """
    MongoDB Change Stream that watches for safety workflow state changes.

    HOW IT WORKS:
    1. Technician completes a step → voice agent calls PATCH /api/batteries/:id/safety
    2. MongoDB updates safety_workflow.current_state
    3. This Change Stream detects the update INSTANTLY (real-time)
    4. It calls update_agent_context() with the full battery document
    5. The agent's prompt is updated so it knows what step is next

    This creates a real-time feedback loop:
      Technician speaks → Agent hears → API logs step → MongoDB updates
      → Change Stream fires → Agent updates → Agent speaks next instruction

    Run this in a separate terminal:
      python .scripts/voice_agent.py
    """

    print("\n🔋 ReVolt OS — ElevenLabs Safety Foreman")
    print("=" * 45)
    print("👀 Watching MongoDB for safety workflow changes...")
    print("   (Press Ctrl+C to stop)\n")

    # Only watch for safety workflow state changes and disassembly status
    pipeline = [
        {
            "$match": {
                "operationType": "update",
                "$or": [
                    {"updateDescription.updatedFields.safety_workflow.current_state": {"$exists": True}},
                    {"updateDescription.updatedFields.status": "Disassembly Started"},
                ],
            }
        }
    ]

    try:
        with collection.watch(pipeline) as stream:
            for change in stream:
                # Get the _id of the changed document
                battery_oid = change.get("documentKey", {}).get("_id")

                # Fetch the full battery document so we have all the context
                battery = collection.find_one({"_id": battery_oid})
                if not battery:
                    continue

                battery_id   = battery.get("battery_id", "Unknown")
                workflow     = battery.get("safety_workflow", {})
                current_state = workflow.get("current_state", "Unknown")
                safety_risks  = battery.get("safety_risks", [])

                # Update the ElevenLabs agent with the new context
                update_agent_context(
                    battery_id=battery_id,
                    current_state=current_state,
                    safety_risks=safety_risks,
                    battery_data=battery,
                )

    except KeyboardInterrupt:
        print("\n✓ Safety Foreman watcher stopped.")
    except Exception as e:
        print(f"\n⚠ Watcher error: {e}")
        print("  Check your MONGODB_URI in .env and try again.")


# ============================================
# MAIN
# ============================================
if __name__ == "__main__":
    watch_safety_workflow()
