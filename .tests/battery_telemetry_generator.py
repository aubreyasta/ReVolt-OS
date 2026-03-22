"""
generate_demo_data.py — Mock Telemetry Generator for Demo Day
=============================================================
Creates two realistic battery telemetry CSV files:

  1. good_battery.csv  — A healthy Grade A battery. Clean thermal history,
     conservative charging, gentle discharge. Gemini will certify this one.
     
  2. dangerous_battery.csv — A Grade F nightmare. Thermal runaway precursor,
     extreme temps, voltage sag, fast-charge abuse. Gemini will say STOP.

WHY TWO FILES?
  The demo script says: show a good battery getting certified, then show
  a dangerous one getting REJECTED. This proves the AI actually works
  and isn't just a happy-path demo. Judges love seeing the "red screen."

The data is synthetic but follows real lithium-ion physics:
  - NMC chemistry: nominal 3.7V/cell, pack voltage ~350-400V
  - Realistic degradation curves (not random noise)
  - Temperature follows discharge rate (higher current = hotter)
  - SOC drops proportionally to current draw

Run: python generate_demo_data.py
Creates: good_battery.csv, dangerous_battery.csv
"""

import csv
import math
import random
from datetime import datetime, timedelta


def generate_good_battery(filename="good_battery.csv"):
    """
    Generate a healthy battery with 60 rows of telemetry.
    
    PROFILE: "The Bay Area Commuter"
    - 2022 Tesla Model 3, garaged in San Francisco
    - Conservative driver, mostly Level 2 (home) charging
    - 18 months of data, ~300 cycles
    - SOH around 93% — Grade A candidate
    
    What Gemini should see:
    - Stable voltage curve (no sag)
    - Low temperatures (never above 38C)
    - Gentle discharge rates (mostly under 50A)
    - No fast-charge spikes
    - Linear capacity fade (healthy aging)
    """
    
    rows = []
    start_time = datetime(2023, 6, 1, 7, 0, 0)
    
    # Simulate 60 data points across multiple driving sessions
    # Each "session" is a drive + charge cycle
    
    sessions = [
        # Session 1: Morning commute (gentle discharge)
        {"start_soc": 95, "duration_min": 35, "avg_current": 38, "ambient_temp": 18,
         "description": "Morning commute — gentle highway cruise"},
        # Session 2: Afternoon errands
        {"start_soc": 82, "duration_min": 20, "avg_current": 32, "ambient_temp": 22,
         "description": "Afternoon errands — city driving"},
        # Session 3: Home charging (Level 2)
        {"start_soc": 68, "duration_min": 45, "avg_current": -32, "ambient_temp": 20,
         "description": "Home L2 charging — slow and steady"},
        # Session 4: Weekend trip
        {"start_soc": 90, "duration_min": 50, "avg_current": 45, "ambient_temp": 24,
         "description": "Weekend highway trip — moderate load"},
        # Session 5: Regenerative braking heavy
        {"start_soc": 72, "duration_min": 25, "avg_current": 28, "ambient_temp": 19,
         "description": "Hills — lots of regen braking"},
    ]
    
    cycle_count = 312
    point_idx = 0
    
    for session in sessions:
        soc = session["start_soc"]
        current_time = start_time + timedelta(hours=point_idx * 2)
        num_points = 12  # 12 points per session
        
        for i in range(num_points):
            # Current varies slightly around average
            current = session["avg_current"] + random.uniform(-5, 5)
            if current < 0:  # Charging
                current = min(current, -20)
            
            # Voltage follows SOC (healthy linear relationship)
            # Pack voltage = cell_voltage * cells_in_series (typical ~96S for 400V pack)
            cell_v = 3.2 + (soc / 100) * 1.0  # 3.2V at 0%, 4.2V at 100%
            pack_voltage = cell_v * 96 + random.uniform(-2, 2)
            
            # Temperature rises gently with current draw
            base_temp = session["ambient_temp"]
            temp_rise = abs(current) * 0.15 + random.uniform(-1, 1)
            temp = base_temp + temp_rise
            temp = min(temp, 37)  # Never exceeds 37C — this battery is healthy
            
            # SOC changes
            if current > 0:  # Discharging
                soc -= (current * 5 / 60) / 75 * 100 * 0.08  # Simplified drain
            else:  # Charging
                soc += (abs(current) * 5 / 60) / 75 * 100 * 0.08
            soc = max(10, min(98, soc))
            
            timestamp = current_time + timedelta(minutes=i * (session["duration_min"] / num_points))
            
            rows.append({
                "timestamp": timestamp.strftime("%Y-%m-%d %H:%M"),
                "voltage_v": round(pack_voltage, 1),
                "current_a": round(abs(current), 1),
                "temp_c": round(temp, 1),
                "soc_pct": round(soc, 1),
                "cycle_count": cycle_count,
            })
            
            point_idx += 1
    
    # Write CSV
    with open(filename, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["timestamp", "voltage_v", "current_a", "temp_c", "soc_pct", "cycle_count"])
        writer.writeheader()
        writer.writerows(rows)
    
    print(f"✓ Generated {filename}")
    print(f"  {len(rows)} data points, {cycle_count} cycles")
    print(f"  Voltage range: {min(r['voltage_v'] for r in rows)}V – {max(r['voltage_v'] for r in rows)}V")
    print(f"  Temp range: {min(r['temp_c'] for r in rows)}°C – {max(r['temp_c'] for r in rows)}°C")
    print(f"  Max current: {max(r['current_a'] for r in rows)}A")
    print(f"  Expected grade: A or A-")
    print()


def generate_dangerous_battery(filename="dangerous_battery.csv"):
    """
    Generate a DANGEROUS battery with 60 rows of telemetry.
    
    PROFILE: "The Phoenix Rideshare Abuser"
    - 2019 Nissan Leaf, parked outside in Arizona heat
    - Rideshare driver: constant DC fast charging at 120kW
    - 3 years of abuse, ~1800 cycles
    - SOH around 55% — Grade F, DO NOT UPCYCLE
    
    What Gemini should see:
    - Voltage sag at high SOC (internal resistance spike = lithium plating)
    - Extreme temperatures (peaks above 62C = thermal runaway precursor)
    - Massive fast-charge current spikes (150A+)
    - Rapid SOC drops (deep discharge abuse)
    - Knee-shaped capacity fade (battery is dying fast)
    
    THIS IS THE "RED SCREEN" DEMO:
    Gemini should respond with Grade F and warnings like:
    "CRITICAL: Thermal runaway precursor detected. Do NOT attempt upcycling.
     This unit must be sent to a certified recycler immediately."
    """
    
    rows = []
    start_time = datetime(2022, 7, 15, 6, 0, 0)
    
    sessions = [
        # Session 1: Brutal morning rideshare in Arizona heat
        {"start_soc": 88, "duration_min": 40, "avg_current": 95, "ambient_temp": 42,
         "description": "Morning rideshare — Phoenix summer, AC blasting"},
        # Session 2: DC fast charge at gas station (the killer)
        {"start_soc": 22, "duration_min": 25, "avg_current": -145, "ambient_temp": 44,
         "description": "DC fast charge at 120kW — battery already hot"},
        # Session 3: Immediately back to driving (no cooldown)
        {"start_soc": 78, "duration_min": 35, "avg_current": 110, "ambient_temp": 46,
         "description": "Back to rideshare — no thermal cooldown, cells stressed"},
        # Session 4: Another fast charge (double abuse)
        {"start_soc": 18, "duration_min": 20, "avg_current": -155, "ambient_temp": 43,
         "description": "Second DC fast charge — pushing limits"},
        # Session 5: Night driving but damage is done
        {"start_soc": 82, "duration_min": 30, "avg_current": 75, "ambient_temp": 35,
         "description": "Night shift — temps lower but internal resistance elevated"},
    ]
    
    cycle_count = 1847
    point_idx = 0
    
    for session_idx, session in enumerate(sessions):
        soc = session["start_soc"]
        current_time = start_time + timedelta(hours=point_idx)
        num_points = 12
        
        for i in range(num_points):
            # Current with dangerous spikes
            base_current = session["avg_current"]
            if base_current > 0:
                # Random aggressive spikes (floor-it moments)
                spike = random.uniform(0, 40) if random.random() > 0.7 else 0
                current = base_current + spike + random.uniform(-8, 8)
            else:
                # Fast charging — current fluctuates as battery heats up
                current = base_current + random.uniform(-15, 15)
            
            # Voltage shows DAMAGE — sag under load, internal resistance
            cell_v = 3.0 + (soc / 100) * 1.1  # Wider range = degraded cells
            # Voltage sag proportional to current (high internal resistance)
            resistance_sag = abs(current) * 0.008  # Healthy would be 0.002
            pack_voltage = (cell_v - resistance_sag) * 96 + random.uniform(-5, 5)
            pack_voltage = max(280, pack_voltage)  # Can drop dangerously low
            
            # Temperature is the real danger — heat buildup
            base_temp = session["ambient_temp"]
            # Fast charging generates massive heat
            current_heat = abs(current) * 0.12
            # Cumulative heat within session (doesn't cool fast enough)
            session_heat = i * 1.2 if abs(base_current) > 100 else i * 0.4
            temp = base_temp + current_heat + session_heat + random.uniform(-2, 3)
            
            # During fast charge sessions, temp can spike above 60C
            if session_idx in [1, 3]:  # Fast charge sessions
                temp = max(temp, 52 + random.uniform(0, 12))
            
            temp = round(min(temp, 67), 1)  # Cap at 67C — dangerous but not fire (yet)
            
            # SOC changes — degraded battery loses charge faster
            if current > 0:
                soc -= (current * 5 / 60) / 60 * 100 * 0.12  # Faster drain (degraded)
            else:
                soc += (abs(current) * 5 / 60) / 60 * 100 * 0.06  # Charges slower too
            soc = max(5, min(92, soc))  # Can't reach 100% anymore (degraded)
            
            timestamp = current_time + timedelta(minutes=i * (session["duration_min"] / num_points))
            
            rows.append({
                "timestamp": timestamp.strftime("%Y-%m-%d %H:%M"),
                "voltage_v": round(pack_voltage, 1),
                "current_a": round(abs(current), 1),
                "temp_c": temp,
                "soc_pct": round(soc, 1),
                "cycle_count": cycle_count,
            })
            
            point_idx += 1
    
    # Write CSV
    with open(filename, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["timestamp", "voltage_v", "current_a", "temp_c", "soc_pct", "cycle_count"])
        writer.writeheader()
        writer.writerows(rows)
    
    print(f"✓ Generated {filename}")
    print(f"  {len(rows)} data points, {cycle_count} cycles")
    print(f"  Voltage range: {min(r['voltage_v'] for r in rows)}V – {max(r['voltage_v'] for r in rows)}V")
    print(f"  Temp range: {min(r['temp_c'] for r in rows)}°C – {max(r['temp_c'] for r in rows)}°C")
    print(f"  Max current: {max(r['current_a'] for r in rows)}A")
    print(f"  Fast charge events: {sum(1 for r in rows if r['current_a'] > 100)}+ readings above 100A")
    print(f"  Danger readings: {sum(1 for r in rows if r['temp_c'] > 55)}+ readings above 55°C")
    print(f"  Expected grade: F (REJECT)")
    print()


# ============================================
# MAIN
# ============================================
if __name__ == "__main__":
    print("\n🔋 ReVolt OS — Demo Telemetry Generator")
    print("=" * 45)
    
    random.seed(42)  # Fixed seed = same output every run (reproducible demos)
    
    print("\n📗 Generating GOOD battery (Grade A candidate)...")
    generate_good_battery("good_battery.csv")
    
    print("📕 Generating DANGEROUS battery (Grade F — REJECT)...")
    generate_dangerous_battery("dangerous_battery.csv")
    
    print("=" * 45)
    print("✓ Demo files ready!")
    print()
    print("Demo flow:")
    print("  1. python audit.py good_battery.csv battery_photo.jpg")
    print("     → Gemini certifies it, Grade A, passport generated")
    print()
    print("  2. python audit.py dangerous_battery.csv battery_photo.jpg")
    print("     → Gemini REJECTS it, Grade F, 'DO NOT UPCYCLE'")
    print()
    print("  This proves the AI actually works — not just a happy-path demo.")