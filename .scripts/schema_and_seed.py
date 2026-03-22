"""
01_schema_and_seed.py — Battery Digital Twin Schema + Sample Data
================================================================
This is the FIRST script Person 1 runs. It does three things:
  1. Connects to your MongoDB Atlas cluster
  2. Creates the "battery_twins" collection with validation rules
  3. Seeds it with 5 realistic sample batteries so the team can test immediately

WHAT IS A "DIGITAL TWIN"?
  A Digital Twin is a virtual copy of a real-world object. In our case,
  each battery in the real world gets a matching document in MongoDB that
  tracks everything about it: who made it, how healthy it is, its full
  telemetry history, and a vector embedding of its "behavior fingerprint."

WHY VECTOR EMBEDDINGS?
  Normal search: "Find me a Tesla battery" (exact text match)
  Vector search:  "Find me a battery that handles Arizona heat well"
  
  Vector embeddings turn a battery's behavior (discharge curve, temp history)
  into a list of numbers. Batteries with SIMILAR behavior have SIMILAR numbers.
  MongoDB Atlas Vector Search can then find "the most similar batteries" instantly.

Run: python 01_schema_and_seed.py
"""

import os
import json
import numpy as np
import certifi
from datetime import datetime, timezone
from pymongo import MongoClient
from pymongo.errors import CollectionInvalid
from dotenv import load_dotenv

# Load environment variables from .env file
# This keeps your password out of the code (important!)
load_dotenv()

# --- CONFIGURATION ---
MONGODB_URI = os.getenv("MONGODB_URI")
DB_NAME = os.getenv("DB_NAME", "revolt_db")
COLLECTION_NAME = "battery_twins"

# How many numbers in each vector embedding
# 3072 matches the gemini-embedding-001 model output
# so Vector Search works with both fake seed data AND real Gemini embeddings
EMBEDDING_DIMENSIONS = 3072


def get_database():
    """
    Connect to MongoDB Atlas and return the database object.
    
    Think of it like this:
      - MongoClient = the connection to the whole server
      - client[DB_NAME] = picking which database to use (like picking a folder)
      - Then inside the database, we have collections (like files in that folder)
    """
    if not MONGODB_URI:
        raise ValueError(
            "MONGODB_URI not found! Did you create a .env file?\n"
            "It should contain: MONGODB_URI=mongodb+srv://revolt-admin:<password>@..."
        )
    
    client = MongoClient(MONGODB_URI, tlsCAFile=certifi.where())
    
    # Quick test: ping the server to make sure we're connected
    client.admin.command("ping")
    print("✓ Connected to MongoDB Atlas successfully!")
    
    return client[DB_NAME]


def create_collection_with_validation(db):
    """
    Create the battery_twins collection with a JSON Schema validator.
    
    WHY VALIDATION?
    MongoDB is "schemaless" — you CAN throw any JSON into it.
    But for a hackathon demo, validators prove to judges that you've
    thought about data integrity. It's a "wow factor" detail.
    
    This validator says: "Every battery document MUST have these fields
    with these types, or MongoDB will reject the insert."
    """
    
    # This is the JSON Schema that defines what a Battery Digital Twin looks like
    validator = {
        "$jsonSchema": {
            "bsonType": "object",
            "title": "Battery Digital Twin",
            "required": [
                "battery_id",
                "status",
                "manufacturer",
                "health_grade",
                "created_at",
            ],
            "properties": {
                
                # === IDENTITY (Who is this battery?) ===
                "battery_id": {
                    "bsonType": "string",
                    "description": "Unique ID like 'RVX-2024-00042'. This is the 'name tag' for the battery."
                },
                "status": {
                    "bsonType": "string",
                    "enum": ["Pending Audit", "Under Review", "Certified for Repurpose", "Rejected for Recycling", "Disassembly Started", "Upcycle Complete"],
                    "description": "Where in the marketplace lifecycle this battery is."
                },
                
                # === MANUFACTURER INFO (What did the factory say?) ===
                "manufacturer": {
                    "bsonType": "object",
                    "required": ["name", "model", "chemistry"],
                    "properties": {
                        "name": {"bsonType": "string"},          # e.g. "CATL", "LG Energy"
                        "model": {"bsonType": "string"},          # e.g. "NMC811-72Ah"
                        "chemistry": {
                            "bsonType": "string",
                            "enum": ["NMC", "LFP", "NCA", "LMO", "LTO"],  # Common battery chemistries
                        },
                        "nominal_voltage": {"bsonType": "double"},    # Volts (e.g. 3.7)
                        "nominal_capacity_kwh": {"bsonType": "double"},  # Kilowatt-hours (e.g. 75.0)
                        "manufacture_date": {"bsonType": "string"},   # ISO date string
                    }
                },
                
                # === HEALTH ASSESSMENT (What did Gemini say?) ===
                # This section gets filled in by Person 2's Gemini pipeline
                "health_grade": {
                    "bsonType": "string",
                    "enum": ["A+", "A", "B+", "B", "C+", "C", "D", "F", "Pending"],
                    "description": "Gemini-generated health grade from A+ (excellent) to F (recycle only)."
                },
                "health_details": {
                    "bsonType": "object",
                    "properties": {
                        "state_of_health_pct": {"bsonType": "double"},    # 0-100, e.g. 87.5
                        "remaining_useful_life_years": {"bsonType": "double"},
                        "total_cycles": {"bsonType": "int"},              # How many charge/discharge cycles
                        "peak_temp_recorded_c": {"bsonType": "double"},   # Hottest it ever got (Celsius)
                        "avg_discharge_rate_c": {"bsonType": "double"},   # Average C-rate
                        "physical_condition": {"bsonType": "string"},     # "Excellent", "Minor wear", etc.
                        "gemini_analysis_summary": {"bsonType": "string"},# Gemini's written analysis
                        "audit_timestamp": {"bsonType": "date"},
                    }
                },
                
                # === PROVENANCE (Where has this battery been?) ===
                "provenance": {
                    "bsonType": "object",
                    "properties": {
                        "original_vehicle": {"bsonType": "string"},   # e.g. "2021 Tesla Model 3 SR+"
                        "vehicle_vin_hash": {"bsonType": "string"},   # Hashed VIN for privacy
                        "climate_zone": {"bsonType": "string"},       # e.g. "Temperate - Pacific NW"
                        "years_in_service": {"bsonType": "double"},
                        "removal_reason": {"bsonType": "string"},     # "Vehicle totaled", "Upgrade", etc.
                    }
                },
                
                # === TELEMETRY SUMMARY (The numbers from the CSV) ===
                # We DON'T store all 5000 rows here — just the summary stats.
                # The raw CSV stays in object storage; this is the "digest."
                "telemetry_summary": {
                    "bsonType": "object",
                    "properties": {
                        "voltage_min": {"bsonType": "double"},
                        "voltage_max": {"bsonType": "double"},
                        "voltage_mean": {"bsonType": "double"},
                        "temp_min_c": {"bsonType": "double"},
                        "temp_max_c": {"bsonType": "double"},
                        "temp_mean_c": {"bsonType": "double"},
                        "capacity_fade_pct": {"bsonType": "double"},  # How much capacity lost
                        "data_points_count": {"bsonType": "int"},     # How many rows in the CSV
                        "discharge_curve_shape": {"bsonType": "string"},  # "Linear", "Knee", "Plateau"
                    }
                },
                
                # === VECTOR EMBEDDING (The "Behavior Fingerprint") ===
                # This is what makes Vector Search possible!
                # It's a list of 256 floating-point numbers that represent
                # this battery's behavior pattern. Similar batteries → similar vectors.
                "behavior_embedding": {
                    "bsonType": "array",
                    "items": {"bsonType": "double"},
                    "description": "256-dim vector encoding of discharge behavior for similarity search."
                },
                
                # === MARKETPLACE (Listing info for the exchange) ===
                "listing": {
                    "bsonType": "object",
                    "properties": {
                        "title": {"bsonType": "string"},         # Auto-generated by Gemini
                        "description": {"bsonType": "string"},   # SEO-optimized listing text
                        "asking_price_usd": {"bsonType": "double"},
                        "seller_id": {"bsonType": "string"},
                        "listed_at": {"bsonType": "date"},
                        "photo_urls": {
                            "bsonType": "array",
                            "items": {"bsonType": "string"},
                        },
                    }
                },
                
                # === METADATA ===
                "created_at": {"bsonType": "date"},
                "updated_at": {"bsonType": "date"},
                
                # === GEMINI AUDIT MANIFEST (The full JSON output from Person 2) ===
                # This is the "Battery Passport" — the core product!
                "audit_manifest": {
                    "bsonType": "object",
                    "description": "Complete Gemini-generated audit. This IS the Battery Passport."
                },
                
                # === SAFETY WORKFLOW (The "State Machine" from the Whitepaper) ===
                # Tracks the 4-step physical upcycling process:
                #   1. Inspection  — Confirm PPE, environment is safe
                #   2. Discharging — Drain battery to safe voltage (<50V)
                #   3. Module Separation — Unbolt modules per Gemini photo analysis
                #   4. Reassembly  — Wire modules into 48V second-life config
                #
                # WHY A STATE MACHINE?
                # The technician CANNOT skip steps. You can't start unbolting
                # modules before confirming the pack is safely discharged.
                # The ElevenLabs agent (Person 3) enforces this order, and
                # each transition gets logged here for the compliance trail.
                "safety_workflow": {
                    "bsonType": "object",
                    "properties": {
                        "current_state": {
                            "bsonType": "string",
                            "enum": [
                                "Not Started",
                                "Inspection",
                                "Discharging",
                                "Module Separation",
                                "Reassembly",
                                "Complete",
                            ],
                            "description": "Which step of the upcycling process the technician is currently on."
                        },
                        "technician_id": {
                            "bsonType": "string",
                            "description": "ID of the technician performing the upcycle."
                        },
                        "target_config": {
                            "bsonType": "string",
                            "description": "The target configuration, e.g. '4S2P 48V Solar Stack'."
                        },
                        "started_at": {"bsonType": "date"},
                        "completed_at": {"bsonType": ["date", "null"]},
                        
                        # The compliance log — an array of timestamped events.
                        # Every time the voice agent confirms a step is done,
                        # a new entry gets appended here. This creates the
                        # auditable trail that makes the Battery Passport legal.
                        "compliance_log": {
                            "bsonType": "array",
                            "items": {
                                "bsonType": "object",
                                "properties": {
                                    "state": {"bsonType": "string"},
                                    "action": {"bsonType": "string"},
                                    "confirmed_by": {
                                        "bsonType": "string",
                                        "description": "'voice_agent' or 'technician' or 'system'"
                                    },
                                    "timestamp": {"bsonType": "date"},
                                    "notes": {"bsonType": "string"},
                                    "safety_check_passed": {"bsonType": "bool"},
                                }
                            },
                            "description": "Timestamped log of every safety step completed."
                        },
                    }
                },
                
                # === SAFETY RISKS (Gemini-detected hazards) ===
                # Person 2's Gemini pipeline populates this with any dangers
                # it detects from the photo (swelling, corrosion) or CSV (voltage sag).
                # The ElevenLabs agent reads this before starting the workflow.
                "safety_risks": {
                    "bsonType": "array",
                    "items": {
                        "bsonType": "object",
                        "properties": {
                            "risk_type": {
                                "bsonType": "string",
                                "enum": ["Thermal", "Electrical", "Chemical", "Structural", "Unknown"],
                            },
                            "severity": {
                                "bsonType": "string",
                                "enum": ["Low", "Medium", "High", "Critical"],
                            },
                            "description": {"bsonType": "string"},
                            "mitigation": {"bsonType": "string"},
                            "detected_by": {"bsonType": "string"},  # "gemini_vision" or "gemini_csv"
                        }
                    },
                    "description": "Gemini-detected safety risks for this battery."
                },
            }
        }
    }
    
    # Try to create the collection. If it already exists, that's fine.
    try:
        db.create_collection(
            COLLECTION_NAME,
            validator=validator,
            validationLevel="moderate",  # "moderate" = validates inserts AND updates
            validationAction="warn",     # "warn" = logs a warning but doesn't reject
                                         # Use "error" in production to enforce strictly
        )
        print(f"✓ Created collection '{COLLECTION_NAME}' with schema validation")
    except CollectionInvalid:
        print(f"⚠ Collection '{COLLECTION_NAME}' already exists — updating validator")
        db.command("collMod", COLLECTION_NAME, validator=validator)
    
    # Create indexes for fast queries
    # Think of indexes like the index at the back of a textbook —
    # they help MongoDB find documents without scanning every single one
    collection = db[COLLECTION_NAME]
    collection.create_index("battery_id", unique=True)
    collection.create_index("status")
    collection.create_index("health_grade")
    collection.create_index("manufacturer.chemistry")
    collection.create_index("health_details.state_of_health_pct")
    collection.create_index("health_details.peak_temp_recorded_c")
    collection.create_index("safety_workflow.current_state")
    print("✓ Created indexes for fast queries")
    
    return collection


def generate_fake_embedding(seed_value, dimensions=EMBEDDING_DIMENSIONS, cluster=None):
    """
    Generate a fake but DETERMINISTIC vector embedding for demo purposes.
    
    CLUSTERING:
    If a 'cluster' string is provided, embeddings in the same cluster
    will be similar to each other (high cosine similarity). This makes
    Vector Search actually work with fake data — healthy batteries match
    other healthy batteries, and failure profiles match similar failures.
    
    Clusters:
      "healthy_a"     — Grade A/A+ batteries (gentle use, low temps)
      "healthy_b"     — Grade B/B+ batteries (moderate use)
      "degraded"      — Grade C/C+ batteries (worn but usable)
      "fail_thermal"  — Thermal runaway profiles
      "fail_plating"  — Lithium plating profiles
      "fail_imbalance" — Cell imbalance profiles
    """
    rng = np.random.RandomState(seed_value)
    
    # Base vector from cluster center + noise
    # Each cluster has a fixed "direction" that similar batteries share
    cluster_seeds = {
        "healthy_a": 1000,
        "healthy_b": 2000,
        "degraded": 3000,
        "fail_thermal": 4000,
        "fail_plating": 5000,
        "fail_imbalance": 6000,
    }
    
    if cluster and cluster in cluster_seeds:
        # Generate the cluster center (deterministic per cluster)
        center_rng = np.random.RandomState(cluster_seeds[cluster])
        center = center_rng.randn(dimensions)
        # Add small noise so each battery in the cluster is slightly different
        noise = rng.randn(dimensions) * 0.3
        raw = center + noise
    else:
        # No cluster — fully random
        raw = rng.randn(dimensions)
    
    # Normalize to unit length (required for cosine similarity)
    normalized = raw / np.linalg.norm(raw)
    
    return normalized.tolist()


def seed_sample_data(collection):
    """
    Insert 5 sample batteries into the database.
    These are realistic examples that cover different grades, chemistries,
    and use cases — perfect for demos and for the rest of the team to test against.
    """
    
    now = datetime.now(timezone.utc)
    
    sample_batteries = [
        {
            "battery_id": "RVX-2024-00001",
            "status": "Certified for Repurpose",
            "manufacturer": {
                "name": "CATL",
                "model": "NMC811-72Ah",
                "chemistry": "NMC",
                "nominal_voltage": 3.7,
                "nominal_capacity_kwh": 75.0,
                "manufacture_date": "2021-03-15",
            },
            "health_grade": "A",
            "health_details": {
                "state_of_health_pct": 91.2,
                "remaining_useful_life_years": 6.5,
                "total_cycles": 580,
                "peak_temp_recorded_c": 38.4,
                "avg_discharge_rate_c": 0.5,
                "physical_condition": "Excellent — no visible damage",
                "gemini_analysis_summary": "High-quality NMC pack from temperate climate. Low cycle count with conservative discharge history. Ideal for residential solar storage.",
                "audit_timestamp": now,
            },
            "provenance": {
                "original_vehicle": "2021 Tesla Model 3 SR+",
                "vehicle_vin_hash": "a1b2c3d4e5f6",
                "climate_zone": "Temperate — Pacific Northwest",
                "years_in_service": 3.2,
                "removal_reason": "Vehicle totaled (minor front-end collision, battery undamaged)",
            },
            "telemetry_summary": {
                "voltage_min": 3.0,
                "voltage_max": 4.2,
                "voltage_mean": 3.72,
                "temp_min_c": 5.0,
                "temp_max_c": 38.4,
                "temp_mean_c": 22.1,
                "capacity_fade_pct": 8.8,
                "data_points_count": 5200,
                "discharge_curve_shape": "Linear",
            },
            "behavior_embedding": generate_fake_embedding(seed_value=1, cluster="healthy_a"),
            "listing": {
                "title": "Premium 75kWh NMC Pack — Grade A — Low Cycles",
                "description": "Verified CATL NMC811 pack from a gently-used Model 3. Only 580 cycles, 91% SOH. Perfect for home solar storage or light commercial EV conversion.",
                "asking_price_usd": 8500.00,
                "seller_id": "seller-001",
                "listed_at": now,
                "photo_urls": ["https://example.com/photos/rvx-00001-front.jpg"],
            },
            "created_at": now,
            "updated_at": now,
            "audit_manifest": {
                "version": "1.0",
                "generated_by": "Gemini 1.5 Pro",
                "passport_id": "RVX-2024-00001",
                "grade": "A",
                "recommended_use": ["Residential solar storage", "Light EV conversion"],
                "warnings": [],
            },
            "safety_workflow": {
                "current_state": "Complete",
                "technician_id": "tech-maria-001",
                "target_config": "4S2P 48V Residential Solar Stack",
                "started_at": now,
                "completed_at": now,
                "compliance_log": [
                    {"state": "Inspection", "action": "PPE verified: Class 0 insulated gloves, safety glasses, arc flash suit",
                     "confirmed_by": "voice_agent", "timestamp": now, "notes": "Environment clear, fire extinguisher present", "safety_check_passed": True},
                    {"state": "Discharging", "action": "Pack discharged to 42V via resistive load bank",
                     "confirmed_by": "voice_agent", "timestamp": now, "notes": "Multimeter confirmed 42V on main busbar", "safety_check_passed": True},
                    {"state": "Module Separation", "action": "8 modules separated, busbars disconnected",
                     "confirmed_by": "voice_agent", "timestamp": now, "notes": "All modules isolated and labeled", "safety_check_passed": True},
                    {"state": "Reassembly", "action": "4S2P configuration wired and tested",
                     "confirmed_by": "voice_agent", "timestamp": now, "notes": "Output verified: 48.2V nominal, BMS connected", "safety_check_passed": True},
                ],
            },
            "safety_risks": [],
        },
        {
            "battery_id": "RVX-2024-00002",
            "status": "Certified for Repurpose",
            "manufacturer": {
                "name": "BYD",
                "model": "Blade-LFP-60Ah",
                "chemistry": "LFP",
                "nominal_voltage": 3.2,
                "nominal_capacity_kwh": 58.0,
                "manufacture_date": "2020-09-22",
            },
            "health_grade": "B+",
            "health_details": {
                "state_of_health_pct": 84.7,
                "remaining_useful_life_years": 5.0,
                "total_cycles": 1100,
                "peak_temp_recorded_c": 52.3,
                "avg_discharge_rate_c": 0.8,
                "physical_condition": "Minor scuffing on casing, no structural damage",
                "gemini_analysis_summary": "Well-used LFP pack from hot climate. Higher cycle count but LFP chemistry is resilient. Thermal history shows occasional high-heat events. Best suited for stationary storage in controlled environments.",
                "audit_timestamp": now,
            },
            "provenance": {
                "original_vehicle": "2020 BYD Han EV",
                "vehicle_vin_hash": "f6e5d4c3b2a1",
                "climate_zone": "Arid — Phoenix, Arizona",
                "years_in_service": 4.5,
                "removal_reason": "Lease return, replaced with newer model",
            },
            "telemetry_summary": {
                "voltage_min": 2.8,
                "voltage_max": 3.65,
                "voltage_mean": 3.28,
                "temp_min_c": 12.0,
                "temp_max_c": 52.3,
                "temp_mean_c": 33.8,
                "capacity_fade_pct": 15.3,
                "data_points_count": 8400,
                "discharge_curve_shape": "Plateau",
            },
            "behavior_embedding": generate_fake_embedding(seed_value=2, cluster="healthy_b"),
            "listing": {
                "title": "58kWh LFP Blade Pack — Grade B+ — Arizona Tested",
                "description": "BYD Blade LFP pack proven in extreme heat. 1100 cycles, still 85% SOH. LFP chemistry means excellent safety for commercial installations.",
                "asking_price_usd": 5200.00,
                "seller_id": "seller-002",
                "listed_at": now,
                "photo_urls": ["https://example.com/photos/rvx-00002-front.jpg"],
            },
            "created_at": now,
            "updated_at": now,
            "audit_manifest": {
                "version": "1.0",
                "generated_by": "Gemini 1.5 Pro",
                "passport_id": "RVX-2024-00002",
                "grade": "B+",
                "recommended_use": ["Commercial stationary storage", "Backup power"],
                "warnings": ["Monitor thermal management in ambient temps above 45C"],
            },
            "safety_workflow": {
                "current_state": "Module Separation",
                "technician_id": "tech-james-002",
                "target_config": "8S1P 48V Commercial Backup Stack",
                "started_at": now,
                "completed_at": None,
                "compliance_log": [
                    {"state": "Inspection", "action": "PPE verified: Class 0 gloves, face shield",
                     "confirmed_by": "voice_agent", "timestamp": now, "notes": "Ambient temp 28C — within safe range for LFP", "safety_check_passed": True},
                    {"state": "Discharging", "action": "Pack discharged to 38V via controlled load",
                     "confirmed_by": "voice_agent", "timestamp": now, "notes": "LFP plateau discharge — slow final drain confirmed", "safety_check_passed": True},
                ],
            },
            "safety_risks": [
                {"risk_type": "Thermal", "severity": "Medium",
                 "description": "Historical peak temp of 52.3C suggests occasional thermal stress events",
                 "mitigation": "Perform disassembly in climate-controlled environment below 30C",
                 "detected_by": "gemini_csv"},
            ],
        },
        {
            "battery_id": "RVX-2024-00003",
            "status": "Pending Audit",
            "manufacturer": {
                "name": "LG Energy Solution",
                "model": "Pouch-NCA-65Ah",
                "chemistry": "NCA",
                "nominal_voltage": 3.6,
                "nominal_capacity_kwh": 65.0,
                "manufacture_date": "2019-06-10",
            },
            "health_grade": "C+",
            "health_details": {
                "state_of_health_pct": 72.1,
                "remaining_useful_life_years": 2.5,
                "total_cycles": 1800,
                "peak_temp_recorded_c": 45.0,
                "avg_discharge_rate_c": 1.2,
                "physical_condition": "Moderate wear, some cell imbalance detected",
                "gemini_analysis_summary": "Heavily used NCA pack with signs of accelerated degradation. High discharge rates suggest performance-oriented use. Suitable for non-critical applications or cell-level repurposing.",
                "audit_timestamp": now,
            },
            "provenance": {
                "original_vehicle": "2019 Chevrolet Bolt EV",
                "vehicle_vin_hash": "x9y8z7w6v5u4",
                "climate_zone": "Continental — Chicago, Illinois",
                "years_in_service": 5.8,
                "removal_reason": "High mileage replacement",
            },
            "telemetry_summary": {
                "voltage_min": 2.5,
                "voltage_max": 4.15,
                "voltage_mean": 3.55,
                "temp_min_c": -15.0,
                "temp_max_c": 45.0,
                "temp_mean_c": 18.5,
                "capacity_fade_pct": 27.9,
                "data_points_count": 12000,
                "discharge_curve_shape": "Knee",
            },
            "behavior_embedding": generate_fake_embedding(seed_value=3, cluster="degraded"),
            "listing": {
                "title": "65kWh NCA Pack — Grade C+ — Budget Option",
                "description": "High-mileage pack at a bargain price. 72% SOH with 2.5 years of useful life remaining. Great for workshop power walls or cell-level projects.",
                "asking_price_usd": 2800.00,
                "seller_id": "seller-003",
                "listed_at": now,
                "photo_urls": ["https://example.com/photos/rvx-00003-front.jpg"],
            },
            "created_at": now,
            "updated_at": now,
            "audit_manifest": {
                "version": "1.0",
                "generated_by": "Gemini 1.5 Pro",
                "passport_id": "RVX-2024-00003",
                "grade": "C+",
                "recommended_use": ["Workshop power wall", "Cell-level repurposing"],
                "warnings": ["Cell imbalance detected — requires BMS monitoring", "Not recommended for mobile applications"],
            },
            "safety_workflow": {
                "current_state": "Not Started",
                "technician_id": None,
                "target_config": None,
                "started_at": None,
                "completed_at": None,
                "compliance_log": [],
            },
            "safety_risks": [
                {"risk_type": "Electrical", "severity": "High",
                 "description": "Cell imbalance detected — voltage delta of 0.3V across module",
                 "mitigation": "Individual cell voltage check required before any disassembly",
                 "detected_by": "gemini_csv"},
                {"risk_type": "Structural", "severity": "Medium",
                 "description": "Knee-shaped discharge curve indicates accelerated degradation",
                 "mitigation": "Handle with extra caution — cells may be mechanically weakened",
                 "detected_by": "gemini_csv"},
            ],
        },
        {
            "battery_id": "RVX-2024-00004",
            "status": "Certified for Repurpose",
            "manufacturer": {
                "name": "Samsung SDI",
                "model": "Prismatic-NMC622-94Ah",
                "chemistry": "NMC",
                "nominal_voltage": 3.7,
                "nominal_capacity_kwh": 94.0,
                "manufacture_date": "2022-01-18",
            },
            "health_grade": "A+",
            "health_details": {
                "state_of_health_pct": 96.8,
                "remaining_useful_life_years": 9.0,
                "total_cycles": 210,
                "peak_temp_recorded_c": 34.2,
                "avg_discharge_rate_c": 0.3,
                "physical_condition": "Like new — still has factory seals",
                "gemini_analysis_summary": "Near-new 94kWh pack with minimal use. Extremely low cycle count and conservative thermal history. Premium asset suitable for any second-life application.",
                "audit_timestamp": now,
            },
            "provenance": {
                "original_vehicle": "2022 BMW iX xDrive50",
                "vehicle_vin_hash": "m3n4o5p6q7r8",
                "climate_zone": "Temperate — San Francisco Bay Area",
                "years_in_service": 1.5,
                "removal_reason": "Insurance total loss — cosmetic damage only, battery pristine",
            },
            "telemetry_summary": {
                "voltage_min": 3.3,
                "voltage_max": 4.2,
                "voltage_mean": 3.85,
                "temp_min_c": 10.0,
                "temp_max_c": 34.2,
                "temp_mean_c": 20.5,
                "capacity_fade_pct": 3.2,
                "data_points_count": 2100,
                "discharge_curve_shape": "Linear",
            },
            "behavior_embedding": generate_fake_embedding(seed_value=4, cluster="healthy_a"),
            "listing": {
                "title": "PREMIUM 94kWh NMC Pack — Grade A+ — Near New",
                "description": "Rare find: barely-used BMW iX pack with factory seals intact. Only 210 cycles, 97% SOH. The gold standard for second-life energy storage.",
                "asking_price_usd": 14500.00,
                "seller_id": "seller-004",
                "listed_at": now,
                "photo_urls": ["https://example.com/photos/rvx-00004-front.jpg"],
            },
            "created_at": now,
            "updated_at": now,
            "audit_manifest": {
                "version": "1.0",
                "generated_by": "Gemini 1.5 Pro",
                "passport_id": "RVX-2024-00004",
                "grade": "A+",
                "recommended_use": ["Commercial solar farm", "EV conversion", "Grid storage"],
                "warnings": [],
            },
            "safety_workflow": {
                "current_state": "Not Started",
                "technician_id": None,
                "target_config": None,
                "started_at": None,
                "completed_at": None,
                "compliance_log": [],
            },
            "safety_risks": [],
        },
        {
            "battery_id": "RVX-2024-00005",
            "status": "Under Review",
            "manufacturer": {
                "name": "CATL",
                "model": "LFP-Prismatic-50Ah",
                "chemistry": "LFP",
                "nominal_voltage": 3.2,
                "nominal_capacity_kwh": 40.0,
                "manufacture_date": "2020-11-05",
            },
            "health_grade": "Pending",
            "health_details": {
                "state_of_health_pct": 0.0,
                "remaining_useful_life_years": 0.0,
                "total_cycles": 0,
                "peak_temp_recorded_c": 0.0,
                "avg_discharge_rate_c": 0.0,
                "physical_condition": "Unknown — awaiting Gemini audit",
                "gemini_analysis_summary": "",
                "audit_timestamp": now,
            },
            "provenance": {
                "original_vehicle": "2020 NIO ES6",
                "vehicle_vin_hash": "s1t2u3v4w5x6",
                "climate_zone": "Unknown",
                "years_in_service": 0.0,
                "removal_reason": "Unknown — seller-provided unit",
            },
            "telemetry_summary": {
                "voltage_min": 0.0,
                "voltage_max": 0.0,
                "voltage_mean": 0.0,
                "temp_min_c": 0.0,
                "temp_max_c": 0.0,
                "temp_mean_c": 0.0,
                "capacity_fade_pct": 0.0,
                "data_points_count": 0,
                "discharge_curve_shape": "Unknown",
            },
            "behavior_embedding": generate_fake_embedding(seed_value=5, cluster="healthy_b"),
            "listing": {
                "title": "40kWh LFP Pack — Pending Audit",
                "description": "Awaiting Gemini verification. Details will be updated after audit completion.",
                "asking_price_usd": 0.0,
                "seller_id": "seller-005",
                "listed_at": now,
                "photo_urls": [],
            },
            "created_at": now,
            "updated_at": now,
            "audit_manifest": {},
            "safety_workflow": {
                "current_state": "Not Started",
                "technician_id": None,
                "target_config": None,
                "started_at": None,
                "completed_at": None,
                "compliance_log": [],
            },
            "safety_risks": [],
        },
        
        # === KNOWN FAILURE STATE PROFILES ===
        # These are reference batteries representing KNOWN bad patterns.
        # When /api/batteries/identify runs, Vector Search compares mystery
        # batteries against these to detect failures. This is the
        # "library of known failure states" from the landing page.
        
        {
            "battery_id": "FAIL-THERMAL-RUNAWAY-001",
            "status": "Rejected for Recycling",
            "manufacturer": {
                "name": "Reference Profile",
                "model": "Thermal Runaway Signature",
                "chemistry": "NMC",
                "nominal_voltage": 3.7,
                "nominal_capacity_kwh": 60.0,
                "manufacture_date": "2020-01-01",
            },
            "health_grade": "F",
            "health_details": {
                "state_of_health_pct": 42.0,
                "remaining_useful_life_years": 0.0,
                "total_cycles": 2200,
                "peak_temp_recorded_c": 78.5,
                "avg_discharge_rate_c": 2.1,
                "physical_condition": "Severe thermal damage — casing warped",
                "gemini_analysis_summary": "FAILURE REFERENCE: Thermal runaway precursor. Extreme temps (78C+) with rapid capacity fade. SEI decomposition confirmed. DO NOT upcycle — recycle only.",
                "audit_timestamp": now,
            },
            "provenance": {
                "original_vehicle": "Reference — not a real vehicle",
                "vehicle_vin_hash": "FAILURE_PROFILE",
                "climate_zone": "Extreme heat — failure reference",
                "years_in_service": 0.0,
                "removal_reason": "Known failure state reference profile",
            },
            "telemetry_summary": {
                "voltage_min": 2.1, "voltage_max": 4.3, "voltage_mean": 3.2,
                "temp_min_c": 25.0, "temp_max_c": 78.5, "temp_mean_c": 48.0,
                "capacity_fade_pct": 58.0, "data_points_count": 500,
                "discharge_curve_shape": "Knee",
            },
            "behavior_embedding": generate_fake_embedding(seed_value=100, cluster="fail_thermal"),
            "listing": {
                "title": "FAILURE REFERENCE — Thermal Runaway Pattern",
                "description": "Reference profile for thermal runaway precursors. Not for sale.",
                "asking_price_usd": 0.0, "seller_id": "system-reference",
                "listed_at": now, "photo_urls": [],
            },
            "created_at": now, "updated_at": now,
            "audit_manifest": {"version": "1.0", "generated_by": "System", "passport_id": "FAIL-THERMAL-RUNAWAY-001", "grade": "F", "recommended_use": ["Recycle only"], "warnings": ["Thermal runaway precursor detected"]},
            "safety_workflow": {"current_state": "Not Started", "technician_id": None, "target_config": None, "started_at": None, "completed_at": None, "compliance_log": []},
            "safety_risks": [
                {"risk_type": "Thermal", "severity": "Critical", "description": "Peak temp 78.5C — thermal runaway precursor. SEI layer decomposition likely.", "mitigation": "DO NOT disassemble. Send to certified recycler.", "detected_by": "gemini_csv"},
            ],
        },
        {
            "battery_id": "FAIL-LITHIUM-PLATING-001",
            "status": "Rejected for Recycling",
            "manufacturer": {
                "name": "Reference Profile",
                "model": "Lithium Plating Signature",
                "chemistry": "NMC",
                "nominal_voltage": 3.7,
                "nominal_capacity_kwh": 75.0,
                "manufacture_date": "2021-01-01",
            },
            "health_grade": "D",
            "health_details": {
                "state_of_health_pct": 61.0,
                "remaining_useful_life_years": 0.5,
                "total_cycles": 900,
                "peak_temp_recorded_c": 35.0,
                "avg_discharge_rate_c": 0.4,
                "physical_condition": "White deposits visible near terminals",
                "gemini_analysis_summary": "FAILURE REFERENCE: Lithium plating pattern. Rapid capacity loss despite low thermal stress. Cold-climate fast charging caused metallic lithium deposits on anode.",
                "audit_timestamp": now,
            },
            "provenance": {
                "original_vehicle": "Reference — not a real vehicle",
                "vehicle_vin_hash": "FAILURE_PROFILE",
                "climate_zone": "Cold climate — failure reference",
                "years_in_service": 0.0,
                "removal_reason": "Known failure state reference profile",
            },
            "telemetry_summary": {
                "voltage_min": 3.1, "voltage_max": 4.2, "voltage_mean": 3.65,
                "temp_min_c": -15.0, "temp_max_c": 35.0, "temp_mean_c": 5.0,
                "capacity_fade_pct": 39.0, "data_points_count": 600,
                "discharge_curve_shape": "Knee",
            },
            "behavior_embedding": generate_fake_embedding(seed_value=101, cluster="fail_plating"),
            "listing": {
                "title": "FAILURE REFERENCE — Lithium Plating Pattern",
                "description": "Reference profile for lithium plating from cold-climate fast charging. Not for sale.",
                "asking_price_usd": 0.0, "seller_id": "system-reference",
                "listed_at": now, "photo_urls": [],
            },
            "created_at": now, "updated_at": now,
            "audit_manifest": {"version": "1.0", "generated_by": "System", "passport_id": "FAIL-LITHIUM-PLATING-001", "grade": "D", "recommended_use": ["Cell-level testing only"], "warnings": ["Lithium plating detected — internal short circuit risk"]},
            "safety_workflow": {"current_state": "Not Started", "technician_id": None, "target_config": None, "started_at": None, "completed_at": None, "compliance_log": []},
            "safety_risks": [
                {"risk_type": "Chemical", "severity": "High", "description": "Lithium plating — metallic lithium deposits on anode from cold-climate fast charging below -10C.", "mitigation": "Do not fast-charge. Individual cell impedance testing required.", "detected_by": "gemini_csv"},
                {"risk_type": "Electrical", "severity": "High", "description": "Internal resistance elevated 40% above nominal — dendrite growth risk.", "mitigation": "Risk of internal short circuit. Handle with extreme caution.", "detected_by": "gemini_csv"},
            ],
        },
        {
            "battery_id": "FAIL-CELL-IMBALANCE-001",
            "status": "Rejected for Recycling",
            "manufacturer": {
                "name": "Reference Profile",
                "model": "Severe Cell Imbalance Signature",
                "chemistry": "LFP",
                "nominal_voltage": 3.2,
                "nominal_capacity_kwh": 50.0,
                "manufacture_date": "2019-06-01",
            },
            "health_grade": "D",
            "health_details": {
                "state_of_health_pct": 65.0,
                "remaining_useful_life_years": 1.0,
                "total_cycles": 1500,
                "peak_temp_recorded_c": 42.0,
                "avg_discharge_rate_c": 0.6,
                "physical_condition": "Uneven swelling across module — cells 3 and 7 bulging",
                "gemini_analysis_summary": "FAILURE REFERENCE: Severe cell imbalance. Voltage delta exceeds 0.5V across cells. Weakest cells limiting pack performance. BMS override events detected.",
                "audit_timestamp": now,
            },
            "provenance": {
                "original_vehicle": "Reference — not a real vehicle",
                "vehicle_vin_hash": "FAILURE_PROFILE",
                "climate_zone": "Mixed — failure reference",
                "years_in_service": 0.0,
                "removal_reason": "Known failure state reference profile",
            },
            "telemetry_summary": {
                "voltage_min": 2.4, "voltage_max": 3.65, "voltage_mean": 3.0,
                "temp_min_c": 8.0, "temp_max_c": 42.0, "temp_mean_c": 22.0,
                "capacity_fade_pct": 35.0, "data_points_count": 900,
                "discharge_curve_shape": "Knee",
            },
            "behavior_embedding": generate_fake_embedding(seed_value=102, cluster="fail_imbalance"),
            "listing": {
                "title": "FAILURE REFERENCE — Severe Cell Imbalance",
                "description": "Reference profile for dangerous cell imbalance patterns. Not for sale.",
                "asking_price_usd": 0.0, "seller_id": "system-reference",
                "listed_at": now, "photo_urls": [],
            },
            "created_at": now, "updated_at": now,
            "audit_manifest": {"version": "1.0", "generated_by": "System", "passport_id": "FAIL-CELL-IMBALANCE-001", "grade": "D", "recommended_use": ["Cell-level sorting and testing"], "warnings": ["Severe cell imbalance — pack-level use unsafe"]},
            "safety_workflow": {"current_state": "Not Started", "technician_id": None, "target_config": None, "started_at": None, "completed_at": None, "compliance_log": []},
            "safety_risks": [
                {"risk_type": "Electrical", "severity": "Critical", "description": "Cell voltage delta of 0.5V+ — weakest cells at risk of reversal under load.", "mitigation": "Individual cell testing required. Do not charge as a pack.", "detected_by": "gemini_csv"},
                {"risk_type": "Structural", "severity": "Medium", "description": "Uneven swelling in cells 3 and 7 suggests electrode delamination.", "mitigation": "Physical inspection of swollen cells before any handling.", "detected_by": "gemini_vision"},
            ],
        },
    ]
    
    # Clear any existing sample data (safe for re-runs during development)
    existing_ids = [b["battery_id"] for b in sample_batteries]
    deleted = collection.delete_many({"battery_id": {"$in": existing_ids}})
    if deleted.deleted_count > 0:
        print(f"  Cleared {deleted.deleted_count} existing sample records")
    
    # Insert all sample batteries at once (faster than one-by-one)
    result = collection.insert_many(sample_batteries)
    print(f"✓ Seeded {len(result.inserted_ids)} sample batteries:")
    for battery in sample_batteries:
        grade = battery["health_grade"]
        title = battery["listing"]["title"]
        print(f"    {battery['battery_id']} — Grade {grade} — {title[:50]}...")
    
    return sample_batteries


def generate_reference_library(collection):
    """
    Generate 42 additional reference batteries to build a proper
    "fingerprint library" for Vector Search.
    
    WHY 50 TOTAL?
    With only 8 batteries, Vector Search returns low-confidence scores
    because there aren't enough reference points. With 50 batteries
    spread across healthy/degraded/failure clusters, the similarity
    scores become meaningful — a healthy battery genuinely scores high
    against other healthy ones and low against failure profiles.
    
    The library is split across behavior clusters:
      - 15 healthy Grade A/A+ (gentle use, residential, temperate climates)
      - 10 healthy Grade B/B+ (moderate use, some fast charging)
      - 7 degraded Grade C/C+ (high mileage, some stress)
      - 4 failure: thermal abuse (hot climate, DC fast charge abuse)
      - 3 failure: lithium plating (cold climate fast charging)
      - 3 failure: cell imbalance (old packs, BMS failures)
    """
    
    now = datetime.now(timezone.utc)
    
    # Template profiles for each cluster
    profiles = [
        # 15 x Healthy A
        *[{"prefix": "REF-HA", "grade": random.choice(["A+", "A"]), "cluster": "healthy_a",
           "chemistry": random.choice(["NMC", "LFP", "NCA"]),
           "soh": round(random.uniform(88, 97), 1), "cycles": random.randint(100, 500),
           "peak_temp": round(random.uniform(28, 38), 1), "avg_current": round(random.uniform(0.2, 0.5), 1),
           "climate": random.choice(["Temperate — Pacific NW", "Temperate — Bay Area", "Temperate — UK", "Mild — Southern California"]),
          } for _ in range(15)],
        
        # 10 x Healthy B
        *[{"prefix": "REF-HB", "grade": random.choice(["B+", "B"]), "cluster": "healthy_b",
           "chemistry": random.choice(["NMC", "LFP"]),
           "soh": round(random.uniform(78, 88), 1), "cycles": random.randint(500, 1200),
           "peak_temp": round(random.uniform(35, 48), 1), "avg_current": round(random.uniform(0.5, 1.0), 1),
           "climate": random.choice(["Subtropical — Florida", "Mediterranean — Spain", "Continental — Chicago"]),
          } for _ in range(10)],
        
        # 7 x Degraded C
        *[{"prefix": "REF-DC", "grade": random.choice(["C+", "C"]), "cluster": "degraded",
           "chemistry": random.choice(["NMC", "NCA"]),
           "soh": round(random.uniform(70, 78), 1), "cycles": random.randint(1200, 2000),
           "peak_temp": round(random.uniform(42, 55), 1), "avg_current": round(random.uniform(0.8, 1.5), 1),
           "climate": random.choice(["Arid — Phoenix", "Hot — Dubai", "Continental — Detroit"]),
          } for _ in range(7)],
        
        # 4 x Failure: thermal
        *[{"prefix": "REF-FT", "grade": "F", "cluster": "fail_thermal",
           "chemistry": "NMC",
           "soh": round(random.uniform(35, 55), 1), "cycles": random.randint(1800, 3000),
           "peak_temp": round(random.uniform(62, 80), 1), "avg_current": round(random.uniform(1.5, 2.5), 1),
           "climate": "Extreme heat — thermal abuse reference",
          } for _ in range(4)],
        
        # 3 x Failure: lithium plating
        *[{"prefix": "REF-FP", "grade": "D", "cluster": "fail_plating",
           "chemistry": "NMC",
           "soh": round(random.uniform(55, 65), 1), "cycles": random.randint(700, 1200),
           "peak_temp": round(random.uniform(30, 40), 1), "avg_current": round(random.uniform(0.3, 0.6), 1),
           "climate": "Cold climate — lithium plating reference",
          } for _ in range(3)],
        
        # 3 x Failure: cell imbalance
        *[{"prefix": "REF-FI", "grade": "D", "cluster": "fail_imbalance",
           "chemistry": random.choice(["LFP", "NMC"]),
           "soh": round(random.uniform(58, 68), 1), "cycles": random.randint(1400, 2200),
           "peak_temp": round(random.uniform(38, 48), 1), "avg_current": round(random.uniform(0.5, 0.9), 1),
           "climate": "Mixed — cell imbalance reference",
          } for _ in range(3)],
    ]
    
    ref_batteries = []
    for i, p in enumerate(profiles):
        bid = f"{p['prefix']}-{i+1:03d}"
        is_fail = p["grade"] in ("D", "F")
        
        ref_batteries.append({
            "battery_id": bid,
            "status": "Rejected for Recycling" if is_fail else "Certified for Repurpose",
            "manufacturer": {
                "name": "Reference Library",
                "model": f"{p['cluster']} profile #{i+1}",
                "chemistry": p["chemistry"],
                "nominal_voltage": 3.7 if p["chemistry"] in ("NMC", "NCA") else 3.2,
                "nominal_capacity_kwh": round(random.uniform(40, 95), 0),
                "manufacture_date": f"{random.randint(2019, 2023)}-{random.randint(1,12):02d}-01",
            },
            "health_grade": p["grade"],
            "health_details": {
                "state_of_health_pct": p["soh"],
                "remaining_useful_life_years": round(max(0, (p["soh"] - 60) / 5), 1),
                "total_cycles": p["cycles"],
                "peak_temp_recorded_c": p["peak_temp"],
                "avg_discharge_rate_c": p["avg_current"],
                "physical_condition": "Reference profile",
                "gemini_analysis_summary": f"Reference library entry: {p['cluster']} cluster.",
                "audit_timestamp": now,
            },
            "provenance": {
                "original_vehicle": "Reference library",
                "vehicle_vin_hash": f"REF_{i:03d}",
                "climate_zone": p["climate"],
                "years_in_service": round(random.uniform(1, 6), 1),
                "removal_reason": "Reference library entry",
            },
            "telemetry_summary": {
                "voltage_min": round(random.uniform(2.5, 3.3) * 96, 1),
                "voltage_max": round(random.uniform(3.8, 4.2) * 96, 1),
                "voltage_mean": round(random.uniform(3.4, 3.8) * 96, 1),
                "temp_min_c": round(random.uniform(-10, 15), 1),
                "temp_max_c": p["peak_temp"],
                "temp_mean_c": round(p["peak_temp"] * 0.6, 1),
                "capacity_fade_pct": round(100 - p["soh"], 1),
                "data_points_count": random.randint(500, 10000),
                "discharge_curve_shape": "Knee" if is_fail else random.choice(["Linear", "Plateau"]),
            },
            "behavior_embedding": generate_fake_embedding(seed_value=200 + i, cluster=p["cluster"]),
            "listing": {
                "title": f"Reference: {p['cluster']} #{i+1}",
                "description": "Fingerprint library entry. Not for sale.",
                "asking_price_usd": 0.0,
                "seller_id": "system-library",
                "listed_at": now,
                "photo_urls": [],
            },
            "created_at": now,
            "updated_at": now,
            "audit_manifest": {"version": "1.0", "generated_by": "System", "passport_id": bid, "grade": p["grade"],
                               "en_18061_status": "Rejected for Recycling" if is_fail else "Certified for Repurpose",
                               "recommended_use": ["Recycling"] if is_fail else ["Stationary storage"],
                               "warnings": [], "rejection_reasons": []},
            "safety_workflow": {"current_state": "Not Started", "technician_id": None, "target_config": None,
                                "started_at": None, "completed_at": None, "compliance_log": []},
            "safety_risks": [],
        })
    
    # Clear existing reference library entries
    deleted = collection.delete_many({"battery_id": {"$regex": "^REF-"}})
    if deleted.deleted_count > 0:
        print(f"  Cleared {deleted.deleted_count} old reference library entries")
    
    result = collection.insert_many(ref_batteries)
    print(f"✓ Generated {len(result.inserted_ids)} reference library batteries:")
    
    # Count by cluster
    from collections import Counter
    cluster_counts = Counter(p["cluster"] for p in profiles)
    for cluster, count in sorted(cluster_counts.items()):
        print(f"    {cluster:<20} {count} profiles")
    
    return ref_batteries


# ============================================
# MAIN — Run this script!
# ============================================
if __name__ == "__main__":
    import random
    random.seed(42)  # Reproducible reference library
    
    print("\n🔋 ReVolt OS — Schema, Seed Data & Reference Library")
    print("=" * 55)
    
    # Step 1: Connect
    print("\n[1/4] Connecting to MongoDB Atlas...")
    db = get_database()
    
    # Step 2: Create collection with validation
    print("\n[2/4] Creating collection with schema validation...")
    collection = create_collection_with_validation(db)
    
    # Step 3: Seed core sample data (8 batteries)
    print("\n[3/4] Seeding core sample battery data...")
    batteries = seed_sample_data(collection)
    
    # Step 4: Generate reference fingerprint library (42 more)
    print("\n[4/4] Generating reference fingerprint library...")
    ref_batteries = generate_reference_library(collection)
    
    # Done!
    total = collection.count_documents({})
    print("\n" + "=" * 55)
    print("✓ Database fully populated!")
    print(f"  Database: {DB_NAME}")
    print(f"  Collection: {COLLECTION_NAME}")
    print(f"  Total documents: {total}")
    print(f"    Core batteries:    {len(batteries)}")
    print(f"    Reference library: {len(ref_batteries)}")
    print(f"  Embedding dimensions: {EMBEDDING_DIMENSIONS}")
    print("\nVector Search will now have {total} reference points for comparison.")
    print("Next: Run vector_search_setup.py to verify the index")