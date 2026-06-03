"""
SignalX - Junction Geocoder v2
================================
Smarter geocoding using multiple search strategies + 
handles the already-found junctions from v1.

Put this in the same folder as junctions_geocoded.json and run:
    python geocode_v2.py
"""

import json
import time
import re
import urllib.request
import urllib.parse

INPUT_FILE  = "junctions_geocoded.json"   # output from v1 (has 76 already done)
OUTPUT_FILE = "junctions_geocoded.json"   # overwrite with improved version
FAILED_FILE = "geocode_failed.txt"

HEADERS = {"User-Agent": "SignalX-Delhi-Traffic/1.0"}

# Map district names to Delhi areas for better search
DISTRICT_AREA_MAP = {
    "Central":       "Central Delhi",
    "South":         "South Delhi",
    "South West":    "South West Delhi",
    "North":         "North Delhi",
    "North West":    "North West Delhi",
    "North East":    "North East Delhi",
    "East":          "East Delhi",
    "West":          "West Delhi",
    "New Delhi":     "New Delhi",
    "Shahdara":      "Shahdara Delhi",
    "Outer":         "Outer Delhi",
}

def geocode(query):
    params = urllib.parse.urlencode({
        "q": query,
        "format": "json",
        "limit": 1,
        "countrycodes": "in",
        "viewbox": "76.8,28.4,77.6,28.9",  # Delhi bounding box
        "bounded": 1,
    })
    url = f"https://nominatim.openstreetmap.org/search?{params}"
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            results = json.loads(resp.read().decode())
            if results:
                lat = float(results[0]["lat"])
                lng = float(results[0]["lon"])
                # Sanity check: must be within Delhi bounds
                if 28.4 < lat < 28.9 and 76.8 < lng < 77.6:
                    return lat, lng
    except Exception as e:
        print(f"        ⚠️  {e}")
    return None, None


def clean_name(raw):
    """Remove junction code suffix and clean up."""
    cleaned = re.sub(r"\s*Jn\.?\s*Code[:\-]+\s*[A-Z0-9\-]+", "", raw or "")
    cleaned = re.sub(r"\s*(Junction|Jn\.?|T-Point|T Point|Chowk)\s*$", "", cleaned, flags=re.IGNORECASE)
    return cleaned.strip(" .,:-")


def build_queries(jn):
    """Generate multiple search queries from most to least specific."""
    name     = clean_name(jn.get("junction_name", ""))
    district = jn.get("district", "")
    circle   = jn.get("circle", "")
    area     = DISTRICT_AREA_MAP.get(district, f"{district} Delhi")

    queries = []

    # Most specific: circle area + name
    if circle:
        queries.append(f"{name}, {circle}, Delhi, India")

    # With district area
    queries.append(f"{name}, {area}, India")

    # Just name + Delhi
    queries.append(f"{name}, Delhi, India")

    # Try circle name alone as a landmark
    if circle and circle.lower() not in name.lower():
        queries.append(f"{circle}, Delhi, India")

    return queries


def main():
    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        junctions = json.load(f)

    # Count how many already have coords
    already_done = sum(1 for jn in junctions if jn.get("lat"))
    missing      = [jn for jn in junctions if not jn.get("lat")]

    print(f"📍 {already_done} junctions already geocoded.")
    print(f"🔍 Attempting to geocode {len(missing)} missing junctions...\n")

    found_new = 0
    still_failed = []

    for i, jn in enumerate(missing, 1):
        code = jn.get("junction_code", "?")
        name = clean_name(jn.get("junction_name", ""))
        queries = build_queries(jn)

        lat, lng = None, None
        used_query = None

        for query in queries:
            lat, lng = geocode(query)
            time.sleep(1.1)
            if lat:
                used_query = query
                break

        jn["lat"] = lat
        jn["lng"] = lng
        jn["junction_name"] = name  # store cleaned name

        if lat:
            found_new += 1
            print(f"  [{i:03}] ✅  {code} — {name[:35]:<35} → {lat:.4f}, {lng:.4f}")
        else:
            still_failed.append(f"{code} — {name}")
            print(f"  [{i:03}] ❌  {code} — {name[:35]:<35} → NOT FOUND")

    # Save updated file
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(junctions, f, indent=2, ensure_ascii=False)

    if still_failed:
        with open(FAILED_FILE, "w", encoding="utf-8") as f:
            f.write("\n".join(still_failed))

    total_found = already_done + found_new
    print(f"\n✅ Done! {total_found}/218 junctions now have coordinates.")
    print(f"📁 Saved to '{OUTPUT_FILE}'")
    if still_failed:
        print(f"⚠️  {len(still_failed)} still missing — we'll handle those manually next.")

if __name__ == "__main__":
    main()