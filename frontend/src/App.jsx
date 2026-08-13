import React, { useState, useCallback, useMemo, useEffect } from 'react';

import { runDispatchOptimization, DEFAULT_ENVIRONMENT_REQUEST, isValidManifestResponse } from './api.js';
import { useAnimationLoop } from './hooks/useAnimationLoop.js';
import {
  buildDroneTimelines,
  computeMaxTime,
  computeAnalytics,
} from './utils/animation.js';

import Header from './components/Header.jsx';
import Sidebar from './components/Sidebar.jsx';
import DroneMap from './components/DroneMap.jsx';
import TimelineControls from './components/TimelineControls.jsx';
import ControlPanel from './components/ControlPanel.jsx';
import MapLegend from './components/MapLegend.jsx';

// Mission lifecycle states
const STATUS = {
  IDLE: 'IDLE',
  OPTIMIZING: 'OPTIMIZING',
  RUNNING: 'RUNNING',
  COMPLETE: 'COMPLETE',
  ERROR: 'ERROR',
};

export default function App() {
  const [missionStatus, setMissionStatus] = useState(STATUS.IDLE);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [manifestResponse, setManifestResponse] = useState(null);
  const [environmentRequest, setEnvironmentRequest] = useState(DEFAULT_ENVIRONMENT_REQUEST);
  const [selectedDrone, setSelectedDrone] = useState(null);
  const [lastDispatchTime, setLastDispatchTime] = useState(null);
  const [viewState, setViewState] = useState(null);
  const [apiConnected, setApiConnected] = useState(false);

  // Build drone timelines from manifest
  const droneTimelines = useMemo(() => {
    if (!manifestResponse?.flight_manifest) return [];
    return buildDroneTimelines(manifestResponse.flight_manifest);
  }, [manifestResponse]);

  const maxTime = useMemo(() => computeMaxTime(droneTimelines), [droneTimelines]);

  // Animation loop
  const {
    currentTime,
    isPlaying,
    speed,
    isLooping,
    play,
    pause,
    seek,
    reset,
    togglePlay,
    setSpeed,
    setIsLooping,
  } = useAnimationLoop(maxTime);

  // Compute real-time analytics
  const analytics = useMemo(
    () => computeAnalytics(droneTimelines, currentTime, environmentRequest.deliveries ?? []),
    [droneTimelines, currentTime, environmentRequest.deliveries]
  );

  // Auto-play when manifest is loaded
  useEffect(() => {
    if (manifestResponse) {
      reset();
      setTimeout(() => play(), 300);
    }
  }, [manifestResponse]);

  // Update status when playing
  useEffect(() => {
    if (manifestResponse && isPlaying) {
      setMissionStatus(STATUS.RUNNING);
    } else if (manifestResponse && !isPlaying && currentTime >= maxTime && maxTime > 0) {
      setMissionStatus(STATUS.COMPLETE);
    }
  }, [isPlaying, manifestResponse, currentTime, maxTime]);

  // Run optimization
  const handleRunOptimization = useCallback(async (payload = DEFAULT_ENVIRONMENT_REQUEST) => {
    setIsLoading(true);
    setMissionStatus(STATUS.OPTIMIZING);
    setErrorMessage(null);
    setManifestResponse(null);
    setSelectedDrone(null);
    setEnvironmentRequest(payload);

    try {
      const response = await runDispatchOptimization(payload);

      if (!isValidManifestResponse(response)) {
        throw new Error('Invalid manifest response format from API');
      }

      setManifestResponse(response);
      setApiConnected(true);
      setMissionStatus(STATUS.COMPLETE);
      setLastDispatchTime(new Date().toLocaleTimeString());
    } catch (err) {
      console.error('[AEGIS] Dispatch error:', err);
      const msg = err.response?.data?.message
        ?? err.response?.data
        ?? err.message
        ?? 'Connection failed. Ensure Spring Boot is running on :8080';
      setErrorMessage(String(msg));
      setMissionStatus(STATUS.ERROR);
      setApiConnected(false);

      // For development/demo: inject a mock manifest on API failure
      injectDemoManifest(payload);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Demo mode: synthesize a manifest when API is unavailable
  const injectDemoManifest = useCallback((payload) => {
    if (!payload) return;
    const { deliveries = [], charging_stations = [], no_fly_zones = [] } = payload;

    const manifest = {
      flight_manifest: payload.drones.map((drone, di) => {
        const delivery = deliveries[di % deliveries.length];
        const station = charging_stations[0] ?? { x: 0, y: 0 };
        const nfz = no_fly_zones[0];

        const path = [
          { x: station.x, y: station.y, t: 0, action: 'START' },
        ];

        if (delivery) {
          // Waypoint that avoids NFZ if present
          if (nfz && nfz.shape === 'circle') {
            const midX = (station.x + delivery.x) / 2;
            const midY = (station.y + delivery.y) / 2;
            // Simple detour: go around the NFZ timing window
            path.push({ x: midX, y: midY - 5, t: nfz.T_end + 2, action: 'FLY' });
          }
          path.push({
            x: delivery.x,
            y: delivery.y,
            t: delivery.deadline * 0.8,
            action: 'DELIVER',
            delivery_id: delivery.id,
          });
        }

        // Return home
        path.push({
          x: station.x,
          y: station.y,
          t: (delivery?.deadline ?? 100) + 20,
          action: 'CHARGE',
        });

        return { drone_id: drone.id, path };
      }),
    };

    console.info('[AEGIS] Using demo manifest (API unavailable)');
    setManifestResponse(manifest);
    setMissionStatus(STATUS.COMPLETE);
    setLastDispatchTime(new Date().toLocaleTimeString() + ' (DEMO)');
  }, []);

  return (
    <div className="flex flex-col w-full h-full bg-void overflow-hidden scanlines">
      {/* Top header */}
      <Header
        missionStatus={missionStatus}
        analytics={analytics}
        droneCount={environmentRequest.drones?.length ?? 0}
        lastDispatchTime={lastDispatchTime}
        apiConnected={apiConnected}
      />

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* ──────────────── LEFT SIDEBAR ──────────────── */}
        <aside className="w-64 flex-shrink-0 panel-glass border-r border-border flex flex-col overflow-hidden">
          {/* Sidebar header */}
          <div className="px-4 py-2 border-b border-border flex items-center gap-2">
            <span className="font-mono text-xs text-muted uppercase tracking-widest">
              Mission Intel
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Sidebar content */}
          <div className="flex-1 overflow-y-auto">
            <Sidebar
              environmentRequest={environmentRequest}
              manifestResponse={manifestResponse}
              droneStats={analytics.droneStats}
              analytics={analytics}
              currentTime={currentTime}
              selectedDrone={selectedDrone}
              onSelectDrone={setSelectedDrone}
            />
          </div>
        </aside>

        {/* ──────────────── CENTER: MAP + TIMELINE ──────────────── */}
        <main className="flex-1 flex flex-col overflow-hidden relative">
          {/* Map viewport */}
          <div className="flex-1 relative">
            <DroneMap
              currentTime={currentTime}
              droneTimelines={droneTimelines}
              environmentRequest={environmentRequest}
              manifestResponse={manifestResponse}
              viewState={viewState}
              onViewStateChange={setViewState}
              selectedDrone={selectedDrone}
              onSelectDrone={setSelectedDrone}
            />

            {/* Map overlays */}
            {/* Top-left: coordinate readout */}
            <div className="absolute top-4 left-4 pointer-events-none">
              <div className="panel-glass rounded-sm px-3 py-2">
                <div className="font-mono text-xs text-muted uppercase tracking-widest mb-1">
                  Grid
                </div>
                <div className="font-mono text-xs text-text-dim">
                  100 × 100 Cartesian
                </div>
                <div className="font-mono text-xs text-text-dim">
                  OrbitView · 3D
                </div>
              </div>
            </div>

            {/* Top-right: legend */}
            <div className="absolute top-4 right-4 pointer-events-none">
              <MapLegend />
            </div>

            {/* Center: idle prompt */}
            {missionStatus === STATUS.IDLE && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="panel-glass rounded px-8 py-6 text-center border border-border max-w-xs">
                  <div className="font-mono text-xs text-muted uppercase tracking-widest mb-2">
                    Awaiting Mission
                  </div>
                  <div className="font-display text-sm text-text-dim">
                    Configure the payload and run optimization to visualize the dispatch plan.
                  </div>
                  <div className="mt-3 font-mono text-xs text-muted">
                    ← Run Optimization
                  </div>
                </div>
              </div>
            )}

            {/* Center: optimizing spinner */}
            {missionStatus === STATUS.OPTIMIZING && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="panel-glass rounded px-10 py-8 text-center border border-warning/30">
                  <div className="w-8 h-8 mx-auto mb-3 border-2 border-warning border-t-transparent rounded-full animate-spin" />
                  <div className="font-mono text-xs text-warning uppercase tracking-widest">
                    Running A* Solver
                  </div>
                  <div className="font-mono text-xs text-muted mt-1">
                    Pareto Dominance optimization in progress...
                  </div>
                </div>
              </div>
            )}

            {/* Bottom: drone telemetry tags (floating over map) */}
            {analytics.droneStats.length > 0 && (
              <div className="absolute bottom-4 left-4 flex flex-col gap-1.5 pointer-events-none">
                {analytics.droneStats.map((drone) => {
                  const [r, g, b] = drone.color;
                  return (
                    <div
                      key={drone.drone_id}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-sm font-mono text-xs"
                      style={{
                        background: `rgba(${r},${g},${b},0.08)`,
                        border: `1px solid rgba(${r},${g},${b},0.25)`,
                      }}
                    >
                      <div
                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{ background: `rgb(${r},${g},${b})` }}
                      />
                      <span style={{ color: `rgb(${r},${g},${b})` }}>
                        {drone.drone_id}
                      </span>
                      <span className="text-text-dim">
                        ({drone.position?.x?.toFixed(1) ?? '—'}, {drone.position?.y?.toFixed(1) ?? '—'})
                      </span>
                      <span
                        className="text-muted"
                        style={{ color: `rgba(${r},${g},${b},0.7)` }}
                      >
                        {drone.currentAction}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Timeline bar */}
          <div className="p-3 border-t border-border flex-shrink-0">
            <TimelineControls
              currentTime={currentTime}
              maxTime={maxTime}
              isPlaying={isPlaying}
              speed={speed}
              isLooping={isLooping}
              onPlay={play}
              onPause={pause}
              onSeek={seek}
              onReset={reset}
              onTogglePlay={togglePlay}
              onSetSpeed={setSpeed}
              onSetLooping={setIsLooping}
              isDisabled={!manifestResponse}
            />
          </div>
        </main>

        {/* ──────────────── RIGHT PANEL ──────────────── */}
        <aside className="w-64 flex-shrink-0 panel-glass border-l border-border flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-4 py-2 border-b border-border flex items-center gap-2">
            <span className="font-mono text-xs text-muted uppercase tracking-widest">
              Dispatch Control
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Controls */}
          <div className="flex-1 overflow-y-auto">
            <ControlPanel
              onRunOptimization={handleRunOptimization}
              missionStatus={missionStatus}
              isLoading={isLoading}
              errorMessage={errorMessage}
              lastResponse={manifestResponse}
            />
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-border">
            <div className="font-mono text-xs text-muted text-center">
              AEGIS v1.0 · Time-Space A*
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
