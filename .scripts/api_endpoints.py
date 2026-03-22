"""
03_api_endpoints.py — Flask API Server for ReVolt Exchange
==========================================================
This is the THIRD script Person 1 runs. It creates a REST API that the
entire team connects to:

  Person 2 (Gemini) → POST /api/batteries              (create new audited battery)
  Person 3 (Voice)  → GET  /api/batteries/:id           (agent reads battery details)
                    → PATCH /api/batteries/:id/safety    (log safety step from voice agent)
                    → GET  /api/batteries/:id/safety     (get current safety workflow state)
  Person 4 (React)  → GET  /api/batteries               (list all batteries)
                    → POST /api/batteries/search         (vector similarity search)
                    → POST /api/batteries/identify       (mystery battery identification)

WHAT IS AN API?
  An API (Application Programming Interface) is like a menu at a restaurant.
  It lists what you can order (endpoints) and what you'll get back (JSON data).
  
  Instead of everyone connecting directly to MongoDB (messy, insecure),
  they all talk to THIS server, which talks to MongoDB for them.

WHAT IS FLASK?
  Flask is a lightweight Python web framework. It lets you define URL routes
  (like "/api/batteries") and what happens when someone visits them.
  Think of it as: "When someone goes to this URL, run this function."

Install: pip install flask flask-cors
Run: python 03_api_endpoints.py
Then visit: http://localhost:5000/api/batteries
"""

import os
import json
import numpy as np
import certifi
from datetime import datetime, timezone
from flask import Flask, request, jsonify
from flask_cors import CORS
from pymongo import MongoClient
from bson import ObjectId
from dotenv import load_dotenv

load_dotenv()

# --- APP SETUP ---

# Create the Flask app
# Think of this as creating the "restaurant" that will serve our API
app = Flask(__name__)

# CORS = Cross-Origin Resource Sharing
# This allows Person 4's React frontend (running on localhost:3000)
# to make requests to our API (running on localhost:5000)
# Without this, the browser blocks the requests for security
CORS(app)

# --- DATABASE CONNECTION ---

MONGODB_URI = os.getenv("MONGODB_URI")
DB_NAME = os.getenv("DB_NAME", "revolt_db")
COLLECTION_NAME = "battery_twins"
INDEX_NAME = "battery_behavior_index"

client = MongoClient(MONGODB_URI, tlsCAFile=certifi.where())
db = client[DB_NAME]
collection = db[COLLECTION_NAME]


def serialize_doc(doc):
    """
    Convert a MongoDB document to JSON-safe format.
    
    MongoDB uses special types (ObjectId, datetime) that Python's json
    module can't handle directly. This function converts them to strings.
    
    Why is this needed?
      MongoDB's _id field is an ObjectId object, not a string.
      jsonify() (Flask's JSON converter) would crash without this conversion.
    """
    if doc is None:
        return None
    if isinstance(doc, list):
        return [serialize_doc(d) for d in doc]
    if isinstance(doc, dict):
        result = {}
        for key, value in doc.items():
            if isinstance(value, ObjectId):
                result[key] = str(value)
            elif isinstance(value, datetime):
                result[key] = value.isoformat()
            elif isinstance(value, dict):
                result[key] = serialize_doc(value)
            elif isinstance(value, list):
                result[key] = [serialize_doc(item) if isinstance(item, (dict, list)) else item for item in value]
            else:
                result[key] = value
        return result
    return doc


# ============================================
# API ENDPOINTS
# ============================================


# --- HEALTH CHECK ---
@app.route("/api/health", methods=["GET"])
def health_check():
    """
    Simple endpoint to verify the API is running.
    
    Usage: GET http://localhost:5000/api/health
    Returns: {"status": "ok", "database": "connected"}
    
    Person 4 can call this on page load to show a green/red status indicator.
    """
    try:
        client.admin.command("ping")
        return jsonify({"status": "ok", "database": "connected"})
    except Exception as e:
        return jsonify({"status": "error", "database": str(e)}), 500


# --- LIST ALL BATTERIES ---
@app.route("/api/batteries", methods=["GET"])
def list_batteries():
    """
    Get all batteries in the marketplace, with optional filters.
    
    Usage examples:
      GET /api/batteries                          → All batteries
      GET /api/batteries?status=Certified         → Only certified ones
      GET /api/batteries?chemistry=LFP            → Only LFP chemistry
      GET /api/batteries?min_soh=80               → SOH above 80%
      GET /api/batteries?grade=A,A+               → Only grade A or A+
    
    The "?" part of the URL is called "query parameters" — they're like
    filters you add to narrow down results. Flask reads them with
    request.args.get().
    """
    
    # Build a MongoDB query filter from the URL parameters
    query = {}
    
    # Filter by status (e.g. "Certified", "Listed")
    status = request.args.get("status")
    if status:
        query["status"] = status
    
    # Filter by chemistry type
    chemistry = request.args.get("chemistry")
    if chemistry:
        query["manufacturer.chemistry"] = chemistry
    
    # Filter by minimum State of Health percentage
    min_soh = request.args.get("min_soh")
    if min_soh:
        # "$gte" means "greater than or equal to"
        query["health_details.state_of_health_pct"] = {"$gte": float(min_soh)}
    
    # Filter by health grade (can be comma-separated: "A,A+,B+")
    grade = request.args.get("grade")
    if grade:
        grades = [g.strip() for g in grade.split(",")]
        # "$in" means "matches any of these values"
        query["health_grade"] = {"$in": grades}
    
    # Execute the query
    # We exclude the embedding from results (it's huge and not useful for display)
    batteries = list(
        collection.find(
            query,
            {"behavior_embedding": 0}  # 0 = exclude this field
        ).sort("created_at", -1)  # -1 = newest first
    )
    
    return jsonify({
        "count": len(batteries),
        "batteries": serialize_doc(batteries),
    })


# --- GET SINGLE BATTERY ---
@app.route("/api/batteries/<battery_id>", methods=["GET"])
def get_battery(battery_id):
    """
    Get full details for a single battery by its ID.
    
    Usage: GET /api/batteries/RVX-2024-00001
    
    This is what Person 3's ElevenLabs agent calls when a buyer asks
    "Tell me about this battery." The agent needs ALL the details
    to answer questions intelligently.
    
    The <battery_id> part in the route is a "URL parameter" — Flask
    automatically extracts it and passes it to this function.
    """
    
    battery = collection.find_one(
        {"battery_id": battery_id},
        {"behavior_embedding": 0},  # Exclude the giant vector
    )
    
    if not battery:
        return jsonify({"error": f"Battery '{battery_id}' not found"}), 404
    
    return jsonify(serialize_doc(battery))


# --- GET BATTERY AUDIT MANIFEST (The "Battery Passport") ---
@app.route("/api/batteries/<battery_id>/passport", methods=["GET"])
def get_battery_passport(battery_id):
    """
    Get just the audit manifest (Battery Passport) for a battery.
    
    Usage: GET /api/batteries/RVX-2024-00001/passport
    
    This is the "product" — the certified JSON document that proves
    the battery's value. Person 4 will display this as a styled card
    in the frontend.
    """
    
    battery = collection.find_one(
        {"battery_id": battery_id},
        {
            "battery_id": 1,
            "health_grade": 1,
            "health_details": 1,
            "manufacturer": 1,
            "provenance": 1,
            "audit_manifest": 1,
            "telemetry_summary": 1,
        },
    )
    
    if not battery:
        return jsonify({"error": f"Battery '{battery_id}' not found"}), 404
    
    return jsonify(serialize_doc(battery))


# --- CREATE / UPDATE BATTERY (Person 2 uses this) ---
@app.route("/api/batteries", methods=["POST"])
def create_battery():
    """
    Create a new battery or update an existing one.
    
    Usage: POST /api/batteries
    Body: JSON with battery data (see schema in 01_schema_and_seed.py)
    
    Person 2's Gemini pipeline calls this endpoint after analyzing
    a battery's CSV + photo. It sends the full Digital Twin document
    including the health grade, audit manifest, and generated listing.
    
    If a battery with the same battery_id already exists, it updates it
    (this handles re-auditing a battery with new data).
    """
    
    data = request.get_json()
    
    if not data:
        return jsonify({"error": "No JSON data provided"}), 400
    
    if "battery_id" not in data:
        return jsonify({"error": "battery_id is required"}), 400
    
    # Add timestamps
    now = datetime.now(timezone.utc)
    data["updated_at"] = now
    
    # Remove created_at from data if present — we handle it separately
    # to avoid a MongoDB conflict between $set and $setOnInsert
    incoming_created_at = data.pop("created_at", None)
    
    # Use upsert: update if exists, insert if doesn't
    # This is a MongoDB feature — super useful for "create or update" patterns
    result = collection.update_one(
        {"battery_id": data["battery_id"]},  # Find by this
        {
            "$set": data,                    # Update these fields
            "$setOnInsert": {"created_at": incoming_created_at or now},  # Only set on first insert
        },
        upsert=True,  # Create if doesn't exist
    )
    
    # Determine what happened
    if result.upserted_id:
        action = "created"
        status_code = 201  # 201 = "Created"
    else:
        action = "updated"
        status_code = 200  # 200 = "OK"
    
    return jsonify({
        "action": action,
        "battery_id": data["battery_id"],
    }), status_code


# --- VECTOR SIMILARITY SEARCH ---
@app.route("/api/batteries/search", methods=["POST"])
def search_batteries():
    """
    Find batteries similar to a given behavior embedding.
    
    Usage: POST /api/batteries/search
    Body: {
        "query_embedding": [0.1, -0.2, ...],  // 256 floats
        "num_results": 5,                       // optional, default 5
        "filters": {                            // optional pre-filters
            "status": "Certified",
            "manufacturer.chemistry": "LFP"
        }
    }
    
    ALTERNATIVE: Search by battery_id (find similar to an existing battery)
    Body: {
        "similar_to": "RVX-2024-00002",  // Find batteries like this one
        "num_results": 3
    }
    
    This powers the marketplace's "Smart Match" feature.
    When Person 3's voice agent hears "I need something like the Arizona battery,"
    it calls this endpoint with that battery's ID.
    """
    
    data = request.get_json()
    
    if not data:
        return jsonify({"error": "No JSON data provided"}), 400
    
    num_results = data.get("num_results", 5)
    filters = data.get("filters")
    
    # Option A: Direct embedding search
    if "query_embedding" in data:
        query_embedding = data["query_embedding"]
    
    # Option B: "Find similar to this battery"
    elif "similar_to" in data:
        reference = collection.find_one(
            {"battery_id": data["similar_to"]},
            {"behavior_embedding": 1},
        )
        if not reference:
            return jsonify({"error": f"Battery '{data['similar_to']}' not found"}), 404
        query_embedding = reference["behavior_embedding"]
    
    else:
        return jsonify({"error": "Provide 'query_embedding' or 'similar_to'"}), 400
    
    # Build the vector search pipeline
    vector_search_stage = {
        "$vectorSearch": {
            "index": INDEX_NAME,
            "path": "behavior_embedding",
            "queryVector": query_embedding,
            "numCandidates": num_results * 10,
            "limit": num_results,
        }
    }
    
    if filters:
        vector_search_stage["$vectorSearch"]["filter"] = filters
    
    pipeline = [
        vector_search_stage,
        {
            "$project": {
                "behavior_embedding": 0,  # Exclude the big vector from results
                "similarity_score": {"$meta": "vectorSearchScore"},
            }
        },
    ]
    
    try:
        results = list(collection.aggregate(pipeline))
        return jsonify({
            "count": len(results),
            "results": serialize_doc(results),
        })
    except Exception as e:
        error_msg = str(e)
        if "index not found" in error_msg.lower():
            return jsonify({
                "error": "Vector Search index not yet created. See 02_vector_search_setup.py for instructions."
            }), 503  # 503 = Service Unavailable
        return jsonify({"error": str(e)}), 500


# --- UPDATE BATTERY STATUS (Triggers Change Stream for Person 3) ---
@app.route("/api/batteries/<battery_id>/status", methods=["PATCH"])
def update_battery_status(battery_id):
    """
    Update a battery's marketplace status.
    
    Usage: PATCH /api/batteries/RVX-2024-00001/status
    Body: {"status": "Disassembly Started"}
    
    Valid statuses: Listed → Under Review → Certified → Sold → Disassembly Started
    
    WHY THIS MATTERS FOR PERSON 3:
    When status changes to "Disassembly Started", a MongoDB Change Stream
    can detect this and trigger the ElevenLabs Safety Agent automatically.
    This is the "Change Streams" feature mentioned in the brief!
    """
    
    data = request.get_json()
    
    valid_statuses = ["Pending Audit", "Under Review", "Certified for Repurpose", "Rejected for Recycling", "Disassembly Started", "Upcycle Complete"]
    new_status = data.get("status")
    
    if new_status not in valid_statuses:
        return jsonify({
            "error": f"Invalid status. Must be one of: {valid_statuses}"
        }), 400
    
    result = collection.update_one(
        {"battery_id": battery_id},
        {
            "$set": {
                "status": new_status,
                "updated_at": datetime.now(timezone.utc),
            }
        },
    )
    
    if result.matched_count == 0:
        return jsonify({"error": f"Battery '{battery_id}' not found"}), 404
    
    return jsonify({
        "battery_id": battery_id,
        "new_status": new_status,
        "message": f"Status updated to '{new_status}'",
    })


# --- MYSTERY BATTERY IDENTIFICATION (The "Shazam for Batteries") ---
@app.route("/api/batteries/identify", methods=["POST"])
def identify_battery():
    """
    Identify an unknown battery from a short voltage log.
    
    Usage: POST /api/batteries/identify
    Body: {
        "voltage_readings": [3.72, 3.71, 3.70, 3.68, ...],  // Raw voltage samples
        "sample_rate_hz": 1,       // How many readings per second (optional)
        "num_results": 3           // How many candidates to return (optional)
    }
    
    THE DEMO SCENARIO (from the whitepaper):
    A technician finds a mystery battery module in the warehouse.
    No label, no sticker, nothing. They connect a multimeter, record
    5 seconds of voltage readings, and upload them here.
    
    This endpoint:
      1. Takes the raw voltage readings
      2. Converts them into a 256-dim vector embedding (same format as our stored batteries)
      3. Uses MongoDB Atlas Vector Search to find the closest match
      4. Returns the most likely manufacturer, chemistry, and model
    
    HOW THE EMBEDDING WORKS:
    We extract statistical features from the voltage readings (mean, std, slope,
    min, max, etc.) and pad/repeat them to fill 256 dimensions. In production,
    you'd use a proper time-series embedding model. For the hackathon demo,
    this statistical approach is fast and shows the concept perfectly.
    
    WHY THIS IMPRESSES JUDGES:
    This is the "wow" moment for the MongoDB track. You're identifying
    batteries by their ELECTRICAL BEHAVIOR, not by reading a label.
    It proves you understand high-dimensional similarity search.
    """
    
    data = request.get_json()
    
    if not data or "voltage_readings" not in data:
        return jsonify({
            "error": "Provide 'voltage_readings': a list of voltage samples (floats)"
        }), 400
    
    readings = data["voltage_readings"]
    
    if len(readings) < 3:
        return jsonify({"error": "Need at least 3 voltage readings"}), 400
    
    num_results = data.get("num_results", 3)
    
    # --- Convert voltage readings into a 256-dim embedding ---
    # This is a simplified version for the hackathon.
    # In production, you'd use a trained time-series encoder.
    
    readings_array = np.array(readings, dtype=float)
    
    # Extract meaningful features from the voltage trace
    features = [
        np.mean(readings_array),           # Average voltage (chemistry signature)
        np.std(readings_array),            # Voltage stability
        np.min(readings_array),            # Minimum voltage
        np.max(readings_array),            # Maximum voltage
        np.max(readings_array) - np.min(readings_array),  # Voltage range
        np.median(readings_array),         # Median voltage
        float(np.percentile(readings_array, 25)),  # Q1
        float(np.percentile(readings_array, 75)),  # Q3
    ]
    
    # Add slope features (how voltage changes over time)
    if len(readings_array) > 1:
        diffs = np.diff(readings_array)
        features.extend([
            np.mean(diffs),       # Average voltage change per sample
            np.std(diffs),        # Volatility of changes
            np.min(diffs),        # Steepest drop
            np.max(diffs),        # Steepest rise
            float(np.sum(diffs < 0)) / len(diffs),  # % of samples that dropped
        ])
    else:
        features.extend([0.0, 0.0, 0.0, 0.0, 0.0])
    
    # Pad to 256 dimensions by repeating and adding noise
    # (ensures the vector is the right size for our index)
    base = np.array(features)
    rng = np.random.RandomState(int(abs(np.mean(readings_array)) * 10000) % (2**31))
    
    # Tile the features to fill 256 dims, then add small noise
    # The noise is seeded by the mean voltage, so same input → same output
    repeated = np.tile(base, (256 // len(base)) + 1)[:256]
    noise = rng.randn(256) * 0.01
    embedding = repeated + noise
    
    # Normalize to unit length (required for cosine similarity)
    norm = np.linalg.norm(embedding)
    if norm > 0:
        embedding = embedding / norm
    
    query_embedding = embedding.tolist()
    
    # --- Run Vector Search ---
    pipeline = [
        {
            "$vectorSearch": {
                "index": INDEX_NAME,
                "path": "behavior_embedding",
                "queryVector": query_embedding,
                "numCandidates": num_results * 20,  # Cast a wider net for identification
                "limit": num_results,
            }
        },
        {
            "$project": {
                "battery_id": 1,
                "manufacturer": 1,
                "health_grade": 1,
                "health_details.state_of_health_pct": 1,
                "telemetry_summary": 1,
                "provenance.climate_zone": 1,
                "safety_risks": 1,
                "similarity_score": {"$meta": "vectorSearchScore"},
            }
        },
    ]
    
    try:
        results = list(collection.aggregate(pipeline))
        
        if not results:
            return jsonify({
                "identified": False,
                "message": "No matching battery profiles found. The index may still be building.",
                "candidates": [],
            })
        
        # The top result is our best guess
        top_match = results[0]
        confidence = top_match.get("similarity_score", 0)
        
        return jsonify({
            "identified": True,
            "confidence": round(confidence, 4),
            "best_match": {
                "battery_id": top_match.get("battery_id"),
                "manufacturer": top_match.get("manufacturer", {}).get("name"),
                "model": top_match.get("manufacturer", {}).get("model"),
                "chemistry": top_match.get("manufacturer", {}).get("chemistry"),
                "health_grade": top_match.get("health_grade"),
            },
            "input_stats": {
                "num_readings": len(readings),
                "voltage_mean": round(float(np.mean(readings_array)), 3),
                "voltage_range": round(float(np.max(readings_array) - np.min(readings_array)), 3),
            },
            "all_candidates": serialize_doc(results),
        })
        
    except Exception as e:
        error_msg = str(e)
        if "index not found" in error_msg.lower():
            return jsonify({
                "error": "Vector Search index not yet created. See 02_vector_search_setup.py."
            }), 503
        return jsonify({"error": str(e)}), 500


# --- SAFETY WORKFLOW: GET CURRENT STATE ---
@app.route("/api/batteries/<battery_id>/safety", methods=["GET"])
def get_safety_workflow(battery_id):
    """
    Get the current safety workflow state for a battery.
    
    Usage: GET /api/batteries/RVX-2024-00002/safety
    
    Returns the full safety_workflow subdocument including:
      - current_state (which step the technician is on)
      - compliance_log (every completed step with timestamps)
      - safety_risks (Gemini-detected hazards)
    
    Person 3's ElevenLabs agent calls this at the START of every session
    to know where the technician left off (in case of interruption).
    Person 4's React frontend uses this for the progress tracker UI.
    """
    
    battery = collection.find_one(
        {"battery_id": battery_id},
        {
            "battery_id": 1,
            "status": 1,
            "health_grade": 1,
            "manufacturer": 1,
            "safety_workflow": 1,
            "safety_risks": 1,
        },
    )
    
    if not battery:
        return jsonify({"error": f"Battery '{battery_id}' not found"}), 404
    
    return jsonify(serialize_doc(battery))


# --- SAFETY WORKFLOW: LOG A STEP (Person 3's main endpoint) ---
@app.route("/api/batteries/<battery_id>/safety", methods=["PATCH"])
def update_safety_workflow(battery_id):
    """
    Advance the safety workflow to the next state and log the action.
    
    Usage: PATCH /api/batteries/RVX-2024-00002/safety
    Body: {
        "action": "advance",           // "advance" to next state, or "log" to just add a note
        "confirmed_by": "voice_agent",  // Who confirmed this step
        "notes": "Multimeter reads 42V on main busbar",
        "safety_check_passed": true,
        "technician_id": "tech-james-002"  // Required on first advance
    }
    
    THE STATE MACHINE:
    States must advance in order. You can NOT skip steps.
    
      Not Started → Inspection → Discharging → Module Separation → Reassembly → Complete
    
    WHY STRICT ORDERING?
    A technician cannot start unbolting modules before confirming the
    pack is safely discharged. The ElevenLabs agent enforces this by
    only calling "advance" when the technician verbally confirms the
    current step is complete.
    
    WHAT HAPPENS ON EACH ADVANCE:
      1. The current state is logged to the compliance_log with a timestamp
      2. The current_state advances to the next step
      3. A MongoDB Change Stream detects the update (see watch_safety_workflow below)
      4. If advancing to "Complete", the completed_at timestamp is set
    
    Person 3 calls this every time the voice agent hears the technician
    confirm a step is done. The compliance_log becomes the auditable
    safety record embedded in the Battery Passport.
    """
    
    data = request.get_json()
    if not data:
        return jsonify({"error": "No JSON data provided"}), 400
    
    # Define the valid state progression
    # This list IS the state machine — states can only move forward
    STATE_ORDER = [
        "Not Started",
        "Inspection",
        "Discharging",
        "Module Separation",
        "Reassembly",
        "Complete",
    ]
    
    # Get the current battery
    battery = collection.find_one({"battery_id": battery_id})
    if not battery:
        return jsonify({"error": f"Battery '{battery_id}' not found"}), 404
    
    workflow = battery.get("safety_workflow", {})
    current_state = workflow.get("current_state", "Not Started")
    action = data.get("action", "advance")
    
    now = datetime.now(timezone.utc)
    
    # --- LOG action: just append to compliance_log without advancing ---
    if action == "log":
        log_entry = {
            "state": current_state,
            "action": data.get("notes", "Manual log entry"),
            "confirmed_by": data.get("confirmed_by", "system"),
            "timestamp": now,
            "notes": data.get("notes", ""),
            "safety_check_passed": data.get("safety_check_passed", True),
        }
        
        collection.update_one(
            {"battery_id": battery_id},
            {
                "$push": {"safety_workflow.compliance_log": log_entry},
                "$set": {"updated_at": now},
            },
        )
        
        return jsonify({
            "battery_id": battery_id,
            "action": "logged",
            "current_state": current_state,
            "log_entry": serialize_doc(log_entry),
        })
    
    # --- ADVANCE action: move to the next state ---
    if action == "advance":
        # Check: did the safety check pass?
        if not data.get("safety_check_passed", True):
            return jsonify({
                "error": "Cannot advance — safety check did not pass. Resolve the issue before proceeding.",
                "current_state": current_state,
            }), 400
        
        # Check: is the workflow already complete?
        if current_state == "Complete":
            return jsonify({
                "error": "Workflow already complete. No further steps.",
                "current_state": current_state,
            }), 400
        
        # Find the next state
        current_index = STATE_ORDER.index(current_state)
        next_state = STATE_ORDER[current_index + 1]
        
        # Build the compliance log entry for the completed step
        log_entry = {
            "state": next_state,
            "action": data.get("notes", f"Advanced to {next_state}"),
            "confirmed_by": data.get("confirmed_by", "voice_agent"),
            "timestamp": now,
            "notes": data.get("notes", ""),
            "safety_check_passed": True,
        }
        
        # Build the update
        update_fields = {
            "safety_workflow.current_state": next_state,
            "updated_at": now,
        }
        
        # If this is the first step, record who started and when
        if current_state == "Not Started":
            update_fields["safety_workflow.started_at"] = now
            if data.get("technician_id"):
                update_fields["safety_workflow.technician_id"] = data["technician_id"]
            if data.get("target_config"):
                update_fields["safety_workflow.target_config"] = data["target_config"]
            # Also update the battery status to "Disassembly Started"
            update_fields["status"] = "Disassembly Started"
        
        # If completing, record the finish time
        if next_state == "Complete":
            update_fields["safety_workflow.completed_at"] = now
        
        collection.update_one(
            {"battery_id": battery_id},
            {
                "$set": update_fields,
                "$push": {"safety_workflow.compliance_log": log_entry},
            },
        )
        
        return jsonify({
            "battery_id": battery_id,
            "action": "advanced",
            "previous_state": current_state,
            "current_state": next_state,
            "log_entry": serialize_doc(log_entry),
            "is_complete": next_state == "Complete",
        })
    
    return jsonify({"error": f"Unknown action '{action}'. Use 'advance' or 'log'."}), 400


# ============================================
# ENDPOINT: GET /api/batteries/<id>/blueprint
# ============================================
@app.route("/api/batteries/<battery_id>/blueprint", methods=["GET"])
def get_battery_blueprint(battery_id):
    """
    Return the upcycle blueprint for a specific battery.

    WHO USES THIS:
      Person 4 (React) → displays the step-by-step blueprint, module diagram,
                          tool checklist, and "Ready to Start" button
      Person 3 (Voice)  → ElevenLabs agent reads the steps during walkthrough

    WHAT IT RETURNS:
      The full upcycle_blueprint object from the Digital Twin, including:
      - target_system (topology, voltage, capacity)
      - module_assessment (which modules to keep/bypass)
      - required_tools and required_parts
      - pre_upcycle_checklist
      - upcycle_steps (the detailed step-by-step procedure)
      - post_upcycle_verification

    Returns 404 if battery not found, or 400 if battery was rejected.
    """
    battery = collection.find_one({"battery_id": battery_id})

    if not battery:
        return jsonify({"error": f"Battery {battery_id} not found"}), 404

    blueprint = battery.get("upcycle_blueprint")
    status = battery.get("status", "Unknown")

    if status == "Rejected for Recycling":
        return jsonify({
            "error": "This battery was rejected for recycling. No upcycle blueprint available.",
            "status": status,
            "rejection_reasons": battery.get("audit_manifest", {}).get("rejection_reasons", []),
        }), 400

    if not blueprint:
        return jsonify({
            "error": "No upcycle blueprint has been generated for this battery yet.",
            "status": status,
            "hint": "Run the audit pipeline with a CSV that produces a passing grade.",
        }), 404

    return jsonify({
        "battery_id": battery_id,
        "status": status,
        "health_grade": battery.get("health_grade"),
        "manufacturer": battery.get("manufacturer"),
        "blueprint": blueprint,
    })


# --- CHANGE STREAM WATCHER (Updated for Safety Workflow) ---
@app.route("/api/watch/disassembly", methods=["GET"])
def watch_disassembly_info():
    """
    Info endpoint explaining the Change Stream feature.
    
    The actual Change Stream runs as a separate background process
    (see the watch_safety_workflow() function below).
    This endpoint just explains how it works for the team.
    """
    return jsonify({
        "info": "Change Stream watcher for safety workflow state transitions",
        "how_to_run": "python -c \"from 03_api_endpoints import watch_safety_workflow; watch_safety_workflow()\"",
        "watched_fields": ["safety_workflow.current_state", "status"],
        "what_it_does": "Monitors safety state changes and triggers ElevenLabs agent with context for the next step",
        "for_person_3": "Import watch_safety_workflow() to auto-trigger your voice agent on state changes",
    })


def watch_safety_workflow():
    """
    MongoDB Change Stream that watches for safety workflow state changes.
    
    UPDATED FROM ORIGINAL:
    The old version only watched for status changes to "Disassembly Started".
    This new version watches for ANY change to safety_workflow.current_state,
    which means Person 3's voice agent gets notified at EVERY step transition.
    
    HOW IT WORKS:
    1. Technician completes a step → voice agent calls PATCH /api/batteries/:id/safety
    2. MongoDB updates safety_workflow.current_state
    3. This Change Stream detects the update INSTANTLY
    4. It fires the callback with the full battery document
    5. Person 3's code can then load the next step's instructions into the voice agent
    
    This creates a real-time feedback loop:
      Voice Agent ↔ API ↔ MongoDB ↔ Change Stream ↔ Voice Agent
    
    Run separately: python -c "from 03_api_endpoints import watch_safety_workflow; watch_safety_workflow()"
    """
    
    print("👀 Watching for safety workflow state changes...")
    print("   (Press Ctrl+C to stop)\n")
    
    # Watch for updates to the safety_workflow.current_state field
    # OR the status field (for backwards compatibility)
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
                battery_oid = change.get("documentKey", {}).get("_id")
                updated_fields = change.get("updateDescription", {}).get("updatedFields", {})
                
                # Get the full battery document
                battery = collection.find_one({"_id": battery_oid})
                
                if not battery:
                    continue
                
                bid = battery.get("battery_id", "Unknown")
                workflow = battery.get("safety_workflow", {})
                new_state = workflow.get("current_state", "Unknown")
                risks = battery.get("safety_risks", [])
                
                print(f"🔔 SAFETY STATE CHANGE: {bid}")
                print(f"   New state: {new_state}")
                
                if risks:
                    print(f"   ⚠ Active risks: {len(risks)}")
                    for risk in risks:
                        print(f"     - [{risk.get('severity')}] {risk.get('risk_type')}: {risk.get('description', '')[:60]}")
                
                # ================================================
                # PERSON 3: ADD YOUR ELEVENLABS TRIGGER HERE
                # 
                # The 'battery' dict has EVERYTHING the agent needs:
                #   battery["safety_workflow"]["current_state"] → which step we're on
                #   battery["safety_risks"] → hazards to warn about
                #   battery["audit_manifest"] → full Gemini analysis
                #   battery["manufacturer"] → specs for the battery
                #   battery["health_details"] → health data
                #
                # Example integration:
                #   from elevenlabs_agent import update_agent_context
                #   update_agent_context(
                #       battery_id=bid,
                #       current_state=new_state,
                #       safety_risks=risks,
                #       battery_data=battery,
                #   )
                # ================================================
                
                print(f"   → Person 3: ElevenLabs trigger placeholder")
                print()
    
    except KeyboardInterrupt:
        print("\n✓ Safety workflow watcher stopped.")


# ============================================
# MAIN — Start the server!
# ============================================
if __name__ == "__main__":
    print("\n🔋 ReVolt Exchange — API Server")
    print("=" * 40)
    
    # Verify database connection
    try:
        client.admin.command("ping")
        count = collection.count_documents({})
        print(f"✓ Connected to MongoDB Atlas ({count} batteries in database)")
    except Exception as e:
        print(f"✗ Database connection failed: {e}")
        print("  Check your .env file and MongoDB Atlas network settings")
        exit(1)
    
    # Print available endpoints for the team
    print("\n📡 Available endpoints:")
    print(f"  GET  /api/health                    → Health check")
    print(f"  GET  /api/batteries                 → List all batteries")
    print(f"  GET  /api/batteries/<id>            → Get battery details")
    print(f"  GET  /api/batteries/<id>/passport   → Get Battery Passport")
    print(f"  POST /api/batteries                 → Create/update battery")
    print(f"  POST /api/batteries/search          → Vector similarity search")
    print(f"  POST /api/batteries/identify        → Mystery battery ID (Whitepaper)")
    print(f"  GET  /api/batteries/<id>/safety     → Get safety workflow state")
    print(f"  PATCH /api/batteries/<id>/safety     → Advance/log safety step")
    print(f"  PATCH /api/batteries/<id>/status     → Update marketplace status")
    print(f"  GET  /api/batteries/<id>/blueprint  → Get upcycle blueprint")
    print()
    
    # Start the server
    # debug=True means it auto-reloads when you change the code
    # host="0.0.0.0" means it's accessible from other machines on your network
    app.run(
        host="0.0.0.0",
        port=5000,
        debug=True,
    )