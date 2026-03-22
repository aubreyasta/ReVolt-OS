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

    # What the agent should say next based on current state
    state_instructions = {
        "Not Started":       "Greet the technician and ask them to confirm their PPE before starting.",
        "Inspection":        "Guide the technician through PPE verification and environment check. Ask them to confirm each item.",
        "Discharging":       "Instruct the technician to drain the battery to below 50V using a resistive load bank. Remind them to confirm with a multimeter.",
        "Module Separation": "Guide the technician to carefully unbolt each module. Warn about any detected safety risks before they begin.",
        "Reassembly":        "Guide the technician through wiring the modules into the target configuration and connecting the BMS.",
        "Complete":          "Congratulate the technician. Ask them to confirm the final output voltage, then close the session.",
    }

    next_instruction = state_instructions.get(current_state, "Guide the technician through the current step.")

    print(f"\n🔔 State change detected: {battery_id} → {current_state}")
    print(f"   Risks: {len(safety_risks)}")
    print(f"   Agent instruction: {next_instruction[:60]}...")

    # Update the agent's prompt variables via ElevenLabs API
    # This dynamically injects the current battery context into the agent
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
                        "prompt": f"""You are a calm, authoritative Industrial Safety Inspector named "Safety Foreman".
You are currently guiding a technician through the disassembly of battery: {battery_id}

CURRENT WORKFLOW STATE: {current_state}
YOUR NEXT TASK: {next_instruction}

ACTIVE SAFETY RISKS FOR THIS BATTERY:
{risk_summary}

RULES:
- Always check the knowledge base (Battery Passport PDF) before answering procedural questions
- Steps must be completed in order: Inspection → Discharging → Module Separation → Reassembly → Complete
- If a technician tries to skip a step, refuse and explain why the order matters
- If you detect hesitation or confusion, slow down and repeat the instructions clearly
- If the technician mentions smoke, burning smell, or sparks — immediately tell them to step back and call emergency services
- Never guess about safety procedures. If unsure, tell the technician to stop work."""
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