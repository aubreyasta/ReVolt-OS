"""
audit.py — Gemini Multimodal Battery Auditor (Sprint 2)
=======================================================
This is Person 2's main script. It does FOUR things:
  1. VISION: Analyzes a battery photo to identify manufacturer/model/condition
  2. TELEMETRY: Analyzes CSV data to calculate health grade + safety risks
  3. EMBEDDING: Generates a vector embedding for MongoDB Vector Search
  4. MANIFEST: Combines everything into a Digital Twin document that matches
              Sprint 1's MongoDB schema exactly

The output is a complete document ready to POST to the Sprint 1 API:
  POST http://localhost:5000/api/batteries

HOW IT USES GEMINI:
  - gemini-3-flash-preview: Multimodal reasoning (photo + CSV analysis)
  - gemini-embedding-001: Converts telemetry into vector embeddings

IMPORTANT: The gemini-embedding-001 model outputs 3072-dim vectors.
  You MUST update the Atlas Vector Search index to numDimensions: 3072
  (or whichever dimension the model returns) for real embeddings to work.

Run: python audit.py sample_telemetry.csv battery_photo.jpg
"""

from google import genai
from google.genai import types
from dotenv import load_dotenv
import os
import json
import csv
import sys
import requests
from pathlib import Path
from datetime import datetime, timezone

load_dotenv()

# --- CONFIGURATION ---
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
GEMINI_MODEL = "gemini-3-flash-preview"
EMBEDDING_MODEL = "gemini-embedding-001"

# Sprint 1 API — where we send the finished Digital Twin
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:5000")


def clean_json_response(raw_text: str) -> dict:
    """
    Gemini sometimes wraps JSON in markdown code fences like ```json ... ```.
    This strips those fences and parses the clean JSON.
    
    WHY THIS IS NEEDED:
    Even when you tell Gemini "return ONLY valid JSON", it sometimes
    adds ```json at the start and ``` at the end. This is a common
    pattern when working with LLMs — always clean the output.
    """
    raw = raw_text.strip()
    
    # Strip markdown code fences if present
    if raw.startswith("```"):
        # Split by ``` and take the content between first and second fence
        parts = raw.split("```")
        if len(parts) >= 2:
            raw = parts[1]
            # Remove the "json" language tag if present
            if raw.startswith("json"):
                raw = raw[4:]
    
    return json.loads(raw.strip())


def parse_csv_stats(csv_path: str) -> dict:
    """
    Extract basic statistics from the CSV before sending to Gemini.
    
    WHY DO THIS LOCALLY?
    We compute simple stats (min, max, mean) in Python because it's
    faster and more reliable than asking Gemini to do math. Gemini
    is better at REASONING about what the numbers mean — not crunching them.
    
    These stats also populate the telemetry_summary field in our schema.
    """
    rows = []
    with open(csv_path, "r") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)
    
    if not rows:
        return {"error": "Empty CSV file"}
    
    # Extract numeric columns
    voltages = [float(r["voltage_v"]) for r in rows if r.get("voltage_v")]
    currents = [float(r["current_a"]) for r in rows if r.get("current_a")]
    temps = [float(r["temp_c"]) for r in rows if r.get("temp_c")]
    socs = [float(r["soc_pct"]) for r in rows if r.get("soc_pct")]
    
    # Get cycle count from the data (it's the same for all rows in a session)
    cycle_counts = [int(r["cycle_count"]) for r in rows if r.get("cycle_count")]
    cycle_count = max(cycle_counts) if cycle_counts else 0
    
    # Calculate stats
    stats = {
        "data_points_count": len(rows),
        "cycle_count": cycle_count,
        "voltage_min": round(min(voltages), 2) if voltages else 0,
        "voltage_max": round(max(voltages), 2) if voltages else 0,
        "voltage_mean": round(sum(voltages) / len(voltages), 2) if voltages else 0,
        "temp_min_c": round(min(temps), 1) if temps else 0,
        "temp_max_c": round(max(temps), 1) if temps else 0,
        "temp_mean_c": round(sum(temps) / len(temps), 1) if temps else 0,
        "current_min": round(min(currents), 1) if currents else 0,
        "current_max": round(max(currents), 1) if currents else 0,
        "soc_start": socs[0] if socs else 0,
        "soc_end": socs[-1] if socs else 0,
        "soc_drop": round(socs[0] - socs[-1], 1) if socs else 0,
    }
    
    # Detect if there was a fast-charge event (current spike above 60A)
    high_current_readings = [c for c in currents if c > 60]
    stats["high_current_events"] = len(high_current_readings)
    stats["fast_charge_ratio_pct"] = round(
        len(high_current_readings) / len(currents) * 100, 1
    ) if currents else 0
    
    return stats


# ============================================
# STEP 1: ANALYZE BATTERY PHOTO (Vision)
# ============================================

def analyze_image(image_path: str) -> dict:
    """
    Use Gemini Vision to identify a battery from its photo/sticker.
    
    WHAT IT LOOKS FOR:
    - Manufacturer name and logo
    - Model number / part number
    - Chemistry type (NMC, LFP, NCA, etc.)
    - Rated capacity and voltage
    - Manufacture date / serial number
    - Physical condition (swelling, corrosion, dents)
    
    The physical condition check is KEY for the safety workflow —
    if Gemini detects swelling or damage, it becomes a safety_risk.
    """
    image_bytes = Path(image_path).read_bytes()
    
    # Detect mime type from extension
    ext = Path(image_path).suffix.lower()
    mime_map = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
    mime_type = mime_map.get(ext, "image/jpeg")
    
    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=[
            types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
            """You are a battery identification and safety inspection AI for ReVolt OS.
Analyze this battery image and return ONLY valid JSON with no explanation.

Look for:
1. Manufacturer info from any stickers, labels, or markings
2. Physical condition — check for swelling, bulging, corrosion, dents, leaks, burn marks
3. Terminal/connector types visible

Return this exact JSON structure:
{
  "manufacturer": {
    "name": "string - manufacturer name or 'Unknown'",
    "model": "string - model/part number or 'Unknown'",
    "chemistry": "string - one of: NMC, LFP, NCA, LMO, LTO, or 'Unknown'",
    "nominal_voltage": 0.0,
    "nominal_capacity_kwh": 0.0,
    "manufacture_date": "string - ISO date or 'Unknown'"
  },
  "physical_condition": "string - one of: Excellent, Good, Minor wear, Moderate damage, Severe damage",
  "physical_observations": ["list of specific things you see"],
  "safety_concerns_from_photo": [
    {
      "risk_type": "Structural or Chemical or Thermal",
      "severity": "Low or Medium or High or Critical",
      "description": "What you observed",
      "detected_by": "gemini_vision"
    }
  ]
}

If you cannot identify the battery (e.g. it's not a battery), still return the structure with 'Unknown' values and note what you see in physical_observations.
If you see NO safety concerns, return an empty array for safety_concerns_from_photo."""
        ]
    )
    
    return clean_json_response(response.text)


# ============================================
# STEP 2: ANALYZE TELEMETRY CSV (Reasoning)
# ============================================

def run_audit(csv_path: str, csv_stats: dict) -> dict:
    """
    Use Gemini to analyze telemetry data and generate a health assessment.
    
    WHAT'S CLEVER HERE:
    We send BOTH the raw CSV AND the pre-computed stats to Gemini.
    The stats give Gemini reliable numbers to reason about, while the
    raw CSV lets it see patterns (voltage sag, thermal spikes, etc.)
    that pure stats might miss.
    
    The output includes:
    - Health grade (A+ through F)
    - Remaining useful life estimate
    - Safety risks detected from the data
    - A recommended second-life configuration
    - An auto-generated marketplace listing
    """
    with open(csv_path, "r") as f:
        csv_data = f.read()
    
    prompt = f"""You are a battery engineering AI for ReVolt OS, an industrial platform that certifies used EV batteries for second-life use by SMEs.

Analyze this battery telemetry data and pre-computed statistics. Return ONLY valid JSON.

=== PRE-COMPUTED STATISTICS ===
{json.dumps(csv_stats, indent=2)}

=== RAW CSV DATA ===
{csv_data}

=== GRADING CRITERIA ===
- A+ / A: SOH above 90%, low thermal stress, conservative discharge history
- B+ / B: SOH 80-90%, moderate stress, some fast-charge events
- C+ / C: SOH 70-80%, high fast-charge ratio or thermal events
- D: SOH 60-70%, significant degradation
- F: SOH below 60% or dangerous thermal events (peak temp > 60C)

=== SAFETY RISK DETECTION ===
Flag any of these as safety risks:
- Peak temperature above 45C = Thermal risk
- Current spikes above 60A = Electrical stress risk  
- Voltage dropping below 300V = Electrical risk (deep discharge)
- SOC dropping more than 40% in one session = High-rate discharge risk

Return this exact JSON structure:
{{
  "health_grade": "B",
  "health_details": {{
    "state_of_health_pct": 82.0,
    "remaining_useful_life_years": 4.2,
    "total_cycles": 412,
    "peak_temp_recorded_c": 54.1,
    "avg_discharge_rate_c": 0.8,
    "physical_condition": "Unknown - pending photo analysis",
    "gemini_analysis_summary": "2-3 sentence technical summary of the battery's condition and recommended use."
  }},
  "safety_risks": [
    {{
      "risk_type": "Thermal",
      "severity": "Medium",
      "description": "What was detected",
      "mitigation": "What to do about it",
      "detected_by": "gemini_csv"
    }}
  ],
  "recommended_config": "4S2P 48V Solar Stack",
  "listing": {{
    "title": "Short marketplace title with capacity, grade, and key feature",
    "description": "2-3 sentence SEO-optimized listing description explaining why a buyer should trust this battery."
  }},
  "eu_compliant": true
}}

Base ALL values on the actual data. Do not copy the example values."""

    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=prompt
    )
    
    return clean_json_response(response.text)


# ============================================
# STEP 3: GENERATE VECTOR EMBEDDING
# ============================================

def generate_telemetry_embedding(csv_path: str) -> list:
    """
    Convert the telemetry CSV into a vector embedding using Gemini.
    
    WHY THIS MATTERS:
    This embedding is the "behavior fingerprint" of the battery.
    When stored in MongoDB, Atlas Vector Search can find batteries
    with SIMILAR behavior — even if they're different brands.
    
    The gemini-embedding-001 model outputs 3072-dimensional vectors.
    
    IMPORTANT FOR PERSON 1:
    The Vector Search index must be updated to numDimensions: 3072
    to work with these real embeddings (our seed data used fake 256-dim ones).
    """
    with open(csv_path, "r") as f:
        csv_data = f.read()
    
    response = client.models.embed_content(
        model=EMBEDDING_MODEL,
        contents=csv_data
    )
    
    embedding = response.embeddings[0].values
    print(f"  Embedding generated: {len(embedding)} dimensions")
    return embedding


# ============================================
# STEP 4: BUILD COMPLETE DIGITAL TWIN
# ============================================

def build_digital_twin(csv_path: str, image_path: str = None, seller_id: str = "seller-unknown") -> dict:
    """
    The main function — combines all steps into a complete Digital Twin
    document that matches the Sprint 1 MongoDB schema exactly.
    
    This is what gets POSTed to: POST /api/batteries
    
    Args:
        csv_path: Path to the telemetry CSV file
        image_path: Path to the battery photo (optional — audit works without it)
        seller_id: ID of the seller uploading the battery
    
    Returns:
        A complete Digital Twin dict ready for MongoDB
    """
    now = datetime.now(timezone.utc)
    
    # Generate a unique battery ID using timestamp
    battery_id = f"RVX-{now.strftime('%Y')}-{now.strftime('%m%d%H%M%S')}"
    
    print(f"\n🔋 ReVolt OS — Gemini Battery Audit")
    print(f"=" * 50)
    print(f"Battery ID: {battery_id}")
    
    # --- Step 1: Parse CSV stats locally ---
    print(f"\n[1/4] Parsing telemetry stats...")
    csv_stats = parse_csv_stats(csv_path)
    print(f"  {csv_stats['data_points_count']} data points, {csv_stats['cycle_count']} cycles")
    print(f"  Voltage: {csv_stats['voltage_min']}V - {csv_stats['voltage_max']}V")
    print(f"  Temp: {csv_stats['temp_min_c']}°C - {csv_stats['temp_max_c']}°C")
    
    # --- Step 2: Gemini telemetry analysis ---
    print(f"\n[2/4] Running Gemini telemetry audit...")
    audit_result = run_audit(csv_path, csv_stats)
    print(f"  Health grade: {audit_result.get('health_grade', '?')}")
    print(f"  Safety risks: {len(audit_result.get('safety_risks', []))}")
    
    # --- Step 3: Gemini photo analysis (if provided) ---
    manufacturer_data = {
        "name": "Unknown",
        "model": "Unknown",
        "chemistry": "Unknown",
    }
    photo_risks = []
    physical_condition = "Unknown — no photo provided"
    
    if image_path and Path(image_path).exists():
        print(f"\n[3/4] Analyzing battery photo with Gemini Vision...")
        image_result = analyze_image(image_path)
        
        # Extract manufacturer info from photo
        if "manufacturer" in image_result:
            mfg = image_result["manufacturer"]
            manufacturer_data = {
                "name": mfg.get("name", "Unknown"),
                "model": mfg.get("model", "Unknown"),
                "chemistry": mfg.get("chemistry", "Unknown"),
                "nominal_voltage": float(mfg.get("nominal_voltage", 0)),
                "nominal_capacity_kwh": float(mfg.get("nominal_capacity_kwh", 0)),
                "manufacture_date": mfg.get("manufacture_date", "Unknown"),
            }
        
        physical_condition = image_result.get("physical_condition", "Unknown")
        photo_risks = image_result.get("safety_concerns_from_photo", [])
        
        print(f"  Manufacturer: {manufacturer_data['name']}")
        print(f"  Condition: {physical_condition}")
        print(f"  Photo risks: {len(photo_risks)}")
    else:
        print(f"\n[3/4] No photo provided — skipping vision analysis")
    
    # --- Step 4: Generate embedding ---
    print(f"\n[4/4] Generating telemetry embedding...")
    embedding = generate_telemetry_embedding(csv_path)
    
    # --- Combine everything into the Digital Twin ---
    # This structure matches Sprint 1's MongoDB schema EXACTLY
    
    # Merge safety risks from CSV audit + photo analysis
    all_risks = audit_result.get("safety_risks", []) + photo_risks
    
    # Update physical_condition in health_details from photo
    health_details = audit_result.get("health_details", {})
    health_details["physical_condition"] = physical_condition
    health_details["audit_timestamp"] = now.isoformat()
    
    # Build the listing from Gemini's output
    listing_data = audit_result.get("listing", {})
    
    digital_twin = {
        # Identity
        "battery_id": battery_id,
        "status": "Under Review",
        
        # Manufacturer (from photo analysis)
        "manufacturer": manufacturer_data,
        
        # Health (from telemetry analysis)
        "health_grade": audit_result.get("health_grade", "Pending"),
        "health_details": health_details,
        
        # Telemetry summary (from local CSV parsing)
        "telemetry_summary": {
            "voltage_min": csv_stats["voltage_min"],
            "voltage_max": csv_stats["voltage_max"],
            "voltage_mean": csv_stats["voltage_mean"],
            "temp_min_c": csv_stats["temp_min_c"],
            "temp_max_c": csv_stats["temp_max_c"],
            "temp_mean_c": csv_stats["temp_mean_c"],
            "capacity_fade_pct": round(100 - csv_stats.get("soc_end", 0), 1),
            "data_points_count": csv_stats["data_points_count"],
            "discharge_curve_shape": "Unknown",  # Could be computed from voltage curve
        },
        
        # Vector embedding (from Gemini embedding model)
        "behavior_embedding": embedding,
        
        # Marketplace listing (from Gemini)
        "listing": {
            "title": listing_data.get("title", f"Used Battery Pack — Grade {audit_result.get('health_grade', '?')}"),
            "description": listing_data.get("description", "Awaiting full listing generation."),
            "asking_price_usd": 0.0,  # Seller sets this later
            "seller_id": seller_id,
            "listed_at": now.isoformat(),
            "photo_urls": [image_path] if image_path else [],
        },
        
        # Safety risks (merged from CSV + photo analysis)
        "safety_risks": all_risks,
        
        # Safety workflow (initialized as Not Started)
        "safety_workflow": {
            "current_state": "Not Started",
            "technician_id": None,
            "target_config": audit_result.get("recommended_config"),
            "started_at": None,
            "completed_at": None,
            "compliance_log": [],
        },
        
        # Full audit manifest (the "Battery Passport")
        "audit_manifest": {
            "version": "1.0",
            "generated_by": f"Gemini ({GEMINI_MODEL})",
            "passport_id": battery_id,
            "grade": audit_result.get("health_grade", "Pending"),
            "recommended_use": [audit_result.get("recommended_config", "Pending evaluation")],
            "warnings": [r.get("description", "") for r in all_risks if r.get("severity") in ("High", "Critical")],
            "eu_compliant": audit_result.get("eu_compliant", False),
            "audit_timestamp": now.isoformat(),
        },
        
        # Metadata
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }
    
    # --- Print summary ---
    print(f"\n{'=' * 50}")
    print(f"✓ Digital Twin built for {battery_id}")
    print(f"  Grade: {digital_twin['health_grade']}")
    print(f"  Manufacturer: {manufacturer_data['name']} {manufacturer_data['model']}")
    print(f"  SOH: {health_details.get('state_of_health_pct', '?')}%")
    print(f"  Safety risks: {len(all_risks)}")
    print(f"  Embedding: {len(embedding)} dimensions")
    print(f"  Config: {audit_result.get('recommended_config', 'N/A')}")
    
    return digital_twin


def save_manifest(digital_twin: dict, output_path: str = "manifest.json"):
    """Save the Digital Twin to a local JSON file."""
    with open(output_path, "w") as f:
        json.dump(digital_twin, f, indent=2, default=str)
    print(f"\n💾 Manifest saved to {output_path}")


def push_to_api(digital_twin: dict):
    """
    POST the Digital Twin to the Sprint 1 API.
    
    This is how Person 2's output gets into MongoDB —
    the API handles validation and storage.
    """
    url = f"{API_BASE_URL}/api/batteries"
    
    try:
        response = requests.post(url, json=digital_twin)
        if response.status_code in (200, 201):
            result = response.json()
            print(f"\n📡 Pushed to API: {result.get('action', 'done')} — {result.get('battery_id')}")
        else:
            print(f"\n⚠ API error {response.status_code}: {response.text}")
    except requests.ConnectionError:
        print(f"\n⚠ Could not connect to API at {API_BASE_URL}")
        print(f"  Is the Flask server running? (python 03_api_endpoints.py)")


# ============================================
# MAIN — Run the audit!
# ============================================
if __name__ == "__main__":
    # Parse command line arguments
    # Usage: python audit.py <csv_path> [image_path]
    
    if len(sys.argv) < 2:
        print("Usage: python audit.py <csv_path> [image_path]")
        print("  csv_path:   Path to the telemetry CSV file (required)")
        print("  image_path: Path to the battery photo (optional)")
        print()
        print("Example:")
        print("  python audit.py sample_telemetry.csv battery_photo.jpg")
        print("  python audit.py sample_telemetry.csv  # CSV only, no photo")
        sys.exit(1)
    
    csv_path = sys.argv[1]
    image_path = sys.argv[2] if len(sys.argv) > 2 else None
    
    # Validate files exist
    if not Path(csv_path).exists():
        print(f"Error: CSV file not found: {csv_path}")
        sys.exit(1)
    
    if image_path and not Path(image_path).exists():
        print(f"Warning: Image file not found: {image_path}")
        print(f"  Proceeding with CSV-only audit...")
        image_path = None
    
    # Run the audit
    digital_twin = build_digital_twin(csv_path, image_path)
    
    # Save locally
    save_manifest(digital_twin)
    
    # Try to push to the API
    push_to_api(digital_twin)
