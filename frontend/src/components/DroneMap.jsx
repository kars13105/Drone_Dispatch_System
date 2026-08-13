import React, { useMemo, useCallback } from 'react';
import DeckGL from '@deck.gl/react';
import { OrbitView, COORDINATE_SYSTEM } from '@deck.gl/core';
import { ScatterplotLayer, PathLayer, PolygonLayer, TextLayer, LineLayer } from '@deck.gl/layers';

import {
  getDronePositionsAtTime,
  getDroneTrailsAtTime,
  buildPathLines,
  buildDeliveryPoints,
  buildStationPoints,
  buildNFZPolygons,
} from '../utils/animation.js';

// Grid constants
const GRID_SIZE = 100;
const GRID_CELLS = 10;

const INITIAL_VIEW_STATE = {
  target: [50, 50, 0],
  rotationX: 45,
  rotationOrbit: -30,
  zoom: 3.2,
  minZoom: 1,
  maxZoom: 8,
};

function buildGridLines() {
  const lines = [];
  const step = GRID_SIZE / GRID_CELLS;

  for (let i = 0; i <= GRID_CELLS; i++) {
    const v = i * step;
    // Vertical
    lines.push({ sourcePosition: [v, 0, -0.1], targetPosition: [v, GRID_SIZE, -0.1] });
    // Horizontal
    lines.push({ sourcePosition: [0, v, -0.1], targetPosition: [GRID_SIZE, v, -0.1] });
  }
  return lines;
}

function buildGroundPlane() {
  return [
    {
      polygon: [
        [0, 0],
        [GRID_SIZE, 0],
        [GRID_SIZE, GRID_SIZE],
        [0, GRID_SIZE],
        [0, 0],
      ],
    },
  ];
}

/**
 * The Deck.gl 3D visualization of the drone dispatch environment.
 */
export default function DroneMap({
  currentTime,
  droneTimelines,
  environmentRequest,
  manifestResponse,
  viewState,
  onViewStateChange,
  selectedDrone,
  onSelectDrone,
}) {
  const { deliveries = [], charging_stations = [], no_fly_zones = [] } = environmentRequest;

  const dronePositions = useMemo(
    () => getDronePositionsAtTime(droneTimelines, currentTime),
    [droneTimelines, currentTime]
  );

  const droneTrails = useMemo(
    () => getDroneTrailsAtTime(droneTimelines, currentTime, 25),
    [droneTimelines, currentTime]
  );

  const pathLines = useMemo(
    () => buildPathLines(droneTimelines),
    [droneTimelines]
  );

  const deliveryPoints = useMemo(
    () => buildDeliveryPoints(deliveries),
    [deliveries]
  );

  const stationPoints = useMemo(
    () => buildStationPoints(charging_stations),
    [charging_stations]
  );

  const nfzPolygons = useMemo(
    () => buildNFZPolygons(no_fly_zones, currentTime),
    [no_fly_zones, currentTime]
  );

  const gridLines = useMemo(() => buildGridLines(), []);
  const groundPlane = useMemo(() => buildGroundPlane(), []);

  const getTooltip = useCallback(({ object, layer }) => {
    if (!object) return null;

    let content = '';

    if (layer?.id === 'drone-scatter') {
      content = `DRONE: ${object.drone_id}\nACTION: ${object.action}\nPOS: (${object.x.toFixed(1)}, ${object.y.toFixed(1)})\nALT: ${object.z?.toFixed(1) ?? '0'}u`;
    } else if (layer?.id === 'delivery-scatter') {
      content = `DELIVERY: ${object.id}\nPOS: (${object.position[0]}, ${object.position[1]})\nWEIGHT: ${object.weight}kg\nDEADLINE: T+${object.deadline}s`;
    } else if (layer?.id === 'station-scatter') {
      content = `CHARGING STATION: ${object.id}\nPOS: (${object.position[0]}, ${object.position[1]})\nSTATUS: ACTIVE`;
    } else if (layer?.id === 'nfz-polygon') {
      const nfz = object;
      content = `NO-FLY ZONE\nSHAPE: ${nfz.shape?.toUpperCase()}\nCENTER: (${nfz.center?.[0]}, ${nfz.center?.[1]})\nRADIUS: ${nfz.radius}u\nACTIVE: T${nfz.T_start}→T${nfz.T_end}\nSTATUS: ${nfz.active ? '⚠ ENFORCED' : '○ STANDBY'}`;
    }

    return content ? { text: content, style: { fontFamily: 'JetBrains Mono, monospace' } } : null;
  }, []);

  const handleDroneClick = useCallback(({ object }) => {
    if (object?.drone_id) {
      onSelectDrone?.(object.drone_id === selectedDrone ? null : object.drone_id);
    }
  }, [onSelectDrone, selectedDrone]);

  const layers = [
    // === Ground plane ===
    new PolygonLayer({
      id: 'ground-plane',
      data: groundPlane,
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      getPolygon: (d) => d.polygon,
      getFillColor: [8, 16, 32, 200],
      getLineColor: [26, 37, 64, 0],
      lineWidthMinPixels: 0,
      extruded: false,
      pickable: false,
    }),

    // === Grid lines ===
    new LineLayer({
      id: 'grid-lines',
      data: gridLines,
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      getSourcePosition: (d) => d.sourcePosition,
      getTargetPosition: (d) => d.targetPosition,
      getColor: [26, 37, 64, 120],
      getWidth: 0.3,
      pickable: false,
    }),

    // === NFZ polygons ===
    new PolygonLayer({
      id: 'nfz-polygon',
      data: nfzPolygons,
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      getPolygon: (d) => d.polygon,
      getFillColor: (d) => d.fillColor,
      getLineColor: (d) => d.lineColor,
      lineWidthMinPixels: 1.5,
      extruded: false,
      pickable: true,
      updateTriggers: {
        getFillColor: [currentTime],
        getLineColor: [currentTime],
      },
    }),

    // === Static route paths (ghost lines) ===
    ...(manifestResponse
      ? [
          new PathLayer({
            id: 'static-paths',
            data: pathLines,
            coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
            getPath: (d) => d.points,
            getColor: (d) => [...d.color.slice(0, 3), 25],
            getWidth: 0.4,
            widthMinPixels: 1,
            pickable: false,
            getDashArray: [4, 4],
            dashJustified: true,
          }),
        ]
      : []),

    // === Charging stations ===
    new ScatterplotLayer({
      id: 'station-scatter',
      data: stationPoints,
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      getPosition: (d) => d.position,
      getRadius: 2.5,
      getFillColor: [16, 185, 129, 200],
      getLineColor: [16, 185, 129, 255],
      lineWidthMinPixels: 1.5,
      stroked: true,
      filled: true,
      pickable: true,
      radiusMinPixels: 6,
    }),

    // Station glow rings
    new ScatterplotLayer({
      id: 'station-glow',
      data: stationPoints,
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      getPosition: (d) => d.position,
      getRadius: 4,
      getFillColor: [16, 185, 129, 0],
      getLineColor: [16, 185, 129, 60],
      lineWidthMinPixels: 1,
      stroked: true,
      filled: false,
      pickable: false,
      radiusMinPixels: 10,
    }),

    // Station labels
    new TextLayer({
      id: 'station-labels',
      data: stationPoints,
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      getPosition: (d) => [d.position[0], d.position[1] - 4, 0],
      getText: (d) => d.id,
      getSize: 9,
      getColor: [16, 185, 129, 200],
      fontFamily: 'JetBrains Mono, monospace',
      fontWeight: 600,
      getTextAnchor: 'middle',
      getAlignmentBaseline: 'top',
      pickable: false,
    }),

    // === Delivery points ===
    new ScatterplotLayer({
      id: 'delivery-scatter',
      data: deliveryPoints,
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      getPosition: (d) => d.position,
      getRadius: 2,
      getFillColor: [251, 191, 36, 180],
      getLineColor: [251, 191, 36, 255],
      lineWidthMinPixels: 1.5,
      stroked: true,
      filled: true,
      pickable: true,
      radiusMinPixels: 5,
    }),

    // Delivery glow
    new ScatterplotLayer({
      id: 'delivery-glow',
      data: deliveryPoints,
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      getPosition: (d) => d.position,
      getRadius: 3.5,
      getFillColor: [251, 191, 36, 0],
      getLineColor: [251, 191, 36, 50],
      lineWidthMinPixels: 1,
      stroked: true,
      filled: false,
      pickable: false,
      radiusMinPixels: 8,
    }),

    // Delivery labels
    new TextLayer({
      id: 'delivery-labels',
      data: deliveryPoints,
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      getPosition: (d) => [d.position[0], d.position[1] + 4, 0],
      getText: (d) => d.id,
      getSize: 9,
      getColor: [251, 191, 36, 200],
      fontFamily: 'JetBrains Mono, monospace',
      fontWeight: 600,
      getTextAnchor: 'middle',
      getAlignmentBaseline: 'bottom',
      pickable: false,
    }),

    // === Drone trails ===
    ...(manifestResponse
      ? [
          new PathLayer({
            id: 'drone-trails',
            data: droneTrails,
            coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
            getPath: (d) => d.points,
            getColor: (d) => {
              const isSelected = selectedDrone === null || d.drone_id === selectedDrone;
              return [...d.color.slice(0, 3), isSelected ? 160 : 30];
            },
            getWidth: (d) => (selectedDrone === null || d.drone_id === selectedDrone ? 1.2 : 0.5),
            widthMinPixels: 1,
            pickable: false,
            updateTriggers: {
              getColor: [currentTime, selectedDrone],
              getWidth: [selectedDrone],
            },
          }),
        ]
      : []),

    // === Drone positions ===
    ...(manifestResponse
      ? [
          // Outer glow ring
          new ScatterplotLayer({
            id: 'drone-glow',
            data: dronePositions,
            coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
            getPosition: (d) => [d.x, d.y, d.z ?? 0],
            getRadius: (d) => (selectedDrone === d.drone_id ? 6 : 4.5),
            getFillColor: (d) => {
              const alpha = selectedDrone === null || d.drone_id === selectedDrone ? 30 : 8;
              return [...d.color.slice(0, 3), alpha];
            },
            getLineColor: (d) => {
              const alpha = selectedDrone === null || d.drone_id === selectedDrone ? 80 : 20;
              return [...d.color.slice(0, 3), alpha];
            },
            lineWidthMinPixels: 1,
            stroked: true,
            filled: true,
            pickable: false,
            radiusMinPixels: 12,
            updateTriggers: {
              getPosition: [currentTime],
              getFillColor: [selectedDrone, currentTime],
              getRadius: [selectedDrone],
            },
          }),

          // Core drone dot
          new ScatterplotLayer({
            id: 'drone-scatter',
            data: dronePositions,
            coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
            getPosition: (d) => [d.x, d.y, d.z ?? 0],
            getRadius: (d) => (selectedDrone === d.drone_id ? 2.5 : 2),
            getFillColor: (d) => {
              const alpha = selectedDrone === null || d.drone_id === selectedDrone ? 255 : 80;
              return [...d.color.slice(0, 3), alpha];
            },
            getLineColor: [255, 255, 255, 200],
            lineWidthMinPixels: 1,
            stroked: true,
            filled: true,
            pickable: true,
            radiusMinPixels: 5,
            updateTriggers: {
              getPosition: [currentTime],
              getFillColor: [selectedDrone, currentTime],
              getRadius: [selectedDrone],
            },
          }),

          // Drone ID labels
          new TextLayer({
            id: 'drone-labels',
            data: dronePositions,
            coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
            getPosition: (d) => [d.x, d.y + 3.5, (d.z ?? 0) + 1],
            getText: (d) => d.drone_id,
            getSize: 10,
            getColor: (d) => {
              const alpha = selectedDrone === null || d.drone_id === selectedDrone ? 255 : 60;
              return [...d.color.slice(0, 3), alpha];
            },
            fontFamily: 'JetBrains Mono, monospace',
            fontWeight: 700,
            getTextAnchor: 'middle',
            getAlignmentBaseline: 'bottom',
            pickable: false,
            updateTriggers: {
              getPosition: [currentTime],
              getColor: [selectedDrone, currentTime],
            },
          }),
        ]
      : []),

    // === NFZ time labels ===
    new TextLayer({
      id: 'nfz-time-labels',
      data: nfzPolygons,
      coordinateSystem: COORDINATE_SYSTEM.CARTESIAN,
      getPosition: (d) =>
        d.center ? [d.center[0], d.center[1], 1] : [0, 0, 1],
      getText: (d) => `NFZ\nT${d.T_start}–T${d.T_end}`,
      getSize: 8,
      getColor: (d) => (d.active ? [239, 68, 68, 220] : [239, 68, 68, 100]),
      fontFamily: 'JetBrains Mono, monospace',
      fontWeight: 500,
      getTextAnchor: 'middle',
      getAlignmentBaseline: 'center',
      pickable: false,
      updateTriggers: {
        getColor: [currentTime],
      },
    }),
  ];

  return (
    <DeckGL
      views={new OrbitView({ id: 'orbit' })}
      initialViewState={INITIAL_VIEW_STATE}
      viewState={viewState}
      onViewStateChange={({ viewState: vs }) => onViewStateChange?.(vs)}
      controller={true}
      layers={layers}
      getTooltip={getTooltip}
      onClick={handleDroneClick}
      style={{ background: '#050810' }}
    />
  );
}
