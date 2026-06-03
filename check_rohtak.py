import json

with open('junctions_geocoded.json') as f:
    data = json.load(f)

rohtak_codes = ['E-2','E-3','E-9','E-10','E-11','E-16','E-19',
                'E-20','E-21','E-22','E-23','E-24','E-25',
                'E-26','E-27','E-28','E-32','K-3']

rohtak = [j for j in data if j.get('junction_code') in rohtak_codes]

for j in rohtak:
    print(j['junction_code'], '-', j['junction_name'])
    for p in j.get('plans', []):
        print(f'  {p["slot_start"]}-{p["slot_end"]} | Cycle: {p["total_cycle_sec"]}s | Phases: {p["phases"]}')
    print()