import json

# JSON file load karo
with open("junctions_geocoded.json", "r", encoding="utf-8") as f:
    data = json.load(f)

# Route keywords
keywords = {
    "Mathura Road": ["mathura", "M-"],
    "Rohtak Road": ["rohtak", "E-2", "E-3"],
    "CV Raman": ["cv raman", "raman"],
}

# Route-wise search
for route, keys in keywords.items():

    matches = []

    for j in data:
        junction_name = str(j.get("junction_name") or "")
        junction_code = str(j.get("junction_code") or "")

        combined_text = (junction_name + " " + junction_code).lower()

        if any(k.lower() in combined_text for k in keys):
            matches.append(j)

    print(f"\n{'=' * 50}")
    print(f"{route}: {len(matches)} junctions found")
    print(f"{'=' * 50}")

    for j in matches:
        print(
            f"{str(j.get('junction_code') or 'N/A')} - "
            f"{str(j.get('junction_name') or 'N/A')}"
        )

print("\nSearch completed.")