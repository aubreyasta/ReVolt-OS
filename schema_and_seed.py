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
# 256 is a good balance: detailed enough to capture behavior, small enough to be fast
EMBEDDING_DIMENSIONS = 256


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
                    "enum": ["Listed", "Under Review", "Certified", "Sold", "Disassembly Started"],
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


def generate_fake_embedding(seed_value, dimensions=EMBEDDING_DIMENSIONS):
    """
    Generate a fake but DETERMINISTIC vector embedding for demo purposes.
    
    In the real app, Person 2 will generate these from actual telemetry data
    using Gemini or a sentence-transformer model. For now, we use numpy
    to create fake embeddings that are:
      - Deterministic (same seed = same vector, so demos are repeatable)
      - Normalized (length = 1.0, which is required for cosine similarity)
    
    WHY NORMALIZED?
    Vector Search uses "cosine similarity" to compare vectors.
    Cosine similarity only cares about DIRECTION, not magnitude.
    Normalizing ensures every vector has the same length.
    """
    rng = np.random.RandomState(seed_value)
    raw = rng.randn(dimensions)
    
    # Normalize: divide each number by the total length of the vector
    # This makes the vector's magnitude = 1.0
    normalized = raw / np.linalg.norm(raw)
    
    return normalized.tolist()  # Convert numpy array to plain Python list for MongoDB


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
            "status": "Certified",
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
            "behavior_embedding": generate_fake_embedding(seed_value=1),
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
            "status": "Certified",
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
            "behavior_embedding": generate_fake_embedding(seed_value=2),
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
            "status": "Listed",
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
            "behavior_embedding": generate_fake_embedding(seed_value=3),
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
            "status": "Certified",
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
            "behavior_embedding": generate_fake_embedding(seed_value=4),
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
            "behavior_embedding": generate_fake_embedding(seed_value=5),
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
            "status": "Certified",
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
            "behavior_embedding": generate_fake_embedding(seed_value=100),
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
            "status": "Certified",
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
            "behavior_embedding": generate_fake_embedding(seed_value=101),
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
            "status": "Certified",
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
            "behavior_embedding": generate_fake_embedding(seed_value=102),
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


# ============================================
# MAIN — Run this script!
# ============================================
if __name__ == "__main__":
    print("\n🔋 ReVolt Exchange — Sprint 1: Schema & Seed Data")
    print("=" * 55)
    
    # Step 1: Connect
    print("\n[1/3] Connecting to MongoDB Atlas...")
    db = get_database()
    
    # Step 2: Create collection with validation
    print("\n[2/3] Creating collection with schema validation...")
    collection = create_collection_with_validation(db)
    
    # Step 3: Seed sample data
    print("\n[3/3] Seeding sample battery data...")
    batteries = seed_sample_data(collection)
    
    # Done!
    print("\n" + "=" * 55)
    print("✓ Sprint 1 Step 1 COMPLETE!")
    print(f"  Database: {DB_NAME}")
    print(f"  Collection: {COLLECTION_NAME}")
    print(f"  Documents: {collection.count_documents({})}")
    print("\nNext: Run 02_vector_search_setup.py to enable similarity search")
