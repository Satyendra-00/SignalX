"""
SignalX - Manual Coordinates Fix
==================================
Fill in the coordinates below for each missing junction.

How to get coordinates from Google Maps:
1. Go to maps.google.com
2. Search the junction name
3. Right-click on exact location
4. Click the coordinates shown at top (they get copied)
5. Paste lat and lng below

Run:
    python manual_fix.py
"""

import json

INPUT_FILE  = "junctions_geocoded.json"
OUTPUT_FILE = "junctions_geocoded.json"

# ─────────────────────────────────────────────────────────────────
# FILL IN COORDINATES BELOW
# Format: "JUNCTION_CODE": (latitude, longitude),
# For junctions with code "None", use the name as key (see bottom)
# ─────────────────────────────────────────────────────────────────

MANUAL_COORDS = {
    # Code    : (lat,       lng)
    "E-17"  : (28.6648,   77.1318),   # Punjabi Bagh Metro St
    "E-26"  : (None,      None),      # Rohtak Road Rajendra Park
    "F-12"  : (None,      None),      # Tilak Nagar Chaukandi
    "F-13"  : (None,      None),      # Metro St. Tilak Nagar
    "K-10"  : (None,      None),      # Arya Samaj Road Link Road
    "K-22"  : (None,      None),      # Pusa Road C.R. Wasan Marg
    "K-23"  : (None,      None),      # Pusa Road Gurudwara
    "K-24"  : (None,      None),      # Pusa Road Ravidass Marg
    "K-25"  : (None,      None),      # Pusa Road T. Sohan Lal Marg
    "K-39"  : (None,      None),      # Old Rajendra Nagar
    "K-06"  : (None,      None),      # D.B.G. Saraswati Marg
    "K-8"   : (None,      None),      # DBG Road
    "L-34"  : (None,      None),      # Devli More MCD Office
    "L-37"  : (None,      None),      # Tughlakabad Village
    "L-38"  : (None,      None),      # Lal Kuan MB Road
    "L-39"  : (None,      None),      # MCD School MB Rd
    "L-40"  : (None,      None),      # MB Road Prahladpur
    "L-53"  : (None,      None),      # LSR College Jamrudpur
    "L-54"  : (None,      None),      # Y Point
    "L-63"  : (None,      None),      # Govindpuri Gali No.12
    "L-65"  : (None,      None),      # Tara Apartment
    "L-66"  : (None,      None),      # M.B. Road Majidia
    "L-68"  : (None,      None),      # Surya Sen Marg
    "L-69"  : (None,      None),      # C.R. Park Market No.2
    "L-72"  : (None,      None),      # CR Park Pocket-40
    "L-87"  : (None,      None),      # Kohinoor Apartment
    "M-28"  : (None,      None),      # Anand Mai Marg
    "M-29"  : (None,      None),      # Anand Mai Marg
    "M-30"  : (None,      None),      # Road No.13 Govindpuri
    "M-31"  : (None,      None),      # Kalka Ji Depot-1
    "M-32"  : (None,      None),      # Kalka Ji Depot-2
    "M-33"  : (None,      None),      # Anand Mai Marg Okhla
    "M-35"  : (None,      None),      # Anand Mai Marg Xing
    "M-37"  : (None,      None),      # DD Motor D-Block
    "M-39"  : (None,      None),      # Anand Mai Marg
    "M-40"  : (None,      None),      # P.S. Okhla Anand Mai Marg
}

# ─────────────────────────────────────────────────────────────────


def main():
    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        junctions = json.load(f)

    updated = 0
    skipped = 0

    for jn in junctions:
        code = jn.get("junction_code", "")
        if code in MANUAL_COORDS:
            lat, lng = MANUAL_COORDS[code]
            if lat is not None and lng is not None:
                jn["lat"] = lat
                jn["lng"] = lng
                updated += 1
                print(f"  ✅  {code} — {jn.get('junction_name', '')} → {lat}, {lng}")
            else:
                skipped += 1

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(junctions, f, indent=2, ensure_ascii=False)

    total_with_coords = sum(1 for jn in junctions if jn.get("lat"))

    print(f"\n✅ Updated {updated} junctions.")
    print(f"⏭️  Skipped {skipped} (still None — fill them in later).")
    print(f"📍 Total junctions with coordinates: {total_with_coords}/218")
    print(f"💾 Saved to '{OUTPUT_FILE}'")


if __name__ == "__main__":
    main()