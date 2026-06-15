# SignalX 🚦
## Real-Time Signal-Aware Speed Guidance for Urban Drivers

SignalX is an urban mobility innovation that helps drivers reduce unnecessary stops at traffic signals by providing real-time, signal-aware speed guidance.

Unlike traditional navigation apps that only tell drivers **where to go**, SignalX helps them understand **how to drive between junctions** to maximize the chances of catching green lights, reducing fuel consumption, travel time, emissions, and stop-and-go traffic.

The system combines official traffic signal timing plans, real-time GPS tracking, and a signal phase prediction engine to recommend a safe speed for approaching upcoming intersections.

---

# ✨ Key Features

- Real-time GPS tracking
- Signal-aware route intelligence
- Traffic signal phase prediction
- Recommended safe speed guidance
- Live countdown timers for upcoming signals
- Color-coded driving recommendations
- Interactive map visualization
- No additional hardware required
- Works directly in a web browser

---

# 📊 Research Highlights

- **218 Signalized Junctions Mapped**
- **879 Signal Timing Plans Extracted**
- **Machine-Readable Signal Database Created**
- **Official Delhi Traffic Signal Data Utilized**
- **Designed for Expansion to Other Indian Cities**

---

# 🗂️ Required Files

Only the following four files are required to run the project:

```text
SignalX/
│
├── index.html
├── signalx_map.html
├── junctions.json
└── junctions_geocoded.json
```

No PDFs, Python scripts, or data-processing files are required for running the deployed prototype.

---

# 🚀 Running SignalX Locally

## Step 1 — Create a Folder

Create a new folder named:

```text
SignalX
```

---

## Step 2 — Add Required Files

Copy the following files into the folder:

```text
index.html
signalx_map.html
junctions.json
junctions_geocoded.json
```

---

## Step 3 — Open Terminal

Navigate to the project folder:

```bash
cd SignalX
```

---

## Step 4 — Start Local Server

Run:

```bash
python -m http.server 8000
```

---

## Step 5 — Open Browser

Visit:

```text
http://localhost:8000
```

---

## Step 6 — Allow Location Access

When prompted by the browser:

```text
Allow Location Permission
```

SignalX uses the Browser Geolocation API to track the driver's current location and provide live recommendations.

---

# 🌐 Using the Live Deployed Version

## Step 1 — Open SignalX

Open the deployed SignalX URL in any modern browser.

---

## Step 2 — Allow GPS Access

When the location permission popup appears:

```text
Allow
```

This enables real-time location tracking.

---

## Step 3 — Enter Source Junction

Choose the starting location.

Example:

```text
Mundka
```

---

## Step 4 — Enter Destination Junction

Choose the destination location.

Example:

```text
Delhi Gate
```

---

## Step 5 — Click GO

Press:

```text
GO
```

SignalX will:

- Generate the corridor route
- Load junction information
- Load signal timing plans
- Begin real-time route analysis

---

## Step 6 — Follow Live Recommendations

The dashboard continuously updates:

- Current Speed
- Distance to Next Signal
- Signal Status
- Time Remaining
- Recommended Safe Speed

---

# 🧠 How SignalX Calculates Speed Guidance

SignalX estimates the current signal phase using signal timing plans and a phase prediction engine.

The recommended speed is calculated using:

```text
Recommended Safe Speed
=
Distance to Junction
÷
Time Until Green
```

The recommendation is always intended to remain within safe and legal driving limits.

---

# 📍 Dashboard Guide

## Your Speed

Displays the current vehicle speed based on GPS data.

---

## Next Signal

Shows:

- Signal Name
- Current Phase
- Time Remaining

---

## Distance

Displays the remaining distance to the next junction.

---

## Recommended Speed

Displays the speed SignalX recommends maintaining to maximize the probability of reaching the next green light without stopping.

---

# 🚦 Signal Status Indicators

### 🟢 GO

You are likely to pass the upcoming junction during a green phase.

---

### 🟡 SLOW

Reduce speed slightly to synchronize with the next green window.

---

### 🔴 STOP

The upcoming signal is expected to be red upon arrival.

---

# ⚙️ Technology Stack

## Frontend

- HTML5
- CSS3
- JavaScript

## Mapping & Visualization

- Leaflet.js
- CartoCDN

## Data

- JSON
- OpenStreetMap
- Geoapify

## Browser APIs

- Geolocation API

---

# 🔬 System Workflow

### 1. Signal Timing Data Collection

Official traffic signal timing plans are collected from publicly available traffic management records.

↓

### 2. Signal Database Creation

Junction names, coordinates, cycle lengths, and timing plans are organized into machine-readable JSON datasets.

↓

### 3. GPS Tracking

The Browser Geolocation API continuously tracks the driver's position.

↓

### 4. Signal Phase Prediction

SignalX estimates the current signal phase using timing plans and timestamp-based calculations.

↓

### 5. Speed Recommendation

Distance and timing information are used to generate a recommended safe speed for the driver.

↓

### 6. Live Dashboard Updates

Recommendations are updated continuously as the vehicle moves along the route.

---

# 🎯 Vision

SignalX aims to become a signal-intelligence layer for urban mobility platforms by transforming static traffic signal data into actionable driving guidance.

The long-term vision is to support:

- Smarter Commutes
- Reduced Fuel Consumption
- Lower Emissions
- Improved Road Safety
- Better Urban Traffic Flow

across Indian cities.

---

# ⚠️ Disclaimer

SignalX is a research and demonstration prototype developed for hackathons and urban mobility innovation challenges.

Speed recommendations are advisory in nature and should always be followed within legal speed limits, road conditions, and applicable traffic regulations.

Drivers must always prioritize road safety and obey traffic laws.

---

# 👥 Team

### Satyendra Singh
**Data & Development Lead**

Responsible for:
- Signal Data Processing
- Phase Prediction Logic
- System Architecture

---

### Riya Arora
**Research & MIS Lead**

Responsible for:
- Research & Documentation
- Data Validation
- Project Analysis

---

### Shraddha Mishra
**UI/UX Design Lead**

Responsible for:
- Interface Design
- User Experience
- Dashboard Design

---

# 🏆 Hackathon Project

**SignalX**
### Real-Time Signal-Aware Speed Guidance for Urban Drivers

*"We don't just show the route. We show how to drive it."*
