/* =============================================================================
   mocks/manifest.mock.js
   
   Holds a static copy of a real audit result for frontend development.
   This lets you build and test all three pages without the FastAPI server
   running or Gemini being called.

   HOW TO USE:
     - USE_MOCK = true  --> AuditPage skips the real POST /api/audit call
                           and navigates straight to PassportPage with this data.
     - USE_MOCK = false --> AuditPage sends the real multipart form upload
                           to the FastAPI server at localhost:8000.

   TO SWITCH TO LIVE MODE:
     Set USE_MOCK = false in this file. That's the only change needed.
     AuditPage.jsx reads this flag at the top of submit().

   NOTE on battery_id:
     The real pipeline (audit.py) reads the battery sticker image via Gemini
     vision and populates battery_id from what it can read off the label.
     The mock below uses a clean BMW i3 example instead of the Coke can
     that the test image happened to produce.
   ============================================================================= */

export const MOCK_MANIFEST = {
  passport_id:                "RV-2026-001",
  audit_timestamp:            "2026-03-21T00:00:00Z",
  health_grade:               "B",
  state_of_health_pct:        82,
  remaining_useful_life_years: 4.2,
  cycle_count:                412,
  peak_temp_recorded_c:       54.1,
  fast_charge_ratio_pct:      68,
  thermal_stress_flag:        true,
  recommended_config:         "4S2P - bypass cell block C",
  risk_summary:
    "Thermal excursion detected at high discharge rates (80A+). Peak temperature 54.1 degrees C exceeds nominal operating range.",
  eu_compliant: true,
  status:       "listed",

  /* battery_id is populated by analyze_image() in audit.py.
     It reads the physical battery sticker via Gemini vision.
     Fields that cannot be read from the label default to "unknown" / 0. */
  battery_id: {
    manufacturer:       "BMW",
    model:              "i3 Rex 2019",
    chemistry:          "NMC",
    rated_capacity_kwh: 42.2,
    nominal_voltage_v:  355,
    manufacture_year:   2019,
    serial_number:      "BMW-NMC-2019-04963406",
  },

  /* openscad_code is NOT present in the mock yet.
     It requires a third Gemini call in build_full_manifest() -- see audit.py.
     When it exists, PassportCard.jsx renders it in the 3D Enclosure section.
     Leave this field absent (undefined) to show the pending placeholder. */
  // openscad_code: "// OpenSCAD goes here",
};

/* Flip to false once the FastAPI server and Gemini pipeline are running. */
export const USE_MOCK = true;
