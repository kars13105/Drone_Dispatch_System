# AEGIS — Autonomous Drone Dispatch Dashboard

Enterprise-grade 3D visualization frontend for the Time-Space A* Temporal Vehicle Routing solver.

---

## Tech Stack

| Layer | Library |
|---|---|
| Framework | React 18 + Vite |
| 3D Visualization | Deck.gl (`@deck.gl/react`, `@deck.gl/core`, `@deck.gl/layers`) |
| View Mode | `OrbitView` with `COORDINATE_SYSTEM.CARTESIAN` |
| UI / Styling | TailwindCSS |
| HTTP Client | Axios |
| Icons | Lucide React |
| Fonts | JetBrains Mono, Space Grotesk (Google Fonts) |

---

## Project Structure

```
src/
├── App.jsx                     # Root component, mission state machine
├── api.js                      # Axios client + DEFAULT_ENVIRONMENT_REQUEST
├── main.jsx                    # ReactDOM entry
├── index.css                   # Tailwind + custom dark theme
│
├── components/
│   ├── DroneMap.jsx             # Deck.gl OrbitView + all layers
│   ├── Header.jsx               # Top status bar
│   ├── Sidebar.jsx              # Left panel: fleet, deliveries, NFZ, log
│   ├── ControlPanel.jsx         # Right panel: Run button, JSON editor
│   ├── TimelineControls.jsx     # Scrubber, play/pause, speed, loop
│   └── MapLegend.jsx            # Map overlay legend
│
├── hooks/
│   └── useAnimationLoop.js      # requestAnimationFrame ticker
│
└── utils/
    └── animation.js             # Path interpolation, layer data builders
```

---

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Start your Spring Boot backend

Make sure your Java API is running at `http://localhost:8080`. The frontend
proxies `/api` to `localhost:8080` via Vite's dev server config.

### 3. Start the frontend

```bash
npm run dev
```

Visit `http://localhost:3000`

---

## API Contract

### POST `http://localhost:8080/api/v1/dispatch`

**Request** (`EnvironmentRequest`):
```json
{
  "map_size": [100.0, 100.0],
  "drones": [{ "id": "D1", "max_payload": 10.0 }],
  "deliveries": [{ "id": "P1", "x": 40, "y": 40, "weight": 2.0, "deadline": 120.0 }],
  "charging_stations": [{ "x": 0, "y": 0 }],
  "no_fly_zones": [
    { "shape": "circle", "center": [20, 20], "radius": 8, "T_start": 0, "T_end": 30 }
  ]
}
```

**Response** (`ManifestResponse`):
```json
{
  "flight_manifest": [
    {
      "drone_id": "D1",
      "path": [
        { "x": 0,  "y": 0,  "t": 0.0,  "action": "START" },
        { "x": 20, "y": 10, "t": 22.3, "action": "FLY" },
        { "x": 20, "y": 10, "t": 30.0, "action": "WAIT" },
        { "x": 40, "y": 40, "t": 66.0, "action": "DELIVER", "delivery_id": "P1" }
      ]
    }
  ]
}
```

Supported `action` values: `START`, `FLY`, `WAIT`, `DELIVER`, `CHARGE`

---

## Demo Mode

When the Spring Boot API is **not running**, the dashboard automatically generates
a synthetic flight manifest based on the current request payload so you can still
see the full 3D animation. A `(DEMO)` tag appears in the header.

---

## 3D Navigation (Deck.gl OrbitView)

| Input | Action |
|---|---|
| Left drag | Rotate / orbit |
| Right drag | Pan |
| Scroll | Zoom in/out |
| Double click | Zoom to point |

The view initializes at `pitch: 45°, bearing: -30°, zoom: 3.2` for an isometric perspective.

---

## Customizing the Request Payload

Click **Request Payload** in the right panel to expand the JSON editor.
Edit the payload inline and click **Run Optimization** to dispatch with
the new parameters. JSON validation is enforced before submission.

---

## Build for Production

```bash
npm run build
npm run preview
```

---

## CORS (Spring Boot)

Add this to your Spring Boot controller or global config:

```java
@CrossOrigin(origins = "http://localhost:3000")
```

Or globally:

```java
@Bean
public WebMvcConfigurer corsConfigurer() {
    return new WebMvcConfigurer() {
        @Override
        public void addCorsMappings(CorsRegistry registry) {
            registry.addMapping("/api/**").allowedOrigins("http://localhost:3000");
        }
    };
}
```
