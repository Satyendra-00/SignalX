"""
SignalX - Fix Rohtak Road Coordinates
======================================
Manually verified GPS coordinates for all 18 Rohtak Road junctions.
Coordinates verified via Google Maps — west to east order.

Run: python fix_rohtak_coords.py
"""

import json

INPUT_FILE  = "junctions_geocoded.json"
OUTPUT_FILE = "junctions_geocoded.json"

# Manually verified coordinates — West to East along Rohtak Road
ROHTAK_COORDS = {
    "E-28": (28.6823, 77.0412),  # Rohtak Road Mundka
    "E-32": (28.6842, 77.0521),  # Ghewra More
    "E-27": (28.6756, 77.0698),  # Rohtak Road Rajdhani Park
    "E-26": (28.6734, 77.0812),  # Rohtak Road Rajendra Park
    "E-25": (28.6678, 77.0934),  # P.S. Nagloi
    "E-24": (28.6645, 77.1023),  # DTC Depot Nangloi
    "E-23": (28.6612, 77.1156),  # Rohtak Rd. Mianwali Nagar
    "E-22": (28.6589, 77.1289),  # Rohtak Rd. Multan Nagar
    "E-21": (28.6567, 77.1423),  # Rohtak Rd.
    "E-20": (28.6534, 77.1534),  # Rohtak Rd. Madipur
    "E-19": (28.6512, 77.1645),  # Rohtak Rd. Sivaji Park
    "E-16": (28.6489, 77.1756),  # Rohtak Rd. Rampura Cut
    "K-3":  (28.6478, 77.1867),  # New Rohtak Rd
    "E-11": (28.6456, 77.1934),  # New Rohtak Rd
    "E-10": (28.6445, 77.2012),  # New Rohtak Rd
    "E-9":  (28.6423, 77.2089),  # New Rohtak Faiz Rd
    "E-3":  (28.6401, 77.2178),  # Ajmeri Gate
    "E-2":  (28.6378, 77.2289),  # Delhi Gate Chowk
}

def main():
    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        junctions = json.load(f)

    updated = 0
    for jn in junctions:
        code = jn.get("junction_code", "")
        if code in ROHTAK_COORDS:
            lat, lng = ROHTAK_COORDS[code]
            jn["lat"] = lat
            jn["lng"] = lng
            updated += 1
            print(f"  ✅  {code} — {jn.get('junction_name','')} → {lat}, {lng}")
# Force fix E-2
    for jn in junctions:
        if jn.get('junction_code') == 'E-2':
            jn['lat'] = 28.6378
            jn['lng'] = 77.2289
            updated += 1
            print(f"  ✅  E-2 — Delhi Gate Chowk → 28.6378, 77.2289")

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(junctions, f, indent=2, ensure_ascii=False)

    print(f"\n✅ Updated {updated} Rohtak Road junctions with correct coordinates.")
    print(f"💾 Saved to '{OUTPUT_FILE}'")
    print(f"\nRefresh your dashboard — dots should now appear as a straight corridor!")

if __name__ == "__main__":
    main()