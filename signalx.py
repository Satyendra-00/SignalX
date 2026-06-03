"""
SignalX - PDF Signal Timing Extractor
======================================
Run this script in the folder where all your Delhi signal PDFs are stored.

Usage:
    python extract_signals.py

Output:
    junctions.json  — structured database of all junctions
    failed.txt      — list of PDFs that couldn't be parsed (check manually)
"""

import os
import re
import json
import pdfplumber

# ─────────────────────────────────────────────
# CONFIG — set PDF_FOLDER to the folder containing your PDFs
# Example (Windows): PDF_FOLDER = r"C:\Users\YourName\Desktop\signals"
# Example (Mac/Linux): PDF_FOLDER = "/home/yourname/signals
PDF_FOLDER = r"D:\Desktop\Python_workshop\delhi_traffic_signals"   # "." means same folder as this script
OUTPUT_FILE = "junctions.json"
FAILED_FILE = "failed.txt"
# ─────────────────────────────────────────────


def extract_junction(pdf_path):
    """Extract all signal data from one PDF. Returns a dict or None."""
    data = {}

    with pdfplumber.open(pdf_path) as pdf:
        page = pdf.pages[0]
        text = page.extract_text() or ""
        tables = page.extract_tables()

    # ── Junction name ──────────────────────────────
    name_match = re.search(r"Junction Name[:\-]+\s*(.+)", text)
    data["junction_name"] = name_match.group(1).strip() if name_match else None

    # ── Junction code ──────────────────────────────
    code_match = re.search(r"Jn\.?\s*Code[:\-]+\s*([A-Z0-9\-]+)", text)
    data["junction_code"] = code_match.group(1).strip() if code_match else None

    # ── District ───────────────────────────────────
    dist_match = re.search(r"District\s*[:\-]+\s*(.+)", text)
    data["district"] = dist_match.group(1).strip() if dist_match else None

    # ── Circle ─────────────────────────────────────
    circle_match = re.search(r"Circle\s*[:\-]+\s*(.+)", text)
    data["circle"] = circle_match.group(1).strip() if circle_match else None

    # ── Signal active hours ────────────────────────
    signal_match = re.search(r"Signal Timing\s*[–\-]+\s*([\d:]+)\s*[–\-]+\s*([\d:]+)", text)
    if signal_match:
        data["signal_start"] = signal_match.group(1)
        data["signal_end"]   = signal_match.group(2)
    else:
        data["signal_start"] = None
        data["signal_end"]   = None

    # ── Blinker hours ──────────────────────────────
    blinker_match = re.search(r"Blinker Timing\s*[–\-]+\s*([\d:]+)\s*[–\-]+\s*([\d:]+)", text)
    if blinker_match:
        data["blinker_start"] = blinker_match.group(1)
        data["blinker_end"]   = blinker_match.group(2)
    else:
        data["blinker_start"] = None
        data["blinker_end"]   = None

    # ── Amber duration ─────────────────────────────
    amber_match = re.search(r"(\d+)\s*Sec\.\s*included in all Phases for AMBER", text)
    data["amber_sec"] = int(amber_match.group(1)) if amber_match else 4  # default 4

    # ── GPS coordinates (if present in PDF) ────────
    gps_match = re.search(r"(\d{2}\.\d{4,})\s*[,\s]+(\d{2}\.\d{4,})", text)
    if gps_match:
        data["lat"] = float(gps_match.group(1))
        data["lng"] = float(gps_match.group(2))
    else:
        data["lat"] = None  # fill manually later
        data["lng"] = None

    # ── Time plans from table ──────────────────────
    plans = []
    for table in tables:
        for row in table:
            # Look for rows that start with a plan number like "1." or "2."
            if not row or not row[0]:
                continue
            plan_no_match = re.match(r"(\d+)\.", str(row[0]).strip())
            if not plan_no_match:
                continue

            plan_no = int(plan_no_match.group(1))

            # Time slot is column 1
            time_slot = str(row[1]).strip() if row[1] else None

            # Parse start/end of time slot
            time_match = re.match(r"([\d:]+)\s*[-–]\s*([\d:]+)", time_slot or "")
            slot_start = time_match.group(1) if time_match else None
            slot_end   = time_match.group(2) if time_match else None

            # Remaining columns are phase durations
            phases = []
            for cell in row[2:]:
                cell_str = str(cell or "").strip()
                sec_match = re.search(r"(\d+)\s*Sec", cell_str, re.IGNORECASE)
                if sec_match:
                    phases.append(int(sec_match.group(1)))

            # Last column is total cycle time
            total_cycle = phases[-1] if phases else None
            phase_durations = phases[:-1] if len(phases) > 1 else phases

            plans.append({
                "plan_no":        plan_no,
                "time_slot":      time_slot,
                "slot_start":     slot_start,
                "slot_end":       slot_end,
                "phases":         phase_durations,
                "num_phases":     len(phase_durations),
                "total_cycle_sec": total_cycle,
            })

    data["plans"] = plans
    data["source_file"] = os.path.basename(pdf_path)

    return data


def main():
    pdf_files = [
        os.path.join(PDF_FOLDER, f)
        for f in os.listdir(PDF_FOLDER)
        if f.lower().endswith(".pdf")
    ]

    if not pdf_files:
        print("❌ No PDF files found in:", os.path.abspath(PDF_FOLDER))
        return

    print(f"📂 Found {len(pdf_files)} PDF files. Starting extraction...\n")

    results = []
    failed  = []

    for i, path in enumerate(sorted(pdf_files), 1):
        try:
            junction = extract_junction(path)
            results.append(junction)
            name = junction.get("junction_name") or "Unknown"
            code = junction.get("junction_code") or "?"
            plans_count = len(junction.get("plans", []))
            print(f"  [{i:03}] ✅  {code} — {name}  ({plans_count} plan(s))")
        except Exception as e:
            failed.append(path)
            print(f"  [{i:03}] ❌  {os.path.basename(path)} — ERROR: {e}")

    # Save results
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    if failed:
        with open(FAILED_FILE, "w") as f:
            f.write("\n".join(failed))
        print(f"\n⚠️  {len(failed)} PDFs failed — listed in {FAILED_FILE}")

    print(f"\n✅ Done! {len(results)} junctions saved to '{OUTPUT_FILE}'")
    print(f"📍 {sum(1 for r in results if r['lat'])} have GPS coordinates")
    print(f"📋 {sum(len(r['plans']) for r in results)} total time plans extracted")


if __name__ == "__main__":
    main()