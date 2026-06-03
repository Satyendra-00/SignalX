"""
SignalX - Missing Junctions Geocoder (Geoapify)
=================================================
Automatically finds coordinates for the 36 missing junctions.

Steps:
1. Paste your Geoapify API key below
2. Run: python geocode_missing.py
"""

import json
import time
import urllib.request
import urllib.parse

# ─────────────────────────────────────────────
# PASTE YOUR GEOAPIFY API KEY HERE
API_KEY = "f19a51b0430d41eda21400ce79c9f6ee"
# ─────────────────────────────────────────────

INPUT_FILE  = "junctions_geocoded.json"
OUTPUT_FILE = "junctions_geocoded.json"

def geocode_geoapify(name, district=""):
    """Search for a junction using Geoapify API."""
    query = f"{name}, Delhi, India"
    params = urllib.parse.urlencode({
        "text": query,
        "apiKey": API_KEY,
        "countrycodes": "in",
        "filter": "rect:76.8,28.4,77.6,28.9",  # Delhi bounding box
        "limit": 1,
    })
    url = f"https://api.geoapify.com/v1/geocode/search?{params}"
    req = urllib.request.Request(url)

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode())
            features = data.get("features", [])
            if features:
                coords = features[0]["geometry"]["coordinates"]
                lng, lat = coords[0], coords[1]
                # Must be within Delhi
                if 28.4 < lat < 28.9 and 76.8 < lng < 77.6:
                    return lat, lng
    except Exception as e:
        print(f"      ⚠️  Error: {e}")
    return None, None


def main():
    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        junctions = json.load(f)

    # Only process junctions with missing coordinates
    missing = [jn for jn in junctions if not jn.get("lat")]
    print(f"🔍 Found {len(missing)} junctions without coordinates.")
    print(f"📡 Using Geoapify to geocode them...\n")

    found = 0

    for i, jn in enumerate(missing, 1):
        code = jn.get("junction_code", "?")
        name = jn.get("junction_name", "")
        district = jn.get("district", "")
        circle = jn.get("circle", "")

        # Try multiple search strategies
        queries = [
            f"{name} {circle} Delhi",
            f"{name} {district} Delhi",
            f"{name} Delhi",
        ]

        lat, lng = None, None
        for query in queries:
            lat, lng = geocode_geoapify(query)
            time.sleep(0.5)
            if lat:
                break

        jn["lat"] = lat
        jn["lng"] = lng

        if lat:
            found += 1
            print(f"  [{i:02}] ✅  {code} — {name[:40]:<40} → {lat:.4f}, {lng:.4f}")
        else:
            print(f"  [{i:02}] ❌  {code} — {name[:40]:<40} → NOT FOUND")

    # Save
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(junctions, f, indent=2, ensure_ascii=False)

    total = sum(1 for jn in junctions if jn.get("lat"))
    print(f"\n✅ Done! {found} new junctions geocoded.")
    print(f"📍 Total: {total}/218 junctions now have coordinates.")
    print(f"💾 Saved to '{OUTPUT_FILE}'")


if __name__ == "__main__":
    main()