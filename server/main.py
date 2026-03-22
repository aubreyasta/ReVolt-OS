# =============================================================================
# server/main.py -- FastAPI server for ReVolt OS
#
# Run with:  uvicorn main:app --reload --port 8000
#
# This file wraps the audit functions from audit.py in HTTP endpoints.
# It does NOT contain any AI logic itself -- that all lives in audit.py.
#
# ENDPOINTS:
#   GET  /api/health
#     Quick liveness check. Visit http://localhost:8000/api/health in browser.
#
#   POST /api/audit
#     Accepts multipart/form-data with two files:
#       image    -- battery sticker JPG or PNG
#       csv_file -- telemetry cycle log CSV
#     Calls build_full_manifest() in audit.py.
#     Returns the full manifest JSON.
#     Frontend: AuditPage.jsx submits to this endpoint when USE_MOCK=false.
#
#   GET  /api/batteries/{passport_id}
#     Fetch a stored battery passport by ID from MongoDB.
#     STUB -- returns 501 until MongoDB is wired (see MONGODB TODO below).
#     Frontend: PassportPage.jsx will call this for deep-link support.
#
#   POST /api/batteries/{passport_id}/log-milestone
#     Log a safety assembly milestone for a battery.
#     Called by the ElevenLabs agent tool "log_milestone" mid-conversation.
#     Also callable manually from AssemblyPage.jsx as a fallback.
#     STUB -- prints to console until MongoDB is wired.
#
# CORS:
#   Allows requests from the Vite dev server (localhost:5173).
#   In production, update allow_origins to your actual domain.
#   During development, Vite's proxy (vite.config.js) handles /api/* routing
#   so CORS is not strictly needed, but is kept here for direct API calls.
#
# ENVIRONMENT:
#   Requires server/.env with:
#     GEMINI_API_KEY=your_key_here
#   audit.py loads this via python-dotenv.
#
# FILE LAYOUT:
#   server/
#     main.py          <-- this file
#     audit.py         <-- Gemini AI pipeline functions
#     requirements.txt <-- pip dependencies
#     .env             <-- GEMINI_API_KEY (do not commit this file)
# =============================================================================

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import tempfile
import os
import json
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# audit.py must be in the same directory as this file
from audit import build_full_manifest

app = FastAPI(title="ReVolt OS API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# -----------------------------------------------------------------------------
# GET /api/health
# -----------------------------------------------------------------------------
@app.get("/api/health")
def health():
    return {"status": "ok", "service": "ReVolt OS"}


# -----------------------------------------------------------------------------
# POST /api/audit
#
# Accepts two uploaded files, saves them to a temp directory, and passes the
# paths to build_full_manifest() in audit.py.
#
# The temp directory is cleaned up automatically when the with-block exits.
# This means audit.py functions must finish reading the files before the
# with-block closes -- they do, because build_full_manifest() is synchronous.
#
# Field names in the multipart form must match the parameter names here:
#   "image"    --> matches form.append("image", file) in AuditPage.jsx
#   "csv_file" --> matches form.append("csv_file", file) in AuditPage.jsx
# -----------------------------------------------------------------------------
@app.post("/api/audit")
async def run_audit(
    image:    UploadFile = File(..., description="Battery sticker JPG or PNG"),
    csv_file: UploadFile = File(..., description="Telemetry cycle log CSV"),
):
    # Validate image MIME type
    if not image.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Image must be JPG or PNG")

    # CSV MIME type validation is lenient -- browsers send varying values
    # for .csv files (text/csv, application/octet-stream, etc.)

    with tempfile.TemporaryDirectory() as tmpdir:
        image_path = os.path.join(tmpdir, image.filename or "sticker.jpg")
        csv_path   = os.path.join(tmpdir, csv_file.filename or "telemetry.csv")

        # Write uploaded file bytes to disk
        with open(image_path, "wb") as f:
            f.write(await image.read())
        with open(csv_path, "wb") as f:
            f.write(await csv_file.read())

        try:
            manifest = build_full_manifest(csv_path, image_path)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Audit failed: {str(e)}")

    # The telemetry_embedding is a large float list (~3072 values).
    # It is stored in MongoDB but excluded from the API response to the frontend
    # because the frontend does not display it and it adds ~100KB to the payload.
    manifest_for_client = {k: v for k, v in manifest.items() if k != "telemetry_embedding"}
    return manifest_for_client


# -----------------------------------------------------------------------------
# GET /api/batteries/{passport_id}
#
# MONGODB TODO:
#   Replace the raise below with:
#
#     from pymongo import MongoClient
#     mongo = MongoClient(os.getenv("MONGODB_URI"))
#     db = mongo["revolt_os"]
#
#     doc = db["batteries"].find_one({"passport_id": passport_id})
#     if not doc:
#         raise HTTPException(status_code=404, detail="Passport not found")
#     doc["_id"] = str(doc["_id"])   # ObjectId is not JSON-serialisable
#     return doc
#
#   Also add MONGODB_URI to server/.env:
#     MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/revolt_os
#
#   Once this is live, PassportPage.jsx can fetch passports by ID,
#   enabling deep-linking and making the QR code a permanent scannable URL.
# -----------------------------------------------------------------------------
@app.get("/api/batteries/{passport_id}")
def get_battery(passport_id: str):
    raise HTTPException(
        status_code=501,
        detail="MongoDB not connected yet. Passport lookup coming in next sprint.",
    )


# -----------------------------------------------------------------------------
# POST /api/batteries/{passport_id}/log-milestone
#
# Called in two ways:
#   1. By the ElevenLabs agent as a webhook tool call (automatic, during voice session)
#   2. Optionally from AssemblyPage.jsx as a manual fallback (see toggleStep comments)
#
# Expected request body (JSON):
#   {
#     "step_index":   0,                                   (int, 0-based)
#     "step_label":   "Confirm PPE: insulated gloves...",  (string)
#     "completed_at": "2026-03-21T12:34:56Z"               (ISO string)
#   }
#
# MONGODB TODO:
#   Replace the print statement below with:
#
#     db["milestones"].insert_one({
#         "passport_id":  passport_id,
#         "step_index":   body.get("step_index"),
#         "step_label":   body.get("step_label"),
#         "completed_at": body.get("completed_at"),
#         "logged_at":    datetime.utcnow().isoformat(),
#     })
# -----------------------------------------------------------------------------
@app.post("/api/batteries/{passport_id}/log-milestone")
def log_milestone(passport_id: str, body: dict):
    print(f"[MILESTONE] {passport_id}: {body}")
    return {"logged": True, "passport_id": passport_id, "milestone": body}


# -----------------------------------------------------------------------------
# POST /api/batteries/{passport_id}/complete-assembly
#
# Called by AssemblyPage.jsx when the technician clicks "Complete Assembly"
# after all safety steps are checked off.
#
# Expected request body (JSON):
#   {
#     "passport_id":     "RV-2026-001",
#     "completed_at":    "2026-03-21T12:34:56.789Z",  (ISO string)
#     "steps_completed": 6,
#     "steps_total":     6,
#     "step_labels":     ["Confirm PPE...", "Verify battery...", ...],
#     "verified":        false   (frontend sends false; backend sets to true)
#   }
#
# Returns the same object with verified: true and signed_by added.
# The frontend merges this response into assembly_record and navigates to
# PassportPage, where PassportCard renders the green "DISASSEMBLY VERIFIED"
# badge because verified === true.
#
# MONGODB TODO:
#   1. Save the record to a "milestones" collection.
#   2. Update the battery document status to "disassembly_completed".
#   3. Sign the record for tamper-evidence (HMAC or JCS):
#
#      import hmac, hashlib, os
#      secret = os.getenv("SEAL_SECRET_KEY", "change-me-in-production")
#      canonical = (
#          body.get("passport_id", "") + "::" +
#          body.get("completed_at", "") + "::" +
#          str(body.get("steps_completed", "")) + "::" +
#          str(body.get("steps_total", "")) + "::" +
#          "|".join(body.get("step_labels", []))
#      )
#      signature = hmac.new(
#          secret.encode(), canonical.encode(), hashlib.sha256
#      ).hexdigest()
#
#   4. Add SEAL_SECRET_KEY to server/.env
#   5. Return signature in the response for display / verification.
# -----------------------------------------------------------------------------
@app.post("/api/batteries/{passport_id}/complete-assembly")
def complete_assembly(passport_id: str, body: dict):
    print(f"[ASSEMBLY COMPLETE] {passport_id}: {body.get('steps_completed')}/{body.get('steps_total')} steps")
    # STUB: return verified=True so the frontend badge renders as verified.
    # Replace with MongoDB save + HMAC signing when ready (see TODO above).
    return {
        **body,
        "verified":  True,
        "signed_by": "revolt-os-server",
    }
