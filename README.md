# SignalX

SignalX is a browser-based road navigation demo for Delhi junction data. It draws an OSRM driving route, looks up OpenStreetMap traffic-signal nodes near that route, and displays route progress and local signal schedule records.

**Signal phases, countdowns, and speed guidance are simulations.** SignalX has no connection to live traffic conditions or signal controllers. Do not use the estimates to make driving decisions.

**Demo:** <https://signall-x.vercel.app/>

## Run locally

Serve the repository root over HTTP (the browser fetches the JSON data files):

```bash
python -m http.server 8000
```

Open <http://localhost:8000>. Enter two listed junctions or latitude/longitude coordinates, then select **GO**. GPS is optional; without it, the demo vehicle advances along the route at a fixed speed. Browser geolocation requires permission and a secure context (localhost is permitted).

The demo uses public OSRM, OpenStreetMap Overpass, and OpenStreetMap tile services. They may be rate-limited or unavailable. Signal lookup is limited in the browser and cached for a short period.

## Project structure

| File | Purpose |
| --- | --- |
| `index.html` | Redirects the site root to the dashboard |
| `dashboard.html` | Dashboard layout and styles |
| `dashboard-app.js` | Map UI, route progress, GPS, and simulated guidance |
| `route-engine.js` | OSRM routing, Overpass lookup, route geometry, and signal matching |
| `signalx_map.html` | Separate dataset browser for junctions and local plans |
| `junctions.json` | Extracted Delhi junction and schedule data |
| `junctions_geocoded.json` | Dashboard and map dataset with coordinates |
| `signalx.py` | Extracts schedule records from PDFs in `delhi_traffic_signals/` |
| `signal_engine.py` | Command-line timing and speed-guidance prototype |
| `traffic.py`, `delhi_traffic_signals/` | PDF download and source timing documents |

The two JSON files currently contain 218 junction records and 879 schedule plans. Treat these schedules as source data for a demonstration, not verified live controller state.

## Development

The browser app has no build step or JavaScript package dependencies. The route engine has Node's built-in test suite:

```bash
node --test route-engine.test.js
```

The PDF extraction utility requires `pdfplumber`; the PDF downloader requires `requests`. The static dashboard does not require Python packages.

## Data and privacy

Junction search runs in the browser against the local JSON file. When a route is requested, its endpoint coordinates are sent to the public OSRM service; the route bounds are sent to Overpass for nearby mapped signals. If GPS is enabled, the browser supplies location to the dashboard, which uses it for route progress. SignalX does not include a project backend for storing location history.

## Project team

- **Satyendra Singh** ? Data and development
- **Riya Arora** ? Research and MIS
- **Shraddha Mishra** ? UI/UX design
