import axios from 'axios';

const BASE_URL = 'http://localhost:8080/api/v1';

const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  timeout: 60000,
});

// Default request payload matching the backend test cases
export const DEFAULT_ENVIRONMENT_REQUEST = {
  map_size: [100.0, 100.0],
  drones: [{ id: 'D1', max_payload: 10.0 }],
  deliveries: [{ id: 'P1', x: 40, y: 40, weight: 2.0, deadline: 120.0 }],
  charging_stations: [{ x: 0, y: 0 }],
  no_fly_zones: [
    {
      shape: 'circle',
      center: [20, 20],
      radius: 8,
      T_start: 0,
      T_end: 30,
    },
  ],
};

/**
 * POST /api/v1/dispatch
 * @param {Object} environmentRequest
 * @returns {Promise<ManifestResponse>}
 */
export async function runDispatchOptimization(environmentRequest = DEFAULT_ENVIRONMENT_REQUEST) {
  const response = await apiClient.post('/dispatch', environmentRequest);
  return response.data;
}

/**
 * Validate ManifestResponse shape
 * @param {any} data
 * @returns {boolean}
 */
export function isValidManifestResponse(data) {
  return (
    data &&
    Array.isArray(data.flight_manifest) &&
    data.flight_manifest.every(
      (entry) =>
        typeof entry.drone_id === 'string' &&
        Array.isArray(entry.path) &&
        entry.path.every(
          (wp) =>
            typeof wp.x === 'number' &&
            typeof wp.y === 'number' &&
            typeof wp.t === 'number' &&
            typeof wp.action === 'string'
        )
    )
  );
}

export default apiClient;
