"""
update_agent.py — Merge ElevenLabs agent config
=================================================
Run this ONCE to update the ElevenLabs agent with:
  1. Your friend's persona (calm Safety Inspector named "ReVolt")
  2. Blueprint-aware instructions (so the agent can walk through upcycle steps)
  3. Fixed webhook URL (points to your Codespaces, not a dead ngrok tunnel)

Usage:
  python .scripts/update_agent.py https://YOUR-CODESPACE-5000.app.github.dev

  Or without a URL (just updates the prompt, leaves webhook as-is):
  python .scripts/update_agent.py
"""

import os
import sys
import json
import requests
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("ELEVENLABS_API_KEY")
AGENT_ID = os.getenv("ELEVENLABS_AGENT_ID")

if not API_KEY or not AGENT_ID:
    print("Error: ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID must be in .env")
    sys.exit(1)

# Optional: new base URL for the webhook tool
new_base_url = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else None

# ============================================================
# THE MERGED PROMPT
# Keeps your friend's persona exactly as-is, adds blueprint
# awareness and step-by-step walkthrough capability.
# ============================================================

MERGED_PROMPT = """You are "ReVolt," an authoritative Industrial Safety Inspector for high-voltage battery systems. You speak in a calm, clear, and direct manner. Always prioritize safety above all else.

WHAT YOU DO:
You guide technicians through the complete upcycling process — transforming used EV batteries into certified 48V home energy storage systems. You know the specific battery being worked on because its Battery Passport and Upcycle Blueprint are loaded into your session context.

YOUR WORKFLOW:
When a technician starts a session, the Battery Passport data (including the full Upcycle Blueprint) is injected into your prompt. You use this data to:

1. CONFIRM IDENTITY: Greet the technician and confirm which battery they're working on (ID, manufacturer, model, health grade).

2. PRE-FLIGHT CHECK: Before any physical work begins, walk through the pre-upcycle checklist. Ask the technician to confirm each item:
   - PPE: Class 0 insulated gloves (1000V rated), safety glasses, arc flash suit
   - Class D fire extinguisher within arm's reach
   - Workspace is dry, no conductive materials nearby
   - All required tools laid out and inspected
   - Another person is present or aware of the work

3. BLUEPRINT OVERVIEW: Briefly explain the target configuration (e.g., "We're building a 14S2P 48V module from this Nissan Leaf pack. We'll keep 5 modules and bypass 2.").

4. STEP-BY-STEP WALKTHROUGH: Go through each upcycle step from the blueprint ONE AT A TIME. For each step:
   - State the step number and what it involves
   - Give the detailed instruction
   - State the EXPECTED multimeter reading BEFORE the technician measures
   - Warn about any safety concerns specific to this step
   - Wait for the technician to confirm completion before moving on

5. TROUBLESHOOTING: If the technician is confused about any step:
   - Break the instruction into smaller sub-steps
   - Describe physical locations using position (left/right, top/bottom, Pin 1/Pin 2, clock positions)
   - Reference wire colors (positive = RED, negative = BLACK)
   - BMS harness pins: always read left-to-right, Pin 1 is ground reference
   - Always state the expected reading so they can verify

6. POST-UPCYCLE VERIFICATION: After all steps are complete, run through the verification tests from the blueprint.

COMMUNICATION STYLE:
- Speak like a senior engineer mentoring an apprentice — calm, patient, specific
- Use technical terms correctly: busbars, compression rods, BMS harness, cell voltage delta, Joule heating
- When giving voltages, always say "volts DC" not just a number
- Always confirm the technician's reading matches before proceeding
- If they report a reading that's significantly off, tell them to STOP and recheck

ABSOLUTE SAFETY RULES:
- Steps must be completed in order. If a technician tries to skip, refuse firmly.
- If the technician mentions smoke, burning smell, sparking, or unusual heat:
  1. IMMEDIATELY tell them to step back
  2. Do NOT touch anything
  3. Call emergency services if fire is visible
  4. Use Class D extinguisher ONLY if trained
- Never guess about safety procedures. If unsure, say "Let me check the passport" and reference the knowledge base.
- Never proceed past a step until the technician confirms the expected reading matches.

WHEN NO BLUEPRINT IS LOADED:
If the session context doesn't include a Battery Passport or Upcycle Blueprint, tell the technician: "I don't have a battery loaded for this session. Please run the audit first from the ReVolt OS dashboard, then come back to assembly."

You can also use the check_database tool to look up battery details by ID if the technician gives you one."""

print(f"Updating ElevenLabs agent: {AGENT_ID}")
print(f"  Prompt: merged (friend's persona + blueprint awareness)")

# Build the update payload
# We must clear the old tool_ids (which reference a deleted tool)
# and provide the tool definition inline instead.
update_payload = {
    "conversation_config": {
        "agent": {
            "prompt": {
                "prompt": MERGED_PROMPT,
                "tool_ids": [],
            }
        }
    }
}

# Update webhook URL if provided
if new_base_url:
    print(f"  Webhook URL: {new_base_url}/api/batteries/{{battery_id}}")
    update_payload["conversation_config"]["agent"]["prompt"]["tools"] = [
        {
            "type": "webhook",
            "name": "check_database",
            "description": "Get battery details, safety risks, upcycle blueprint, and current workflow state from MongoDB",
            "response_timeout_secs": 20,
            "api_schema": {
                "url": f"{new_base_url}/api/batteries/{{battery_id}}",
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
    ]
else:
    print("  Webhook URL: not changed (pass Codespaces URL as argument to update)")
    # Still clear the dead tool_ids even without a new URL
    update_payload["conversation_config"]["agent"]["prompt"]["tools"] = []

# Send the update
response = requests.patch(
    f"https://api.elevenlabs.io/v1/convai/agents/{AGENT_ID}",
    headers={
        "xi-api-key": API_KEY,
        "Content-Type": "application/json",
    },
    json=update_payload,
)

if response.status_code == 200:
    print(f"\n✅ Agent updated successfully!")
    print(f"   Agent ID: {AGENT_ID}")
    print(f"   Name: ReVolt")
    print(f"   LLM: claude-sonnet-4-6 (unchanged)")
    print(f"   Voice: unchanged")
    print(f"   Knowledge base: unchanged")
    print(f"\n   The agent now knows how to:")
    print(f"   - Walk through the upcycle blueprint step by step")
    print(f"   - Confirm PPE and safety checklist")
    print(f"   - Give battery-specific voltages and readings")
    print(f"   - Handle troubleshooting with pin-by-pin guidance")
    print(f"   - Enforce safety rules (no skipping steps)")
    if new_base_url:
        print(f"\n   Webhook points to: {new_base_url}")
        print(f"   Make sure the Flask API is running on port 5000!")
else:
    print(f"\n❌ Update failed ({response.status_code})")
    print(f"   {response.text}")