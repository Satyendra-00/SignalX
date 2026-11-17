import json
from pathlib import Path

data_path = Path(__file__).resolve().with_name('junctions_geocoded.json')
with data_path.open(encoding='utf-8') as f:
    data = json.load(f)

rohtak_codes = ['E-2','E-3','E-9','E-10','E-11','E-16','E-19',
                'E-20','E-21','E-22','E-23','E-24','E-25',
                'E-26','E-27','E-28','E-32','K-3']

rohtak = [j for j in data if j.get('junction_code') in rohtak_codes]

for j in rohtak:
    print(j['junction_code'], '-', j['junction_name'])
    for p in j.get('plans', []):
        start = p.get('slot_start') or '?'
        end = p.get('slot_end') or '?'
        cycle = p.get('total_cycle_sec')
        phases = p.get('phases') or []
        print(f'  {start}-{end} | Cycle: {cycle if cycle is not None else "?"}s | Phases: {phases}')
    print()
