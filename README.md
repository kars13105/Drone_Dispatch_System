# Drone Dispatch System

An autonomous Drone Dispatch System featuring a high-performance **C++ backend** and a modern **React/Vite frontend** dashboard. 

The system uses a Time-Space A* search algorithm with Pareto Dominance Pruning to route drones around dynamic No-Fly Zones (NFZs) while managing payload constraints, battery drain, and delivery deadlines.

## Architecture

* **Backend (C++)**: Extremely fast, zero-dependency (header-only libraries `httplib` and `nlohmann/json`) REST server running on port 8080. 
* **Frontend (React + Vite)**: A dynamic map-based dashboard running on port 3000 that visualizes the optimal routes and drone assignments in real-time.

## Prerequisites

* **C++ Compiler**: `clang++` or `g++` with C++17 support.
* **Node.js & npm**: For running the frontend development server.

## Getting Started

### 1. Run the Backend

Navigate to the C++ backend directory, compile, and run the server:

```bash
cd backend-cpp
clang++ -std=c++17 -O2 -I include -o drone_dispatch src/main.cpp -lpthread
./drone_dispatch
```
*The server will start listening on `http://localhost:8080`.*

### 2. Run the Frontend

In a new terminal window, navigate to the frontend directory, install dependencies, and start the Vite dev server:

```bash
cd frontend
npm install
npm run dev
```
*The dashboard will automatically open at `http://localhost:3000`.*

## Core Algorithm Features
* **Dynamic No-Fly Zones**: Capable of flying tangent to active NFZs and hovering in place if an NFZ is temporary and will clear soon.
* **Pareto Dominance Pruning**: Caches states locally on a grid to prevent combinatorial explosion during A* search.
* **Battery Management**: Calculates flight drain depending on payload weight and detours to charging stations when required.

## API Documentation
**POST `/api/v1/dispatch`**
Calculates the optimal flight manifests for a given environment configuration.
* **Body**: JSON object containing `map_size`, `drones`, `deliveries`, `charging_stations`, and `no_fly_zones`.
* **Response**: JSON array of flight paths including precise timings, coordinates, battery percentages, and actions (`DEPART`, `FLY`, `DELIVER`, `CHARGE`, `WAIT`, `LAND`).
