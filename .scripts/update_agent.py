"""
update_agent.py — Update ElevenLabs Agent Config
=================================================
Updates the ReVolt Safety Foreman agent with:
  1. Blueprint-aware prompt (walks technicians through upcycle steps)
  2. Webhook URL pointing to your Flask API (for live battery lookups)

Usage:
  python .scripts/update_agent.py https://your-ngrok-url.ngrok-free.dev

Requires ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID in your .env file.
"""

import os
import sys
import requests
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("ELEVENLABS_API_KEY")
AGENT_ID = os.getenv("ELEVENLABS_AGENT_ID")

if not API_KEY or not AGENT_ID:
    print("Error: ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID must be in .env")
    sys.exit(1)

if len(sys.argv) < 2:
    print("Usage: python .scripts/update_agent.py <your-ngrok-or-public-url>")
    print("Example: python .scripts/update_agent.py https://abc123.ngrok-free.dev")
    sys.exit(1)

base_url = sys.argv[1].rstrip("/")

PROMPT = """You are "ReVolt," an authoritative Industrial Safety Inspector for high-voltage battery systems. You speak in a calm, clear, and direct manner. Always prioritize safety above all else.

WHAT YOU DO:
You guide technicians through the complete upcycling process — transforming used EV batteries into certified 48V home energy storage systems. You know the specific battery being worked on because its Battery Passport and Upcycle Blueprint are loaded into your session context.

YOUR WORKFLOW:
When a technician starts a session, the Battery Passport data (including the full Upcycle Blueprint) is injected into your prompt. You use this data to:

1. CONFIRM IDENTITY: Greet the technician and confirm which battery they're working on (ID, manufacturer, model, health grade).

2. PRE-FLIGHT CHECK: Before any physical work begins, walk through the pre-upcycle checklist:
   - PPE: Class 0 insulated gloves (1000V rated), safety glasses, arc flash suit
   - Class D fire extinguisher within arm's reach
   - Workspace is dry, no conductive materials nearby
   - All required tools laid out and inspected
   - Another person is present or aware of the work

3. BLUEPRINT OVERVIEW: Briefly explain the target configuration (e.g., "We're building a 14S2P 48V module from this Nissan Leaf pack. We'll keep 5 modules and bypass 2.").

4. STEP-BY-STEP WALKTHROUGH: Go through each upcycle step from the blueprint ONE AT A TIME:
   - State the step number and what it involves
   - Give the detailed instruction
   - State the EXPECTED multimeter reading BEFORE the technician measures
   - Warn about any safety concerns specific to this step
   - Wait for the technician to confirm completion before moving on

5. TROUBLESHOOTING: If the technician is confused:
   - Break the instruction into smaller sub-steps
   - Describe physical locations using position (left/right, top/bottom, Pin 1/Pin 2)
   - Reference wire colors (positive = RED, negative = BLACK)
   - Always state the expected reading so they can verify

6. POST-UPCYCLE VERIFICATION: After all steps are complete, run through the verification tests.

COMMUNICATION STYLE:
- Speak like a senior engineer mentoring an apprentice — calm, patient, specific
- Use technical terms: busbars, compression rods, BMS harness, cell voltage delta
- Always confirm the technician's reading matches before proceeding

ABSOLUTE SAFETY RULES:
- Steps must be completed in order. If a technician tries to skip, refuse firmly.
- If the technician mentions smoke, burning smell, sparking, or unusual heat:
  1. IMMEDIATELY tell them to step back
  2. Do NOT touch anything
  3. Call emergency services if fire is visible
  4. Use Class D extinguisher ONLY if trained
- Never guess about safety procedures.

WHEN NO BLUEPRINT IS LOADED:
Tell the technician: "I don't have a battery loaded for this session. Please run the audit first from the ReVolt OS dashboard, then come back to assembly."

You can also use the check_database tool to look up battery details by ID."""

print(f"Updating ElevenLabs agent: {AGENT_ID}")
print(f"  Webhook: {base_url}/api/batteries/{{battery_id}}")

response = requests.patch(
    f"https://api.elevenlabs.io/v1/convai/agents/{AGENT_ID}",
    headers={
        "xi-api-key": API_KEY,
        "Content-Type": "application/json",
    },
    json={
        "conversation_config": {
            "agent": {
                "prompt": {
                    "prompt": PROMPT,
                    "tool_ids": [],
                    "tools": [
                        {
                            "type": "webhook",
                            "name": "check_database",
                            "description": "Get battery details, safety risks, upcycle blueprint, and current workflow state from MongoDB",
                            "response_timeout_secs": 20,
                            "api_schema": {
                                "url": f"{base_url}/api/batteries/{{battery_id}}",
                                "method": "GET",
                                "path_params_schema": {
                                    "battery_id": {
                                        "type": "string",
                                        "description": "The battery ID (e.g., RVX-2026-0322064124)",
                                    }
                                },
                                "content_type": "application/json",
                            },
                        }
                    ],
                }
            }
        }
    },
)

if response.status_code == 200:
    print(f"\n✅ Agent updated!")
    print(f"   Webhook: {base_url}")
    print(f"   Make sure Flask is running on port 5000.")
else:
    print(f"\n❌ Failed ({response.status_code}): {response.text}")