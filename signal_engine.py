import json
import time
from datetime import datetime

# ── Load junction data ──────────────────────────────────────────────
with open('junctions_geocoded.json') as f:
    all_junctions = json.load(f)

ROHTAK_CODES = [
    'E-2','E-3','E-9','E-10','E-11','E-16','E-19',
    'E-20','E-21','E-22','E-23','E-24','E-25',
    'E-26','E-27','E-28','E-32','K-3'
]

rohtak_junctions = [j for j in all_junctions if j.get('junction_code') in ROHTAK_CODES]


# ── Step 1: Get active plan for current time ────────────────────────
def get_active_plan(junction):
    now = datetime.now()
    current_minutes = now.hour * 60 + now.minute

    for plan in junction.get('plans', []):
        start = plan['slot_start']  # e.g. "08:00"
        end   = plan['slot_end']    # e.g. "23:00"

        sh, sm = map(int, start.split(':'))
        eh, em = map(int, end.split(':'))

        start_min = sh * 60 + sm
        end_min   = eh * 60 + em

        # Handle overnight plans like 22:30 - 06:00
        if start_min <= end_min:
            if start_min <= current_minutes < end_min:
                return plan
        else:
            if current_minutes >= start_min or current_minutes < end_min:
                return plan

    return None  # signal off (blinker mode)


# ── Step 2: Find position in cycle using epoch offset ───────────────
def get_cycle_position(cycle_length_sec):
    unix_now = int(time.time())
    position = unix_now % cycle_length_sec
    return position


# ── Step 3: Find which phase is active & seconds remaining ──────────
def get_phase_info(phases, cycle_position):
    elapsed = 0
    for i, duration in enumerate(phases):
        if elapsed + duration > cycle_position:
            seconds_remaining = (elapsed + duration) - cycle_position
            return {
                'phase_number': i + 1,
                'phase_duration': duration,
                'seconds_remaining': seconds_remaining,
                'is_first_phase': i == 0   # Phase 1 is usually the main green for main road
            }
        elapsed += duration
    return None


# ── Step 4: Recommend speed ─────────────────────────────────────────
def recommend_speed(distance_meters, seconds_remaining):
    if seconds_remaining < 5:
        return "🔴 Stop — light changing now"

    speed_mps   = distance_meters / seconds_remaining          # meters per second
    speed_kmph  = speed_mps * 3.6

    if speed_kmph < 10:
        return "🔴 Too slow to make it — prepare to stop"
    elif speed_kmph > 70:
        return "🔴 Too fast — wait for next green"
    elif 20 <= speed_kmph <= 60:
        return f"🟢 Drive at {int(speed_kmph)} km/h to catch green"
    else:
        return f"🟡 Drive at {int(speed_kmph)} km/h (marginal)"


# ── Step 5: Full signal status for one junction ─────────────────────
def get_signal_status(junction, distance_meters):
    code = junction.get('junction_code')
    name = junction.get('junction_name')

    plan = get_active_plan(junction)
    if not plan:
        return f"{code} {name} — 🟡 Blinker mode (off-peak)"

    cycle   = plan['total_cycle_sec']
    phases  = plan['phases']
    pos     = get_cycle_position(cycle)
    info    = get_phase_info(phases, pos)

    if not info:
        return f"{code} {name} — ⚠️ Could not determine phase"

    recommendation = recommend_speed(distance_meters, info['seconds_remaining'])

    print(f"\n{'='*50}")
    print(f"Junction : {code} — {name}")
    print(f"Time Slot: {plan['slot_start']} - {plan['slot_end']}")
    print(f"Cycle    : {cycle}s | Phases: {phases}")
    print(f"Position : {pos}s into cycle")
    print(f"Phase    : {info['phase_number']} of {len(phases)} "
          f"({info['seconds_remaining']}s remaining)")
    print(f"Distance : {distance_meters}m away")
    print(f"Advice   : {recommendation}")
    print(f"{'='*50}")


# ── DEMO: Run for all Rohtak Road junctions ─────────────────────────
if __name__ == "__main__":
    print(f"\nSignalX — Rohtak Road Corridor")
    print(f"Current time: {datetime.now().strftime('%H:%M:%S')}")
    print(f"Junctions loaded: {len(rohtak_junctions)}")

    # Simulate distances — as if you're driving from E-2 toward Mundka
    # In real app this comes from GPS. For demo, we use fixed distances.
    demo_distances = {
        'E-2': 300, 'E-9': 600, 'E-10': 400, 'E-11': 500,
        'K-3': 350, 'E-16': 700, 'E-19': 450, 'E-20': 300,
        'E-21': 550, 'E-22': 400, 'E-23': 600, 'E-24': 500,
        'E-25': 350, 'E-26': 450, 'E-27': 300, 'E-28': 600,
        'E-32': 500, 'E-3': 400
    }

    for junction in rohtak_junctions:
        code     = junction.get('junction_code', 'N/A')
        distance = demo_distances.get(code, 500)
        get_signal_status(junction, distance)