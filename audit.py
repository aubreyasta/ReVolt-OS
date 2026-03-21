from google import genai
from dotenv import load_dotenv
import os
import json
from pathlib import Path

load_dotenv()

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

def analyze_image(image_path: str) -> dict:
    image_bytes = Path(image_path).read_bytes()
    
    response = client.models.generate_content(
        model="gemini-3-flash-preview",
        contents=[
            {
                "parts": [
                    {
                        "inline_data": {
                            "mime_type": "image/jpeg",
                            "data": __import__("base64").b64encode(image_bytes).decode()
                        }
                    },
                    {
                        "text": """You are a battery identification AI for ReVolt OS.
Analyze this battery sticker image and return ONLY valid JSON, no explanation.

Return this exact structure:
{
  "manufacturer": "Tesla",
  "model": "Model 3 LR",
  "chemistry": "NMC",
  "rated_capacity_kwh": 75,
  "nominal_voltage_v": 350,
  "manufacture_year": 2020,
  "serial_number": "unknown"
}

If you cannot read a field clearly from the image, use "unknown" for strings and 0 for numbers.
Extract whatever text you can see and map it to the closest matching field."""
                    }
                ]
            }
        ]
    )
    
    raw = response.text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    
    return json.loads(raw.strip())


def run_audit(csv_path: str) -> dict:
    with open(csv_path, "r") as f:
        csv_data = f.read()

    prompt = f"""
You are a battery engineering AI for ReVolt OS, a platform that certifies used EV batteries for SMEs.

Analyze this battery telemetry CSV and return a JSON manifest. Return ONLY valid JSON, no explanation.

CSV DATA:
{csv_data}

Return this exact JSON structure:
{{
  "passport_id": "RV-2026-001",
  "audit_timestamp": "2026-03-21T00:00:00Z",
  "health_grade": "B",
  "state_of_health_pct": 82,
  "remaining_useful_life_years": 4.2,
  "cycle_count": 412,
  "peak_temp_recorded_c": 54.1,
  "fast_charge_ratio_pct": 68,
  "thermal_stress_flag": true,
  "recommended_config": "4S2P - bypass cell block C",
  "risk_summary": "High fast-charge ratio detected. Thermal stress in upper cycles.",
  "eu_compliant": true,
  "status": "listed"
}}

Base all values on the actual CSV data provided. Adjust health_grade (A/B/C/D/F) based on:
- A: SOH above 90%, low thermal stress, slow charging dominant
- B: SOH 80-90%, moderate stress
- C: SOH 70-80%, high fast-charge ratio
- D/F: SOH below 70% or dangerous thermal events
"""

    response = client.models.generate_content(
        model="gemini-3-flash-preview",
        contents=prompt
    )

    raw = response.text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    
    return json.loads(raw.strip())


def build_full_manifest(csv_path: str, image_path: str) -> dict:
    print("Running telemetry audit...")
    telemetry = run_audit(csv_path)
    
    print("Analyzing battery sticker...")
    image_data = analyze_image(image_path)

    print("Generating telemetry embedding...")
    embedding = generate_telemetry_embedding(csv_path)
    
    full_manifest = {
        **telemetry,
        "battery_id": image_data,
        "telemetry_embedding": embedding
    }
    
    with open("manifest.json", "w") as f:
        json.dump(full_manifest, f, indent=2)
    
    print("Manifest saved to manifest.json")
    print(f"Embedding dimensions: {len(embedding)}")
    return full_manifest

def generate_telemetry_embedding(csv_path: str) -> list:
    with open(csv_path, "r") as f:
        csv_data = f.read()

    response = client.models.embed_content(
        model="gemini-embedding-001",
        contents=csv_data
    )

    return response.embeddings[0].values

if __name__ == "__main__":
    manifest = build_full_manifest("sample_telemetry.csv", "battery_sticker.jpg")
    print(json.dumps(manifest, indent=2))