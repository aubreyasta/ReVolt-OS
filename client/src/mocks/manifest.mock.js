// =============================================================================
// frontend/src/mocks/manifest.mock.js
//
// Static mock of a battery document for frontend development.
// Matches the schema from backend/01_schema_and_seed.py exactly.
//
// CHANGES FROM PREVIOUS VERSION:
//   - battery_id format: "RVX-2024-00001" (was "RV-2026-001")
//   - status values now Title Case: "Certified", "Listed", "Disassembly Started"
//     (was lowercase: "listed", "disassembly_completed")
//   - manufacturer is now a nested object (was battery_id sub-object)
//   - health_details replaces the flat fields (state_of_health_pct etc. are nested)
//   - safety_workflow is the new state machine field (replaces assembly_record)
//   - safety_risks replaces the flat thermal_stress_flag + risk_summary fields
//
// SCHEMA SOURCE: backend/01_schema_and_seed.py  create_collection_with_validation()
//
// FLIP TO LIVE:
//   Set USE_MOCK = false once the backend is running.
//   AuditPage.jsx POSTs to POST /api/batteries (Flask) or POST /api/audit (FastAPI).
//   PassportPage.jsx fetches GET /api/batteries/:id/passport.
// =============================================================================

export const MOCK_MANIFEST = {
  // --- Identity ---
  battery_id: "RVX-2024-00001",
  status: "Certified", // One of: Listed | Under Review | Certified | Sold | Disassembly Started

  // --- Manufacturer (populated by Gemini Vision in audit.py) ---
  manufacturer: {
    name: "CATL",
    model: "NMC811-72Ah",
    chemistry: "NMC",
    nominal_voltage: 3.7,
    nominal_capacity_kwh: 75.0,
    manufacture_date: "2021-03-15",
  },

  // --- Health (populated by Gemini telemetry audit in audit.py) ---
  health_grade: "A",
  health_details: {
    state_of_health_pct: 91.2,
    remaining_useful_life_years: 6.5,
    total_cycles: 580,
    peak_temp_recorded_c: 38.4,
    avg_discharge_rate_c: 0.5,
    physical_condition: "Excellent -- no visible damage",
    gemini_analysis_summary:
      "High-quality NMC pack from temperate climate. Low cycle count with conservative discharge history. Ideal for residential solar storage.",
    audit_timestamp: "2026-03-21T00:00:00Z",
  },

  // --- Telemetry summary (stats from the CSV, not the raw rows) ---
  telemetry_summary: {
    voltage_min: 3.0,
    voltage_max: 4.2,
    voltage_mean: 3.72,
    temp_min_c: 5.0,
    temp_max_c: 38.4,
    temp_mean_c: 22.1,
    capacity_fade_pct: 8.8,
    data_points_count: 5200,
    discharge_curve_shape: "Linear",
  },

  // --- Safety risks (Gemini-detected, from both vision and CSV) ---
  // Empty array = no risks detected for this battery.
  // When risks exist, AssemblyPage shows them in the RISK ALERT panel.
  // Each risk: { risk_type, severity, description, mitigation, detected_by }
  safety_risks: [],

  // --- Safety workflow (state machine, driven by AssemblyPage + backend) ---
  // current_state progression:
  //   Not Started -> Inspection -> Discharging -> Module Separation -> Reassembly -> Complete
  // compliance_log is appended to each time the voice agent or technician confirms a step.
  safety_workflow: {
    current_state: "Not Started",
    technician_id: null,
    target_config: "4S2P 48V Solar Stack",
    started_at: null,
    completed_at: null,
    compliance_log: [],
  },

  // --- Audit manifest (the Battery Passport core document) ---
  audit_manifest: {
    version: "1.0",
    generated_by: "Gemini (gemini-3-flash-preview)",
    passport_id: "RVX-2024-00001",
    grade: "A",
    recommended_use: ["Residential solar storage", "Light EV conversion"],
    warnings: [],
    eu_compliant: true,
    audit_timestamp: "2026-03-21T00:00:00Z",
  },

  // --- Listing (marketplace display) ---
  listing: {
    title: "Premium 75kWh NMC Pack -- Grade A -- Low Cycles",
    description:
      "Verified CATL NMC811 pack from a gently-used Model 3. Only 580 cycles, 91% SOH.",
    asking_price_usd: 8500.0,
    seller_id: "seller-001",
  },

  created_at: "2026-03-21T00:00:00Z",
  updated_at: "2026-03-21T00:00:00Z",
};

// Flip to false once the backend is running and POST /api/audit is live.
export const USE_MOCK = false;
