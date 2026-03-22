"""
generate_random.py — Generate a random battery telemetry CSV
=============================================================
Each run creates a fresh .tests/random_telemetry.csv with a
completely random battery profile. Then test it with:

  python .scripts/generate_random.py
  python .scripts/audit.py .tests/random_telemetry.csv

That's it. Run it as many times as you want — each one is different.
"""

import csv
import random
from datetime import datetime, timedelta

PROFILES = [
    {"name": "Bay Area Commuter",     "chemistry": "NMC", "cycles": (150, 400),  "soh": (88, 97), "ambient": (12, 28),  "max_current": (30, 55),   "charge_current": (20, 40),   "temp_ceil": 38, "v_base": 3.7, "cells": 96},
    {"name": "Fleet Delivery Van",    "chemistry": "LFP", "cycles": (400, 800),  "soh": (78, 88), "ambient": (15, 32),  "max_current": (50, 80),   "charge_current": (30, 60),   "temp_ceil": 45, "v_base": 3.2, "cells": 112},
    {"name": "Weekend Warrior",       "chemistry": "NMC", "cycles": (100, 250),  "soh": (92, 98), "ambient": (10, 25),  "max_current": (25, 45),   "charge_current": (15, 35),   "temp_ceil": 35, "v_base": 3.7, "cells": 96},
    {"name": "Nordic Fleet Bus",      "chemistry": "LFP", "cycles": (600, 1200), "soh": (72, 82), "ambient": (-10, 15), "max_current": (60, 100),  "charge_current": (40, 70),   "temp_ceil": 42, "v_base": 3.2, "cells": 120},
    {"name": "Texas Rideshare",       "chemistry": "NMC", "cycles": (800, 1400), "soh": (65, 78), "ambient": (28, 42),  "max_current": (70, 120),  "charge_current": (50, 90),   "temp_ceil": 52, "v_base": 3.7, "cells": 96},
    {"name": "Arizona Abuser",        "chemistry": "NMC", "cycles": (1200,2000), "soh": (50, 65), "ambient": (38, 50),  "max_current": (100, 170), "charge_current": (80, 155),  "temp_ceil": 68, "v_base": 3.7, "cells": 96},
    {"name": "Tropical Warehouse",    "chemistry": "NCA", "cycles": (500, 900),  "soh": (70, 82), "ambient": (25, 38),  "max_current": (45, 75),   "charge_current": (30, 55),   "temp_ceil": 48, "v_base": 3.6, "cells": 96},
    {"name": "German Autobahn",       "chemistry": "NMC", "cycles": (300, 600),  "soh": (84, 93), "ambient": (5, 22),   "max_current": (40, 70),   "charge_current": (25, 50),   "temp_ceil": 40, "v_base": 3.7, "cells": 108},
    {"name": "Salvage Yard Mystery",  "chemistry": "NMC", "cycles": (1500,2500), "soh": (40, 58), "ambient": (30, 48),  "max_current": (90, 160),  "charge_current": (70, 140),  "temp_ceil": 65, "v_base": 3.7, "cells": 96},
    {"name": "Japanese Kei Truck",    "chemistry": "LFP", "cycles": (200, 500),  "soh": (86, 95), "ambient": (8, 30),   "max_current": (20, 40),   "charge_current": (15, 30),   "temp_ceil": 36, "v_base": 3.2, "cells": 100},
    {"name": "Dubai Taxi Fleet",      "chemistry": "NCA", "cycles": (900, 1600), "soh": (58, 72), "ambient": (35, 52),  "max_current": (80, 130),  "charge_current": (60, 110),  "temp_ceil": 60, "v_base": 3.6, "cells": 96},
    {"name": "Canadian School Bus",   "chemistry": "LFP", "cycles": (300, 700),  "soh": (80, 90), "ambient": (-15, 20), "max_current": (40, 65),   "charge_current": (25, 45),   "temp_ceil": 40, "v_base": 3.2, "cells": 116},
]

OUTPUT = ".tests/random_telemetry.csv"

def generate():
    p = random.choice(PROFILES)
    cycles = random.randint(*p["cycles"])
    soh = round(random.uniform(*p["soh"]), 1)

    rows = []
    start = datetime(random.randint(2021, 2025), random.randint(1, 12), random.randint(1, 28), random.randint(5, 10))

    for session in range(5):
        charging = random.random() < 0.3
        ambient = random.uniform(*p["ambient"])
        avg_current = -random.uniform(*p["charge_current"]) if charging else random.uniform(p["max_current"][0] * 0.5, p["max_current"][1])
        soc = random.uniform(15, 40) if charging else random.uniform(60, 95)
        dur = random.randint(15, 50)
        t = start + timedelta(hours=session * 3 + random.uniform(0, 1))

        for i in range(12):
            current = avg_current + random.uniform(-8, 8)
            if p["soh"][1] < 70 and random.random() > 0.7:
                current *= random.uniform(1.1, 1.4)

            cell_v = (p["v_base"] - 0.5) + (soc / 100)
            ir = random.uniform(0.005, 0.01) if soh < 70 else random.uniform(0.001, 0.003)
            pack_v = (cell_v - abs(current) * ir) * p["cells"] + random.uniform(-3, 3)
            pack_v = max(pack_v, p["v_base"] * p["cells"] * 0.7)

            temp = ambient + abs(current) * random.uniform(0.08, 0.15) + i * (0.8 if abs(avg_current) > 80 else 0.2) + random.uniform(-2, 2)
            temp = min(temp, p["temp_ceil"] + random.uniform(-3, 3))
            temp = max(temp, -20)

            cap = soh * 0.75
            if current > 0:
                soc -= (abs(current) * 5 / 60) / max(cap, 30) * 100 * 0.08
            else:
                soc += (abs(current) * 5 / 60) / max(cap, 30) * 100 * 0.06
            soc = max(5, min(98, soc))

            rows.append({
                "timestamp": (t + timedelta(minutes=i * dur / 12)).strftime("%Y-%m-%d %H:%M"),
                "voltage_v": round(pack_v, 1),
                "current_a": round(abs(current), 1),
                "temp_c": round(temp, 1),
                "soc_pct": round(soc, 1),
                "cycle_count": cycles,
            })

    with open(OUTPUT, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["timestamp", "voltage_v", "current_a", "temp_c", "soc_pct", "cycle_count"])
        w.writeheader()
        w.writerows(rows)

    print(f"\n🔋 Generated: {OUTPUT}")
    print(f"   Profile:  {p['name']}")
    print(f"   Chemistry:{p['chemistry']}")
    print(f"   Cycles:   {cycles}")
    print(f"   SOH:      {soh}%")
    print(f"   Voltage:  {min(r['voltage_v'] for r in rows)}V – {max(r['voltage_v'] for r in rows)}V")
    print(f"   Temp:     {min(r['temp_c'] for r in rows)}°C – {max(r['temp_c'] for r in rows)}°C")
    print(f"   Current:  max {max(r['current_a'] for r in rows)}A")
    print(f"\n   Now run:  python .scripts/audit.py .tests/random_telemetry.csv")

if __name__ == "__main__":
    generate()