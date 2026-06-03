"""
SignalX - Junction Geocoder
============================
Reads junctions.json, looks up GPS coordinates for each junction
using OpenStreetMap's free Nominatim API (no API key needed).

Usage:
    python geocode_junctions.py

Output:
    junctions_geocoded.json  — same data + lat/lng added
    geocode_failed.txt       — junctions that couldn't be located
"""

import json
import time
import urllib.request
import urllib.parse

INPUT_FILE  = "junctions.json"
OUTPUT_FILE = "junctions_geocoded.json"
FAILED_FILE = "geocode_failed.txt"

# Nominatim requires a user-agent header
HEADERS = {"User-Agent": "SignalX-Delhi-Traffic/1.0"}


def geocode(query):
    """Search OpenStreetMap for a place, return (lat, lng) or (None, None)."""
    params = urllib.parse.urlencode({
        "q": query,
        "format": "json",
        "limit": 1,
        "countrycodes": "in",
    })
    url = f"https://nominatim.openstreetmap.org/search?{params}"
    req = urllib.request.Request(url, headers=HEADERS)

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            results = json.loads(resp.read().decode())
            if results:
                return float(results[0]["lat"]), float(results[0]["lon"])
    except Exception as e:
        print(f"      ⚠️  API error: {e}")

    return None, None


def clean_junction_name(raw_name):
    """Remove 'Jn. Code:- XXX' suffix from junction name if present."""
    import re
    cleaned = re.sub(r"\s*Jn\.?\s*Code[:\-]+\s*[A-Z0-9\-]+", "", raw_name)
    return cleaned.strip(" .,")


def main():
    # Load data
    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        junctions = json.load(f)

    print(f"📍 Geocoding {len(junctions)} junctions using OpenStreetMap...\n")
    print("    (This will take a few minutes — respecting API rate limits)\n")

    failed = []
    found  = 0

    for i, jn in enumerate(junctions, 1):
        raw_name = jn.get("junction_name") or ""
        code     = jn.get("junction_code") or "?"
        district = jn.get("district") or ""

        # Clean the name
        clean_name = clean_junction_name(raw_name)

        # Try progressively simpler queries until we get a result
        queries = [
            f"{clean_name}, {district}, Delhi, India",
            f"{clean_name}, Delhi, India",
            f"{clean_name}, Delhi",
        ]

        lat, lng = None, None
        for query in queries:
            lat, lng = geocode(query)
            if lat:
                break
            time.sleep(1)  # be polite to the API

        jn["junction_name"] = clean_name  # fix the name too
        jn["lat"] = lat
        jn["lng"] = lng

        if lat:
            found += 1
            print(f"  [{i:03}] ✅  {code} — {clean_name[:40]:<40} → {lat:.4f}, {lng:.4f}")
        else:
            failed.append(f"{code} — {clean_name}")
            print(f"  [{i:03}] ❌  {code} — {clean_name[:40]:<40} → NOT FOUND")

        # Nominatim allows max 1 request/second
        time.sleep(1.1)

    # Save results
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(junctions, f, indent=2, ensure_ascii=False)

    if failed:
        with open(FAILED_FILE, "w", encoding="utf-8") as f:
            f.write("\n".join(failed))
        print(f"\n⚠️  {len(failed)} junctions not found — listed in {FAILED_FILE}")

    print(f"\n✅ Done! {found}/{len(junctions)} junctions geocoded.")
    print(f"📁 Saved to '{OUTPUT_FILE}'")


if __name__ == "__main__":
    main()