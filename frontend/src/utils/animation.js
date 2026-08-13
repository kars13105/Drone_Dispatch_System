/**
 * Animation utilities for the drone dispatch timeline.
 * Converts a ManifestResponse into per-frame render data.
 */

// Color palette per drone (cycling)
const DRONE_COLORS = [
  [0, 212, 255],    // cyan  – D1
  [251, 191, 36],   // amber – D2
  [167, 139, 250],  // violet – D3
  [52, 211, 153],   // emerald – D4
  [251, 113, 133],  // rose – D5
];

export function getDroneColor(index) {
  return DRONE_COLORS[index % DRONE_COLORS.length];
}

/**
 * Pre-process the manifest into a lookup: droneId → array of waypoints
 * Each waypoint already has x, y, t, action.
 */
export function buildDroneTimelines(flightManifest) {
  return flightManifest.map((entry, i) => ({
    drone_id: entry.drone_id,
    color: getDroneColor(i),
    waypoints: entry.path,
    totalTime: entry.path[entry.path.length - 1]?.t ?? 0,
  }));
}

/**
 * Compute the maximum time across all drones.
 */
export function computeMaxTime(droneTimelines) {
  return Math.max(...droneTimelines.map((d) => d.totalTime), 1);
}

/**
 * Linear interpolation between two waypoints for a given time t.
 * Returns { x, y, action, progress }
 */
function interpolatePosition(waypoints, t) {
  if (!waypoints || waypoints.length === 0) {
    return { x: 0, y: 0, z: 0, action: 'IDLE', segmentProgress: 0 };
  }

  // Before first waypoint
  if (t <= waypoints[0].t) {
    return { x: waypoints[0].x, y: waypoints[0].y, z: 0, action: waypoints[0].action, segmentProgress: 0 };
  }

  // After last waypoint
  const last = waypoints[waypoints.length - 1];
  if (t >= last.t) {
    return { x: last.x, y: last.y, z: 0, action: last.action, segmentProgress: 1 };
  }

  // Find the bounding waypoints
  for (let i = 0; i < waypoints.length - 1; i++) {
    const wp0 = waypoints[i];
    const wp1 = waypoints[i + 1];
    if (t >= wp0.t && t <= wp1.t) {
      const duration = wp1.t - wp0.t;
      const elapsed = t - wp0.t;
      const alpha = duration > 0 ? elapsed / duration : 1;

      // Smooth step easing for less robotic motion
      const eased = alpha * alpha * (3 - 2 * alpha);

      const x = wp0.x + (wp1.x - wp0.x) * eased;
      const y = wp0.y + (wp1.y - wp0.y) * eased;

      // Parabolic flight arc: height proportional to distance
      const dist = Math.sqrt(Math.pow(wp1.x - wp0.x, 2) + Math.pow(wp1.y - wp0.y, 2));
      const arcHeight = Math.min(dist * 0.15, 8);
      const z = wp0.action !== 'WAIT' ? Math.sin(eased * Math.PI) * arcHeight : 0;

      return {
        x,
        y,
        z,
        action: wp0.action,
        segmentProgress: eased,
        heading: Math.atan2(wp1.y - wp0.y, wp1.x - wp0.x),
      };
    }
  }

  return { x: last.x, y: last.y, z: 0, action: last.action, segmentProgress: 1 };
}

/**
 * Get all drone positions at time t.
 * Returns array of { drone_id, x, y, z, action, color }
 */
export function getDronePositionsAtTime(droneTimelines, t) {
  return droneTimelines.map((drone) => {
    const pos = interpolatePosition(drone.waypoints, t);
    return {
      drone_id: drone.drone_id,
      color: drone.color,
      ...pos,
    };
  });
}

/**
 * Build the full trail path up to time t for each drone.
 * Returns array of { drone_id, color, points: [[x, y, z], ...] }
 */
export function getDroneTrailsAtTime(droneTimelines, t, trailLength = 30) {
  return droneTimelines.map((drone) => {
    const points = [];
    const startT = Math.max(0, t - trailLength);
    const steps = 40;

    for (let i = 0; i <= steps; i++) {
      const sampleT = startT + ((t - startT) * i) / steps;
      const pos = interpolatePosition(drone.waypoints, sampleT);
      points.push([pos.x, pos.y, pos.z]);
    }

    return {
      drone_id: drone.drone_id,
      color: drone.color,
      points,
    };
  });
}

/**
 * Build static path lines for the entire route of each drone.
 */
export function buildPathLines(droneTimelines) {
  return droneTimelines.map((drone) => ({
    drone_id: drone.drone_id,
    color: [...drone.color, 40], // mostly transparent static route
    points: drone.waypoints.map((wp) => [wp.x, wp.y, 0]),
  }));
}

/**
 * Extract all delivery points from the environment request.
 */
export function buildDeliveryPoints(deliveries) {
  return deliveries.map((d) => ({
    id: d.id,
    position: [d.x, d.y, 0],
    weight: d.weight,
    deadline: d.deadline,
  }));
}

/**
 * Extract charging stations.
 */
export function buildStationPoints(stations) {
  return stations.map((s, i) => ({
    id: `CS${i + 1}`,
    position: [s.x, s.y, 0],
  }));
}

/**
 * Check if a no-fly zone is active at time t.
 */
export function isNFZActive(nfz, t) {
  return t >= nfz.T_start && t <= nfz.T_end;
}

/**
 * Build circle polygon data for no-fly zones.
 * Returns PolygonLayer-compatible data.
 */
export function buildNFZPolygons(noFlyZones, t) {
  return noFlyZones.map((nfz) => {
    const active = isNFZActive(nfz, t);
    const segments = 64;
    const polygon = [];

    if (nfz.shape === 'circle') {
      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        polygon.push([
          nfz.center[0] + Math.cos(angle) * nfz.radius,
          nfz.center[1] + Math.sin(angle) * nfz.radius,
        ]);
      }
    } else if (nfz.shape === 'polygon' && nfz.vertices) {
      polygon.push(...nfz.vertices);
      polygon.push(nfz.vertices[0]); // close
    }

    return {
      id: `NFZ`,
      shape: nfz.shape,
      center: nfz.center,
      radius: nfz.radius,
      T_start: nfz.T_start,
      T_end: nfz.T_end,
      active,
      polygon,
      fillColor: active ? [239, 68, 68, 40] : [239, 68, 68, 15],
      lineColor: active ? [239, 68, 68, 200] : [239, 68, 68, 80],
      timeRemaining: nfz.T_end - t,
    };
  });
}

/**
 * Compute analytics from manifest and current time.
 */
export function computeAnalytics(droneTimelines, t, deliveries) {
  const completedDeliveries = new Set();
  const droneStats = [];

  droneTimelines.forEach((drone) => {
    let distanceTraveled = 0;
    let lastPos = null;
    let currentAction = 'IDLE';
    let isActive = false;

    drone.waypoints.forEach((wp, i) => {
      if (wp.t <= t) {
        if (lastPos) {
          distanceTraveled += Math.sqrt(
            Math.pow(wp.x - lastPos.x, 2) + Math.pow(wp.y - lastPos.y, 2)
          );
        }
        lastPos = wp;
        currentAction = wp.action;
        isActive = true;

        if (wp.action === 'DELIVER' && wp.delivery_id) {
          completedDeliveries.add(wp.delivery_id);
        }
      }
    });

    const pos = interpolatePosition(drone.waypoints, t);

    droneStats.push({
      drone_id: drone.drone_id,
      color: drone.color,
      distanceTraveled: Math.round(distanceTraveled * 10) / 10,
      currentAction: pos.action,
      isActive,
      position: pos,
    });
  });

  return {
    droneStats,
    completedDeliveries: completedDeliveries.size,
    totalDeliveries: deliveries.length,
    deliveryRate: deliveries.length > 0
      ? Math.round((completedDeliveries.size / deliveries.length) * 100)
      : 0,
  };
}
