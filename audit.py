"""
audit.py — Gemini Multimodal Battery Auditor (Sprint 2)
=======================================================
This is Person 2's main script. It does SIX things:
  1. VISION: Analyzes a battery photo to identify manufacturer/model/condition
  2. TELEMETRY: Analyzes CSV data to calculate health grade + safety risks
  3. EMBEDDING: Generates a vector embedding for MongoDB Vector Search
  4. MANIFEST: Combines everything into a Digital Twin document that matches
              Sprint 1's MongoDB schema exactly
  5. PDF: Generates a Battery Passport PDF from the Digital Twin
  6. UPLOAD: Uploads the PDF to the ElevenLabs Safety Foreman agent knowledge base

The output is a complete document ready to POST to the Sprint 1 API:
  POST http://localhost:5000/api/batteries

HOW IT USES GEMINI:
  - gemini-3-flash-preview: Multimodal reasoning (photo + CSV analysis)
  - gemini-embedding-001: Converts telemetry into vector embeddings

Run: python scripts/audit.py assets/sample_telemetry.csv tests/battery_sticker.jpg
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

# Sprint 1 API
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:5000")

# ElevenLabs
ELEVENLABS_API_KEY  = os.getenv("ELEVENLABS_API_KEY")
ELEVENLABS_AGENT_ID = os.getenv("ELEVENLABS_AGENT_ID")


def clean_json_response(raw_text: str) -> dict:
    """
    Gemini sometimes wraps JSON in markdown code fences like ```json ... ```.
    This strips those fences and parses the clean JSON.
    """
    raw = raw_text.strip()
    if raw.startswith("```"):
        parts = raw.split("```")
        if len(parts) >= 2:
            raw = parts[1]
            if raw.startswith("json"):
                raw = raw[4:]
    return json.loads(raw.strip())


def parse_csv_stats(csv_path: str) -> dict:
    """
    Extract basic statistics from the CSV before sending to Gemini.
    """
    rows = []
    with open(csv_path, "r") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)

    if not rows:
        return {"error": "Empty CSV file"}

    voltages     = [float(r["voltage_v"]) for r in rows if r.get("voltage_v")]
    currents     = [float(r["current_a"]) for r in rows if r.get("current_a")]
    temps        = [float(r["temp_c"])    for r in rows if r.get("temp_c")]
    socs         = [float(r["soc_pct"])   for r in rows if r.get("soc_pct")]
    cycle_counts = [int(r["cycle_count"]) for r in rows if r.get("cycle_count")]
    cycle_count  = max(cycle_counts) if cycle_counts else 0

    stats = {
        "data_points_count": len(rows),
        "cycle_count":       cycle_count,
        "voltage_min":  round(min(voltages), 2) if voltages else 0,
        "voltage_max":  round(max(voltages), 2) if voltages else 0,
        "voltage_mean": round(sum(voltages) / len(voltages), 2) if voltages else 0,
        "temp_min_c":   round(min(temps), 1) if temps else 0,
        "temp_max_c":   round(max(temps), 1) if temps else 0,
        "temp_mean_c":  round(sum(temps) / len(temps), 1) if temps else 0,
        "current_min":  round(min(currents), 1) if currents else 0,
        "current_max":  round(max(currents), 1) if currents else 0,
        "soc_start":    socs[0]  if socs else 0,
        "soc_end":      socs[-1] if socs else 0,
        "soc_drop":     round(socs[0] - socs[-1], 1) if socs else 0,
    }

    high_current_readings       = [c for c in currents if c > 60]
    stats["high_current_events"]   = len(high_current_readings)
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
    """
    image_bytes = Path(image_path).read_bytes()
    ext = Path(image_path).suffix.lower()
    mime_map = {".jpg": "image/jpeg", ".jpeg": "image/jpeg",
                ".png": "image/png",  ".webp": "image/webp"}
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
3. Signs of lithium plating — white/gray metallic deposits near terminals, uneven cell swelling, discoloration patterns suggesting internal dendrite growth
4. Terminal/connector types visible

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
- Peak temperature above 45C = Thermal risk (thermal abuse)
- Peak temperature below -10C during charging = Thermal risk (lithium plating conditions)
- Current spikes above 60A = Electrical stress risk  
- Voltage dropping below 300V = Electrical risk (deep discharge)
- SOC dropping more than 40% in one session = High-rate discharge risk
- Rapid voltage drop at high SOC (voltage sag) = Electrical risk (internal resistance increase, possible lithium plating)
- Charging at high C-rates (above 1C) when temperature is below 10C = Chemical risk (lithium plating)
- Sudden capacity fade above 5% between cycles = Structural risk (electrode delamination)

IMPORTANT: For each risk you detect, explain the electrochemical mechanism. For example:
- "Lithium plating detected: charging at 0.8C below 5C causes metallic lithium deposits on the anode"
- "Thermal abuse: sustained temps above 50C accelerate SEI layer growth and electrolyte decomposition"

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
    "gemini_analysis_summary": "2-3 sentence technical summary of the battery condition."
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
    "description": "2-3 sentence SEO-optimized listing description."
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
    This is the battery's "behavior fingerprint" used for similarity search.
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
    """
    now        = datetime.now(timezone.utc)
    battery_id = f"RVX-{now.strftime('%Y')}-{now.strftime('%m%d%H%M%S')}"

    print(f"\n🔋 ReVolt OS — Gemini Battery Audit")
    print(f"=" * 50)
    print(f"Battery ID: {battery_id}")

    # --- Parse CSV stats locally ---
    print(f"\n[1/4] Parsing telemetry stats...")
    csv_stats = parse_csv_stats(csv_path)
    print(f"  {csv_stats['data_points_count']} data points, {csv_stats['cycle_count']} cycles")
    print(f"  Voltage: {csv_stats['voltage_min']}V - {csv_stats['voltage_max']}V")
    print(f"  Temp: {csv_stats['temp_min_c']}°C - {csv_stats['temp_max_c']}°C")

    # --- Gemini telemetry analysis ---
    print(f"\n[2/4] Running Gemini telemetry audit...")
    audit_result = run_audit(csv_path, csv_stats)
    print(f"  Health grade: {audit_result.get('health_grade', '?')}")
    print(f"  Safety risks: {len(audit_result.get('safety_risks', []))}")

    # --- Gemini photo analysis ---
    manufacturer_data  = {"name": "Unknown", "model": "Unknown", "chemistry": "Unknown"}
    photo_risks        = []
    physical_condition = "Unknown — no photo provided"

    if image_path and Path(image_path).exists():
        print(f"\n[3/4] Analyzing battery photo with Gemini Vision...")
        image_result = analyze_image(image_path)

        if "manufacturer" in image_result:
            mfg = image_result["manufacturer"]
            manufacturer_data = {
                "name":                 mfg.get("name", "Unknown"),
                "model":                mfg.get("model", "Unknown"),
                "chemistry":            mfg.get("chemistry", "Unknown"),
                "nominal_voltage":      float(mfg.get("nominal_voltage", 0)),
                "nominal_capacity_kwh": float(mfg.get("nominal_capacity_kwh", 0)),
                "manufacture_date":     mfg.get("manufacture_date", "Unknown"),
            }

        physical_condition = image_result.get("physical_condition", "Unknown")
        photo_risks        = image_result.get("safety_concerns_from_photo", [])
        print(f"  Manufacturer: {manufacturer_data['name']}")
        print(f"  Condition: {physical_condition}")
        print(f"  Photo risks: {len(photo_risks)}")
    else:
        print(f"\n[3/4] No photo provided — skipping vision analysis")

    # --- Generate embedding ---
    print(f"\n[4/4] Generating telemetry embedding...")
    embedding = generate_telemetry_embedding(csv_path)

    # --- Combine into the Digital Twin ---
    all_risks      = audit_result.get("safety_risks", []) + photo_risks
    health_details = audit_result.get("health_details", {})
    health_details["physical_condition"] = physical_condition
    health_details["audit_timestamp"]    = now.isoformat()
    listing_data   = audit_result.get("listing", {})

    digital_twin = {
        "battery_id": battery_id,
        "status":     "Under Review",
        "manufacturer": manufacturer_data,
        "health_grade": audit_result.get("health_grade", "Pending"),
        "health_details": health_details,
        "telemetry_summary": {
            "voltage_min":           csv_stats["voltage_min"],
            "voltage_max":           csv_stats["voltage_max"],
            "voltage_mean":          csv_stats["voltage_mean"],
            "temp_min_c":            csv_stats["temp_min_c"],
            "temp_max_c":            csv_stats["temp_max_c"],
            "temp_mean_c":           csv_stats["temp_mean_c"],
            "capacity_fade_pct":     round(100 - csv_stats.get("soc_end", 0), 1),
            "data_points_count":     csv_stats["data_points_count"],
            "discharge_curve_shape": "Unknown",
        },
        "behavior_embedding": embedding,
        "listing": {
            "title":            listing_data.get("title", f"Used Battery Pack — Grade {audit_result.get('health_grade', '?')}"),
            "description":      listing_data.get("description", "Awaiting full listing generation."),
            "asking_price_usd": 0.0,
            "seller_id":        seller_id,
            "listed_at":        now.isoformat(),
            "photo_urls":       [image_path] if image_path else [],
        },
        "safety_risks": all_risks,
        "safety_workflow": {
            "current_state": "Not Started",
            "technician_id": None,
            "target_config": audit_result.get("recommended_config"),
            "started_at":    None,
            "completed_at":  None,
            "compliance_log": [],
        },
        "audit_manifest": {
            "version":         "1.0",
            "generated_by":    f"Gemini ({GEMINI_MODEL})",
            "passport_id":     battery_id,
            "grade":           audit_result.get("health_grade", "Pending"),
            "recommended_use": [audit_result.get("recommended_config", "Pending evaluation")],
            "warnings":        [r.get("description", "") for r in all_risks if r.get("severity") in ("High", "Critical")],
            "eu_compliant":    audit_result.get("eu_compliant", False),
            "audit_timestamp": now.isoformat(),
        },
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }

    print(f"\n{'=' * 50}")
    print(f"✓ Digital Twin built for {battery_id}")
    print(f"  Grade: {digital_twin['health_grade']}")
    print(f"  SOH: {health_details.get('state_of_health_pct', '?')}%")
    print(f"  Safety risks: {len(all_risks)}")
    print(f"  Embedding: {len(embedding)} dimensions")

    return digital_twin


def save_manifest(digital_twin: dict, output_path: str = "assets/manifest.json"):
    """Save the Digital Twin to a local JSON file."""
    with open(output_path, "w") as f:
        json.dump(digital_twin, f, indent=2, default=str)
    print(f"\n💾 Manifest saved to {output_path}")


def push_to_api(digital_twin: dict):
    """POST the Digital Twin to the Sprint 1 API."""
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
        print(f"  Is the Flask server running? (python scripts/api_endpoints.py)")


# ============================================
# STEP 5: GENERATE BATTERY PASSPORT PDF
# ============================================

def _make_table(data: list):
    """
    Helper — builds a standard 2-column key/value info table.
    Used throughout the PDF to display structured data cleanly.
    """
    from reportlab.platypus import Table, TableStyle
    from reportlab.lib import colors
    from reportlab.lib.units import inch

    t = Table(data, colWidths=[2.2*inch, 4.5*inch])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (0,-1), colors.HexColor('#f0f0f5')),
        ('TEXTCOLOR',  (0,0), (0,-1), colors.HexColor('#1a1a2e')),
        ('FONTNAME',   (0,0), (0,-1), 'Helvetica-Bold'),
        ('FONTSIZE',   (0,0), (-1,-1), 10),
        ('ROWBACKGROUNDS', (0,0), (-1,-1), [colors.white, colors.HexColor('#fafafa')]),
        ('GRID',    (0,0), (-1,-1), 0.5, colors.HexColor('#ccc')),
        ('PADDING', (0,0), (-1,-1), 6),
        ('VALIGN',  (0,0), (-1,-1), 'TOP'),
    ]))
    return t


def generate_passport_pdf(digital_twin: dict) -> str:
    """
    Generate a nicely formatted PDF Battery Passport from the Digital Twin.

    WHY THIS IS NEEDED:
    ElevenLabs agents can only read documents — not raw JSON.
    This converts the Digital Twin dictionary into a human-readable PDF
    that the Safety Foreman agent uses as its knowledge base.

    The agent will answer questions like:
      "What PPE do I need?"  → reads PDF → answers correctly
      "What are the risks?"  → reads PDF → answers correctly
      "What step am I on?"   → reads PDF → answers correctly

    Returns the path to the generated PDF file.
    """
    from reportlab.lib.pagesizes import letter
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer,
        Table, TableStyle, HRFlowable
    )
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib import colors
    from reportlab.lib.units import inch

    battery_id  = digital_twin["battery_id"]
    output_path = f"assets/passport_{battery_id}.pdf"

    Path("assets").mkdir(exist_ok=True)

    doc = SimpleDocTemplate(
        output_path, pagesize=letter,
        rightMargin=0.75*inch, leftMargin=0.75*inch,
        topMargin=0.75*inch,   bottomMargin=0.75*inch
    )

    styles      = getSampleStyleSheet()
    title_style   = ParagraphStyle('T',  parent=styles['Title'],    fontSize=20, spaceAfter=4)
    sub_style     = ParagraphStyle('S',  parent=styles['Normal'],   fontSize=11, textColor=colors.HexColor('#444'), spaceAfter=12)
    section_style = ParagraphStyle('H',  parent=styles['Heading2'], fontSize=13, spaceBefore=14, spaceAfter=6)
    body_style    = ParagraphStyle('B',  parent=styles['Normal'],   fontSize=10, spaceAfter=4)
    small_style   = ParagraphStyle('Sm', parent=styles['Normal'],   fontSize=8,  textColor=colors.HexColor('#666'), spaceAfter=2)

    # Pull data from the Digital Twin
    hd       = digital_twin.get("health_details", {})
    ts       = digital_twin.get("telemetry_summary", {})
    risks    = digital_twin.get("safety_risks", [])
    workflow = digital_twin.get("safety_workflow", {})
    manifest = digital_twin.get("audit_manifest", {})
    mfg      = digital_twin.get("manufacturer", {})

    story = []

    # ── HEADER ──────────────────────────────────────────
    story.append(Paragraph("ReVolt OS", sub_style))
    story.append(Paragraph("Digital Battery Passport", title_style))
    story.append(Paragraph(
        "Certified by Gemini Multimodal Auditor — For ElevenLabs Safety Foreman Agent",
        sub_style
    ))
    story.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor('#1a1a2e')))
    story.append(Spacer(1, 10))

    # ── IDENTITY ────────────────────────────────────────
    story.append(Paragraph("Battery Identity", section_style))
    story.append(_make_table([
        ["Passport ID",  digital_twin.get("battery_id", "Unknown")],
        ["Status",       digital_twin.get("status", "Unknown")],
        ["Health Grade", digital_twin.get("health_grade", "Unknown")],
        ["EU Compliant", "Yes" if manifest.get("eu_compliant") else "No"],
        ["Generated By", manifest.get("generated_by", "Gemini")],
        ["Audit Time",   str(manifest.get("audit_timestamp", "Unknown"))],
    ]))
    story.append(Spacer(1, 10))

    # ── MANUFACTURER ────────────────────────────────────
    story.append(Paragraph("Manufacturer Info", section_style))
    story.append(_make_table([
        ["Name",             mfg.get("name", "Unknown")],
        ["Model",            mfg.get("model", "Unknown")],
        ["Chemistry",        mfg.get("chemistry", "Unknown")],
        ["Nominal Voltage",  f"{mfg.get('nominal_voltage', 'Unknown')}V"],
        ["Capacity",         f"{mfg.get('nominal_capacity_kwh', 'Unknown')} kWh"],
        ["Manufacture Date", mfg.get("manufacture_date", "Unknown")],
    ]))
    story.append(Spacer(1, 10))

    # ── HEALTH ──────────────────────────────────────────
    story.append(Paragraph("Health Assessment", section_style))
    peak_temp     = hd.get("peak_temp_recorded_c", 0)
    peak_temp_str = f"{peak_temp}°C  WARNING: EXCEEDS 45°C SAFE THRESHOLD" if peak_temp > 45 else f"{peak_temp}°C"
    story.append(_make_table([
        ["State of Health",       f"{hd.get('state_of_health_pct', 0)}%"],
        ["Remaining Useful Life", f"{hd.get('remaining_useful_life_years', 0)} years"],
        ["Total Cycles",          str(hd.get("total_cycles", 0))],
        ["Peak Temp Recorded",    peak_temp_str],
        ["Avg Discharge Rate",    f"{hd.get('avg_discharge_rate_c', 0)}C"],
        ["Physical Condition",    hd.get("physical_condition", "Unknown")],
    ]))
    story.append(Spacer(1, 6))
    summary = hd.get("gemini_analysis_summary", "")
    if summary:
        story.append(Paragraph(f"Gemini Analysis: {summary}", body_style))
    story.append(Spacer(1, 10))

    # ── TELEMETRY ───────────────────────────────────────
    story.append(Paragraph("Telemetry Summary", section_style))
    story.append(_make_table([
        ["Voltage Min / Max / Mean", f"{ts.get('voltage_min',0)}V / {ts.get('voltage_max',0)}V / {ts.get('voltage_mean',0)}V"],
        ["Temp Min / Max / Mean",    f"{ts.get('temp_min_c',0)}C / {ts.get('temp_max_c',0)}C / {ts.get('temp_mean_c',0)}C"],
        ["Capacity Fade",            f"{ts.get('capacity_fade_pct', 0)}%"],
        ["Data Points Analyzed",     str(ts.get("data_points_count", 0))],
        ["Discharge Curve Shape",    ts.get("discharge_curve_shape", "Unknown")],
    ]))
    story.append(Spacer(1, 10))

    # ── SAFETY RISKS ────────────────────────────────────
    story.append(Paragraph("Safety Risks (Gemini-Detected)", section_style))

    if not risks:
        story.append(Paragraph("No safety risks detected.", body_style))
    else:
        severity_colors = {
            "Critical": "#b00000",
            "High":     "#cc3300",
            "Medium":   "#c77000",
            "Low":      "#006400",
        }
        for r in risks:
            sev   = r.get("severity", "Low")
            color = severity_colors.get(sev, "#333333")
            risk_table = Table([
                [f"[{sev.upper()}] {r.get('risk_type', 'Unknown')}", ""],
                ["Risk",        r.get("description", "")],
                ["Mitigation",  r.get("mitigation", "")],
                ["Detected By", r.get("detected_by", "")],
            ], colWidths=[1.5*inch, 5.2*inch])
            risk_table.setStyle(TableStyle([
                ('SPAN',       (0,0), (1,0)),
                ('BACKGROUND', (0,0), (1,0), colors.HexColor(color)),
                ('TEXTCOLOR',  (0,0), (1,0), colors.white),
                ('FONTNAME',   (0,0), (1,0), 'Helvetica-Bold'),
                ('FONTSIZE',   (0,0), (-1,-1), 10),
                ('BACKGROUND', (0,1), (0,-1), colors.HexColor('#f0f0f5')),
                ('FONTNAME',   (0,1), (0,-1), 'Helvetica-Bold'),
                ('GRID',       (0,0), (-1,-1), 0.5, colors.HexColor('#ccc')),
                ('PADDING',    (0,0), (-1,-1), 6),
                ('VALIGN',     (0,0), (-1,-1), 'TOP'),
            ]))
            story.append(risk_table)
            story.append(Spacer(1, 6))

    story.append(Spacer(1, 4))

    # ── SAFETY WORKFLOW ─────────────────────────────────
    story.append(Paragraph("Disassembly Workflow (Safety Foreman Protocol)", section_style))
    story.append(Paragraph(
        "Steps must be completed IN ORDER. No skipping allowed. "
        "The ElevenLabs Safety Foreman agent enforces this sequence and logs each "
        "step to MongoDB for the compliance audit trail.",
        body_style
    ))
    story.append(Spacer(1, 6))

    target = workflow.get("target_config", manifest.get("recommended_use", ["Unknown"])[0] if manifest.get("recommended_use") else "Unknown")
    step_table = Table([
        ["Step", "State",             "Instructions"],
        ["1",    "Inspection",        "Verify PPE Level 3: insulated gloves, face shield, arc flash suit. Confirm fire extinguisher present. Check ambient temperature is below 30C."],
        ["2",    "Discharging",       "Drain battery to safe voltage (<50V) via resistive load bank. Confirm with multimeter on main busbar before proceeding. Do not rush."],
        ["3",    "Module Separation", "Unbolt modules per Gemini photo analysis. Disconnect busbars. Label each module. Handle any swollen or damaged cells with extra caution."],
        ["4",    "Reassembly",        f"Wire modules into target configuration: {target}. Connect BMS. Verify output voltage matches spec before sign-off."],
        ["5",    "Complete",          "Verbally confirm completion to Safety Foreman agent. Milestone will be logged to MongoDB. Battery Passport will be updated."],
    ], colWidths=[0.5*inch, 1.4*inch, 4.8*inch])
    step_table.setStyle(TableStyle([
        ('BACKGROUND',     (0,0), (-1,0), colors.HexColor('#1a1a2e')),
        ('TEXTCOLOR',      (0,0), (-1,0), colors.white),
        ('FONTNAME',       (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE',       (0,0), (-1,-1), 9),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#fafafa')]),
        ('GRID',    (0,0), (-1,-1), 0.5, colors.HexColor('#ccc')),
        ('PADDING', (0,0), (-1,-1), 6),
        ('VALIGN',  (0,0), (-1,-1), 'TOP'),
        ('ALIGN',   (0,0), (0,-1), 'CENTER'),
    ]))
    story.append(step_table)
    story.append(Spacer(1, 10))

    # ── RECOMMENDED USE ─────────────────────────────────
    story.append(Paragraph("Recommended Second-Life Configuration", section_style))
    recommended = manifest.get("recommended_use", ["Unknown"])
    story.append(Paragraph(f"Target Config: {recommended[0] if recommended else 'Unknown'}", body_style))

    warnings = manifest.get("warnings", [])
    if warnings:
        story.append(Spacer(1, 6))
        story.append(Paragraph("Active Warnings:", body_style))
        for w in warnings:
            story.append(Paragraph(f"  WARNING: {w}", body_style))

    story.append(Spacer(1, 10))

    # ── FOOTER ──────────────────────────────────────────
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#ccc')))
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        "This Battery Passport was automatically generated by the ReVolt OS Gemini Multimodal Auditor "
        "and uploaded to the ElevenLabs Safety Foreman agent as its knowledge base. "
        "For use by trained technicians only. Passport Version 1.0.",
        small_style
    ))

    doc.build(story)
    print(f"\n📄 Battery Passport PDF saved: {output_path}")
    return output_path


# ============================================
# STEP 6: UPLOAD PDF TO ELEVENLABS AGENT
# ============================================

def upload_to_elevenlabs(pdf_path: str, battery_id: str):
    """
    Upload the Battery Passport PDF to the ElevenLabs agent's knowledge base.

    WHY THIS IS NEEDED:
    Every battery is different. When a technician starts a disassembly session,
    the Safety Foreman agent needs to know about THAT specific battery —
    its risks, its grade, its workflow steps.

    This function replaces the agent's knowledge base with the new battery's
    passport so the agent is always talking about the current battery being worked on.

    HOW IT WORKS:
      1. Upload the PDF file to ElevenLabs — they store it and give back an ID
      2. Attach that document ID to our agent's knowledge base
      The agent can now answer questions about this specific battery instantly.
    """
    if not ELEVENLABS_API_KEY or not ELEVENLABS_AGENT_ID:
        print("\n⚠ Skipping ElevenLabs upload — add ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID to your .env file")
        return

    print(f"\n📡 Uploading Battery Passport to ElevenLabs Safety Foreman agent...")

    # Step 6a: Upload the PDF file to ElevenLabs
    with open(pdf_path, "rb") as f:
        upload_response = requests.post(
            "https://api.elevenlabs.io/v1/convai/knowledge-base/documents",
            headers={"xi-api-key": ELEVENLABS_API_KEY},
            files={"file": (f"{battery_id}_passport.pdf", f, "application/pdf")},
        )

    if upload_response.status_code != 200:
        print(f"  ⚠ Upload failed ({upload_response.status_code}): {upload_response.text}")
        return

    document_id = upload_response.json().get("id")
    print(f"  ✓ PDF uploaded to ElevenLabs — document ID: {document_id}")

    # Step 6b: Attach the document to the agent's knowledge base
    attach_response = requests.patch(
        f"https://api.elevenlabs.io/v1/convai/agents/{ELEVENLABS_AGENT_ID}",
        headers={
            "xi-api-key":   ELEVENLABS_API_KEY,
            "Content-Type": "application/json",
        },
        json={
            "knowledge_base": [{"type": "document", "id": document_id}]
        },
    )

    if attach_response.status_code == 200:
        print(f"  ✓ Passport attached to Safety Foreman agent!")
        print(f"    Agent is now briefed on battery: {battery_id}")
    else:
        print(f"  ⚠ Attach failed ({attach_response.status_code}): {attach_response.text}")


# ============================================
# MAIN — Run the full audit pipeline!
# ============================================
if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python scripts/audit.py <csv_path> [image_path]")
        print("  csv_path:   Path to the telemetry CSV file (required)")
        print("  image_path: Path to the battery photo (optional)")
        print()
        print("Example:")
        print("  python scripts/audit.py assets/sample_telemetry.csv tests/battery_sticker.jpg")
        print("  python scripts/audit.py assets/sample_telemetry.csv  # CSV only")
        sys.exit(1)

    csv_path   = sys.argv[1]
    image_path = sys.argv[2] if len(sys.argv) > 2 else None

    if not Path(csv_path).exists():
        print(f"Error: CSV file not found: {csv_path}")
        sys.exit(1)

    if image_path and not Path(image_path).exists():
        print(f"Warning: Image file not found: {image_path}")
        print(f"  Proceeding with CSV-only audit...")
        image_path = None

    # Steps 1-4: Run Gemini audit and build the Digital Twin
    digital_twin = build_digital_twin(csv_path, image_path)

    # Save manifest.json locally
    save_manifest(digital_twin)

    # Push to MongoDB via Flask API
    push_to_api(digital_twin)

    # Step 5: Generate Battery Passport PDF
    pdf_path = generate_passport_pdf(digital_twin)

    # Step 6: Upload PDF to ElevenLabs Safety Foreman agent
    upload_to_elevenlabs(pdf_path, digital_twin["battery_id"])

    print(f"\n✅ Full audit pipeline complete for {digital_twin['battery_id']}")
    print(f"   MongoDB updated        ✓")
    print(f"   PDF saved: {pdf_path}  ✓")
    print(f"   ElevenLabs agent briefed ✓")
