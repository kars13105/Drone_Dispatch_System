// ============================================================================
// Autonomous Drone Dispatch Engine — C++ Implementation
// ============================================================================
//
// A faithful port of the Java/Spring Boot backend.
// Uses cpp-httplib (header-only) for the REST server and
// nlohmann/json (header-only) for JSON serialization.
//
// Architecture:
// ┌─────────────────────────────────────────────────┐
// │  REST Layer   →  HTTP server (httplib)          │
// │  Orchestration →  RoutingService                │
// │  Core Algorithm → TemporalPathfinder (A*)       │
// │  Domain Models  → structs                       │
// └─────────────────────────────────────────────────┘

#include <algorithm>
#include <chrono>
#include <cmath>
#include <functional>
#include <iomanip>
#include <iostream>
#include <memory>
#include <numeric>
#include <optional>
#include <queue>
#include <sstream>
#include <string>
#include <unordered_map>
#include <vector>

#include "httplib.h"
#include "json.hpp"

using json = nlohmann::json;

// ============================================================================
// PhysicsConstants — Central Physics & Algorithm Configuration
// ============================================================================
namespace PhysicsConstants {
constexpr double BATTERY_CAPACITY = 500.0;
constexpr double FLIGHT_DRAIN_PER_UNIT = 1.0;
constexpr double PAYLOAD_DRAIN_FACTOR = 0.05;
constexpr double HOVER_DRAIN = 0.5;
constexpr double MINIMUM_RETURN_BATTERY = 20.0;
constexpr double CHARGE_RATE = 2.0;
constexpr double SPEED = 1.0;
constexpr double GRID_RESOLUTION = 0.5;
constexpr int MAX_ITERATIONS = 500000;
constexpr double MAX_HOVER_WAIT = 200.0;
constexpr double NFZ_TANGENT_CLEARANCE = 1.5;
constexpr int NFZ_TANGENT_POINTS = 8;
} // namespace PhysicsConstants

// ============================================================================
// Data Structures — DTOs and Domain Models
// ============================================================================

struct Drone {
  std::string id;
  double maxPayload = 0.0;
};

struct Delivery {
  std::string id;
  double x = 0.0;
  double y = 0.0;
  double weight = 0.0;
  double deadline = 0.0;
};

struct ChargingStation {
  double x = 0.0;
  double y = 0.0;
};

struct NoFlyZone {
  std::string shape;
  std::vector<double> center;
  double radius = 0.0;
  std::vector<std::vector<double>> corners;
  double tStart = 0.0;
  double tEnd = 0.0;
};

struct EnvironmentRequest {
  std::vector<double> mapSize;
  std::vector<Drone> drones;
  std::vector<Delivery> deliveries;
  std::vector<ChargingStation> chargingStations;
  std::vector<NoFlyZone> noFlyZones;
};

// --- JSON parsing for EnvironmentRequest ---

void from_json(const json &j, Drone &d) {
  d.id = j.at("id").get<std::string>();
  d.maxPayload = j.at("max_payload").get<double>();
}

void from_json(const json &j, Delivery &d) {
  d.id = j.at("id").get<std::string>();
  d.x = j.at("x").get<double>();
  d.y = j.at("y").get<double>();
  d.weight = j.at("weight").get<double>();
  d.deadline = j.at("deadline").get<double>();
}

void from_json(const json &j, ChargingStation &cs) {
  cs.x = j.at("x").get<double>();
  cs.y = j.at("y").get<double>();
}

void from_json(const json &j, NoFlyZone &nfz) {
  nfz.shape = j.at("shape").get<std::string>();
  if (j.contains("center") && !j["center"].is_null()) {
    nfz.center = j["center"].get<std::vector<double>>();
  }
  if (j.contains("radius") && !j["radius"].is_null()) {
    nfz.radius = j["radius"].get<double>();
  }
  if (j.contains("corners") && !j["corners"].is_null()) {
    nfz.corners = j["corners"].get<std::vector<std::vector<double>>>();
  }
  nfz.tStart = j.at("T_start").get<double>();
  nfz.tEnd = j.at("T_end").get<double>();
}

void from_json(const json &j, EnvironmentRequest &req) {
  req.mapSize = j.at("map_size").get<std::vector<double>>();
  req.drones = j.at("drones").get<std::vector<Drone>>();
  req.deliveries = j.at("deliveries").get<std::vector<Delivery>>();
  if (j.contains("charging_stations") && !j["charging_stations"].is_null()) {
    req.chargingStations =
        j["charging_stations"].get<std::vector<ChargingStation>>();
  }
  if (j.contains("no_fly_zones") && !j["no_fly_zones"].is_null()) {
    req.noFlyZones = j["no_fly_zones"].get<std::vector<NoFlyZone>>();
  }
}

// --- Output DTOs ---

struct PathNode {
  double x = 0.0;
  double y = 0.0;
  double t = 0.0;
  std::string action;
  std::vector<std::string> deliveryIds;
  std::string deliveryId;
  std::optional<double> batteryPct;
};

json pathNodeToJson(const PathNode &n) {
  json j;
  j["x"] = n.x;
  j["y"] = n.y;
  j["t"] = n.t;
  j["action"] = n.action;
  if (!n.deliveryIds.empty()) {
    j["delivery_ids"] = n.deliveryIds;
  }
  if (!n.deliveryId.empty()) {
    j["delivery_id"] = n.deliveryId;
  }
  if (n.batteryPct.has_value()) {
    j["battery_pct"] = n.batteryPct.value();
  }
  return j;
}

struct DroneManifest {
  std::string droneId;
  std::vector<PathNode> path;
};

json droneManifestToJson(const DroneManifest &m) {
  json j;
  j["drone_id"] = m.droneId;
  j["path"] = json::array();
  for (auto &n : m.path) {
    j["path"].push_back(pathNodeToJson(n));
  }
  return j;
}

struct ManifestResponse {
  std::vector<DroneManifest> flightManifest;
};

json manifestResponseToJson(const ManifestResponse &r) {
  json j;
  j["flight_manifest"] = json::array();
  for (auto &m : r.flightManifest) {
    j["flight_manifest"].push_back(droneManifestToJson(m));
  }
  return j;
}

// --- SearchState (A* node) ---

struct SearchState {
  double x = 0.0;
  double y = 0.0;
  double t = 0.0;
  double battery = 0.0;
  double payload = 0.0;
  double gCost = 0.0;
  double hCost = 0.0;
  std::shared_ptr<SearchState> parent;
  std::string action;
  std::vector<std::string> deliveryIds;

  double fCost() const { return gCost + hCost; }

  double batteryPct(double capacity) const {
    return std::max(0.0, std::min(100.0, (battery / capacity) * 100.0));
  }
};

// Comparator for priority queue (min-heap by fCost, tiebreak by hCost)
struct SearchStateCompare {
  bool operator()(const std::shared_ptr<SearchState> &a,
                  const std::shared_ptr<SearchState> &b) const {
    double fa = a->fCost(), fb = b->fCost();
    if (std::abs(fa - fb) > 1e-12)
      return fa > fb; // min-heap
    return a->hCost > b->hCost;
  }
};

// --- MissionAssignment (internal routing plan) ---

struct MissionAssignment {
  Drone drone;
  std::vector<Delivery> deliveries;
  ChargingStation baseStation;
  double startTime = 0.0;
  double initialBattery = 0.0;
  double totalPayload = 0.0;
};

// ============================================================================
// PathNotFoundException
// ============================================================================

class PathNotFoundException : public std::runtime_error {
public:
  std::string droneId;
  std::string targetDescription;

  PathNotFoundException(const std::string &droneId,
                        const std::string &targetDescription,
                        const std::string &reason)
      : std::runtime_error("No valid path found for drone '" + droneId +
                           "' to target '" + targetDescription +
                           "': " + reason),
        droneId(droneId), targetDescription(targetDescription) {}
};

// ============================================================================
// Utility Functions
// ============================================================================

static double euclidean(double x1, double y1, double x2, double y2) {
  double dx = x2 - x1;
  double dy = y2 - y1;
  return std::sqrt(dx * dx + dy * dy);
}

static double flightDrain(double distance, double payload) {
  return (PhysicsConstants::FLIGHT_DRAIN_PER_UNIT +
          payload * PhysicsConstants::PAYLOAD_DRAIN_FACTOR) *
         distance;
}

static double roundCoord(double v) { return std::round(v * 10000.0) / 10000.0; }

static double batteryPctUtil(double battery) {
  return std::round(
             std::max(
                 0.0,
                 std::min(100.0, battery / PhysicsConstants::BATTERY_CAPACITY *
                                     100.0)) *
             10) /
         10.0;
}

// ============================================================================
// TemporalPathfinder — Resource-Constrained Time-Space A* Search Engine
// ============================================================================

class TemporalPathfinder {
public:
  std::vector<std::shared_ptr<SearchState>>
  findPath(const std::string &droneId, double startX, double startY,
           double goalX, double goalY, double startTime, double battery,
           double payload, const std::vector<NoFlyZone> &noFlyZones,
           const std::string &goalAction,
           const std::vector<std::string> &deliveryIds) {
    // Trivial case: already at goal
    double initialDist = euclidean(startX, startY, goalX, goalY);
    if (initialDist < 1e-6) {
      auto goal = buildState(startX, startY, startTime, battery, payload, 0.0,
                             0.0, nullptr, goalAction, deliveryIds);
      return {goal};
    }

    // Priority Queue — min f-cost
    std::priority_queue<std::shared_ptr<SearchState>,
                        std::vector<std::shared_ptr<SearchState>>,
                        SearchStateCompare>
        open;

    // Pareto frontier cache per (x,y) cell
    std::unordered_map<std::string, std::vector<std::shared_ptr<SearchState>>>
        paretoCache;

    // Root state
    double hStart = initialDist / PhysicsConstants::SPEED;
    auto root = buildState(startX, startY, startTime, battery, payload, 0.0,
                           hStart, nullptr, "DEPART", {});
    open.push(root);
    addToPareto(paretoCache, root);

    int iterations = 0;

    // Main A* loop
    while (!open.empty()) {
      if (++iterations > PhysicsConstants::MAX_ITERATIONS) {
        char buf[128];
        snprintf(buf, sizeof(buf), "(%.2f,%.2f)", goalX, goalY);
        throw PathNotFoundException(
            droneId, std::string(buf),
            "Search exceeded maximum iteration limit (" +
                std::to_string(PhysicsConstants::MAX_ITERATIONS) +
                "). Check that NFZs do not permanently block the target.");
      }

      auto current = open.top();
      open.pop();

      // Goal check
      if (euclidean(current->x, current->y, goalX, goalY) < 1e-6) {
        return reconstructPath(current);
      }

      // Generate successors
      auto successors = generateSuccessors(current, goalX, goalY, noFlyZones,
                                           payload, droneId, deliveryIds);

      for (auto &next : successors) {
        if (next->battery < 0)
          continue;
        if (isDominated(paretoCache, next))
          continue;
        removeDominated(paretoCache, next);
        addToPareto(paretoCache, next);
        open.push(next);
      }
    }

    char buf[128];
    snprintf(buf, sizeof(buf), "(%.2f,%.2f)", goalX, goalY);
    throw PathNotFoundException(
        droneId, std::string(buf),
        "Open set exhausted — target may be permanently blocked by NFZs "
        "or battery is insufficient for the journey.");
  }

private:
  // --- Successor Generation ---

  std::vector<std::shared_ptr<SearchState>>
  generateSuccessors(const std::shared_ptr<SearchState> &current, double goalX,
                     double goalY, const std::vector<NoFlyZone> &noFlyZones,
                     double payload, const std::string &droneId,
                     const std::vector<std::string> &deliveryIds) {
    std::vector<std::shared_ptr<SearchState>> successors;

    // 1. Fly directly to goal
    double distToGoal = euclidean(current->x, current->y, goalX, goalY);
    double arrivalTime = current->t + (distToGoal / PhysicsConstants::SPEED);

    if (!segmentIntersectsAnyActiveNfz(current->x, current->y, goalX, goalY,
                                       current->t, arrivalTime, noFlyZones)) {

      double drainToGoal = flightDrain(distToGoal, payload);
      double newBattery = current->battery - drainToGoal;

      if (newBattery >= 0) {
        std::string act = goalActionLabel(current->x, current->y, goalX, goalY,
                                          distToGoal, deliveryIds);
        auto goalState =
            buildState(goalX, goalY, arrivalTime, newBattery, payload,
                       arrivalTime, 0.0, current, act, deliveryIds);
        successors.push_back(goalState);
      }
    }

    // 2. Fly to tangent waypoints around active NFZs
    for (auto &nfz : noFlyZones) {
      if (!nfzIsActiveAt(nfz, current->t))
        continue;

      auto tangents =
          computeTangentWaypoints(current->x, current->y, goalX, goalY, nfz);

      for (auto &wp : tangents) {
        double distToWp = euclidean(current->x, current->y, wp[0], wp[1]);
        if (distToWp < 1e-6)
          continue;

        double wpArrival = current->t + (distToWp / PhysicsConstants::SPEED);

        if (segmentIntersectsAnyActiveNfz(current->x, current->y, wp[0], wp[1],
                                          current->t, wpArrival, noFlyZones)) {
          continue;
        }

        double drainToWp = flightDrain(distToWp, payload);
        double batAtWp = current->battery - drainToWp;
        if (batAtWp < 0)
          continue;

        double h =
            euclidean(wp[0], wp[1], goalX, goalY) / PhysicsConstants::SPEED;

        auto wpState = buildState(wp[0], wp[1], wpArrival, batAtWp, payload,
                                  wpArrival, h, current, "FLY", {});
        successors.push_back(wpState);
      }
    }

    // 3. WAIT in place for 1 time-unit
    bool nfzBlockingNow = segmentIntersectsAnyActiveNfz(
        current->x, current->y, goalX, goalY, current->t,
        current->t + distToGoal / PhysicsConstants::SPEED, noFlyZones);

    bool nfzWillClearSoon = false;
    for (auto &nfz : noFlyZones) {
      if (nfzIsActiveAt(nfz, current->t) &&
          nfz.tEnd - current->t <= PhysicsConstants::MAX_HOVER_WAIT) {
        nfzWillClearSoon = true;
        break;
      }
    }

    if (nfzBlockingNow && nfzWillClearSoon) {
      double hoverBattery = current->battery - PhysicsConstants::HOVER_DRAIN;
      if (hoverBattery >= 0) {
        double hoverT = current->t + 1.0;
        double h = euclidean(current->x, current->y, goalX, goalY) /
                   PhysicsConstants::SPEED;

        auto waitState =
            buildState(current->x, current->y, hoverT, hoverBattery, payload,
                       hoverT, h, current, "WAIT", {});
        successors.push_back(waitState);
      }
    }

    return successors;
  }

  // --- Pareto Dominance Logic ---

  bool isDominated(
      const std::unordered_map<
          std::string, std::vector<std::shared_ptr<SearchState>>> &cache,
      const std::shared_ptr<SearchState> &candidate) {
    std::string key = cacheKey(candidate->x, candidate->y);
    auto it = cache.find(key);
    if (it == cache.end())
      return false;

    for (auto &s : it->second) {
      bool oldArrivedNoLater = s->t <= candidate->t;
      bool oldHasMoreBattery = s->battery >= candidate->battery;
      if (oldArrivedNoLater && oldHasMoreBattery)
        return true;
    }
    return false;
  }

  void removeDominated(
      std::unordered_map<std::string, std::vector<std::shared_ptr<SearchState>>>
          &cache,
      const std::shared_ptr<SearchState> &newState) {
    std::string key = cacheKey(newState->x, newState->y);
    auto it = cache.find(key);
    if (it == cache.end())
      return;

    auto &existing = it->second;
    existing.erase(std::remove_if(existing.begin(), existing.end(),
                                  [&](const std::shared_ptr<SearchState> &s) {
                                    return newState->t <= s->t &&
                                           newState->battery >= s->battery;
                                  }),
                   existing.end());
  }

  void addToPareto(
      std::unordered_map<std::string, std::vector<std::shared_ptr<SearchState>>>
          &cache,
      const std::shared_ptr<SearchState> &state) {
    std::string key = cacheKey(state->x, state->y);
    cache[key].push_back(state);
  }

  std::string cacheKey(double x, double y) {
    double rx = std::round(x / PhysicsConstants::GRID_RESOLUTION) *
                PhysicsConstants::GRID_RESOLUTION;
    double ry = std::round(y / PhysicsConstants::GRID_RESOLUTION) *
                PhysicsConstants::GRID_RESOLUTION;
    return std::to_string(rx) + "," + std::to_string(ry);
  }

  // --- NFZ Geometry ---

  bool segmentIntersectsAnyActiveNfz(double x1, double y1, double x2, double y2,
                                     double tStart, double tEnd,
                                     const std::vector<NoFlyZone> &noFlyZones) {
    if (noFlyZones.empty())
      return false;

    for (auto &nfz : noFlyZones) {
      bool temporalOverlap = tStart < nfz.tEnd && tEnd > nfz.tStart;
      if (!temporalOverlap)
        continue;
      if (segmentIntersectsNfz(x1, y1, x2, y2, nfz))
        return true;
    }
    return false;
  }

  bool segmentIntersectsNfz(double x1, double y1, double x2, double y2,
                            const NoFlyZone &nfz) {
    if (nfz.shape == "circle") {
      return segmentIntersectsCircle(x1, y1, x2, y2, nfz.center[0],
                                     nfz.center[1], nfz.radius);
    } else if (nfz.shape == "polygon") {
      return segmentIntersectsPolygon(x1, y1, x2, y2, nfz.corners);
    }
    return false;
  }

  bool segmentIntersectsCircle(double x1, double y1, double x2, double y2,
                               double cx, double cy, double radius) {
    double dx = x2 - x1;
    double dy = y2 - y1;
    double lenSq = dx * dx + dy * dy;

    if (lenSq < 1e-12) {
      return euclidean(x1, y1, cx, cy) <= radius;
    }

    double t =
        std::max(0.0, std::min(1.0, ((cx - x1) * dx + (cy - y1) * dy) / lenSq));

    double closestX = x1 + t * dx;
    double closestY = y1 + t * dy;

    return euclidean(closestX, closestY, cx, cy) <= radius;
  }

  bool
  segmentIntersectsPolygon(double x1, double y1, double x2, double y2,
                           const std::vector<std::vector<double>> &corners) {
    if (corners.size() < 3)
      return false;

    int n = (int)corners.size();
    for (int i = 0; i < n; i++) {
      auto &a = corners[i];
      auto &b = corners[(i + 1) % n];
      if (segmentsIntersect(x1, y1, x2, y2, a[0], a[1], b[0], b[1])) {
        return true;
      }
    }
    return pointInPolygon(x1, y1, corners);
  }

  bool segmentsIntersect(double ax, double ay, double bx, double by, double cx,
                         double cy, double dx, double dy) {
    double d1 = cross(cx, cy, dx, dy, ax, ay);
    double d2 = cross(cx, cy, dx, dy, bx, by);
    double d3 = cross(ax, ay, bx, by, cx, cy);
    double d4 = cross(ax, ay, bx, by, dx, dy);

    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
        ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
      return true;
    }

    if (d1 == 0 && onSegment(cx, cy, dx, dy, ax, ay))
      return true;
    if (d2 == 0 && onSegment(cx, cy, dx, dy, bx, by))
      return true;
    if (d3 == 0 && onSegment(ax, ay, bx, by, cx, cy))
      return true;
    if (d4 == 0 && onSegment(ax, ay, bx, by, dx, dy))
      return true;

    return false;
  }

  double cross(double px, double py, double qx, double qy, double rx,
               double ry) {
    return (qx - px) * (ry - py) - (qy - py) * (rx - px);
  }

  bool onSegment(double px, double py, double qx, double qy, double rx,
                 double ry) {
    return std::min(px, qx) <= rx && rx <= std::max(px, qx) &&
           std::min(py, qy) <= ry && ry <= std::max(py, qy);
  }

  bool pointInPolygon(double px, double py,
                      const std::vector<std::vector<double>> &corners) {
    int n = (int)corners.size();
    bool inside = false;
    for (int i = 0, j = n - 1; i < n; j = i++) {
      double xi = corners[i][0], yi = corners[i][1];
      double xj = corners[j][0], yj = corners[j][1];
      if (((yi > py) != (yj > py)) &&
          (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  }

  bool nfzIsActiveAt(const NoFlyZone &nfz, double t) {
    return t >= nfz.tStart && t < nfz.tEnd;
  }

  // --- Tangent Waypoint Generation ---

  std::vector<std::vector<double>>
  computeTangentWaypoints(double fromX, double fromY, double toX, double toY,
                          const NoFlyZone &nfz) {
    std::vector<std::vector<double>> waypoints;

    if (nfz.shape == "circle") {
      double cx = nfz.center[0];
      double cy = nfz.center[1];
      double r = nfz.radius + PhysicsConstants::NFZ_TANGENT_CLEARANCE;

      double dxMain = toX - fromX;
      double dyMain = toY - fromY;
      double mainLen = std::sqrt(dxMain * dxMain + dyMain * dyMain);
      if (mainLen < 1e-9)
        return waypoints;

      double uxMain = dxMain / mainLen;
      double uyMain = dyMain / mainLen;

      for (int i = 0; i < PhysicsConstants::NFZ_TANGENT_POINTS; i++) {
        double angle = 2.0 * M_PI * i / PhysicsConstants::NFZ_TANGENT_POINTS;
        double wpX = cx + r * std::cos(angle);
        double wpY = cy + r * std::sin(angle);

        double projX = wpX - fromX;
        double projY = wpY - fromY;
        double proj = projX * uxMain + projY * uyMain;

        if (proj > 0 && proj < mainLen + r) {
          waypoints.push_back({wpX, wpY});
        }
      }
    } else if (nfz.shape == "polygon" && !nfz.corners.empty()) {
      for (auto &corner : nfz.corners) {
        waypoints.push_back(corner);
      }
    }

    return waypoints;
  }

  // --- Path Reconstruction ---

  std::vector<std::shared_ptr<SearchState>>
  reconstructPath(const std::shared_ptr<SearchState> &goal) {
    std::vector<std::shared_ptr<SearchState>> path;
    auto current = goal;
    while (current != nullptr) {
      path.push_back(current);
      current = current->parent;
    }
    std::reverse(path.begin(), path.end());
    // Remove the root DEPART node
    if (!path.empty() && path.front()->action == "DEPART") {
      path.erase(path.begin());
    }
    return path;
  }

  // --- State Construction ---

  std::shared_ptr<SearchState>
  buildState(double x, double y, double t, double battery, double payload,
             double gCost, double hCost, std::shared_ptr<SearchState> parent,
             const std::string &action,
             const std::vector<std::string> &deliveryIds) {
    auto s = std::make_shared<SearchState>();
    s->x = x;
    s->y = y;
    s->t = t;
    s->battery = battery;
    s->payload = payload;
    s->gCost = gCost;
    s->hCost = hCost;
    s->parent = parent;
    s->action = action;
    s->deliveryIds = deliveryIds;
    return s;
  }

  std::string goalActionLabel(double fromX, double fromY, double toX,
                              double toY, double dist,
                              const std::vector<std::string> &deliveryIds) {
    if (!deliveryIds.empty())
      return "DELIVER";
    return "FLY";
  }
};

// ============================================================================
// RoutingService — Mission Orchestrator
// ============================================================================

class RoutingService {
public:
  RoutingService() : pathfinder_() {}

  ManifestResponse calculateRoutes(const EnvironmentRequest &request) {
    std::cout << "[INFO] Starting dispatch: " << request.drones.size()
              << " drones, " << request.deliveries.size() << " deliveries, "
              << request.noFlyZones.size() << " NFZs" << std::endl;

    ChargingStation primaryBase = selectPrimaryBase(request);
    auto assignments =
        assignDeliveries(request.drones, request.deliveries, primaryBase);

    ManifestResponse response;
    for (auto &assignment : assignments) {
      auto manifest = buildManifest(assignment, request);
      std::cout << "[INFO] [" << assignment.drone.id
                << "] Manifest built: " << manifest.path.size() << " waypoints"
                << std::endl;
      response.flightManifest.push_back(manifest);
    }

    return response;
  }

private:
  TemporalPathfinder pathfinder_;

  // --- Assignment Logic ---

  std::vector<MissionAssignment>
  assignDeliveries(const std::vector<Drone> &drones,
                   const std::vector<Delivery> &deliveries,
                   const ChargingStation &base) {
    std::unordered_map<std::string, std::vector<Delivery>> assignments;
    std::unordered_map<std::string, double> remainingCapacity;

    for (auto &drone : drones) {
      assignments[drone.id] = {};
      remainingCapacity[drone.id] = drone.maxPayload;
    }

    // Sort deliveries by distance from base
    std::vector<Delivery> sorted = deliveries;
    std::sort(sorted.begin(), sorted.end(),
              [&](const Delivery &a, const Delivery &b) {
                return euclidean(base.x, base.y, a.x, a.y) <
                       euclidean(base.x, base.y, b.x, b.y);
              });

    for (auto &delivery : sorted) {
      std::string bestDroneId;
      double bestCapacity = -1;

      for (auto &drone : drones) {
        double cap = remainingCapacity[drone.id];
        if (cap >= delivery.weight && cap > bestCapacity) {
          bestCapacity = cap;
          bestDroneId = drone.id;
        }
      }

      if (bestDroneId.empty()) {
        std::cout << "[WARN] No drone has capacity for delivery '"
                  << delivery.id << "' (" << delivery.weight
                  << "kg). Using fallback." << std::endl;
        double maxCap = -1;
        for (auto &drone : drones) {
          if (remainingCapacity[drone.id] > maxCap) {
            maxCap = remainingCapacity[drone.id];
            bestDroneId = drone.id;
          }
        }
      }

      assignments[bestDroneId].push_back(delivery);
      remainingCapacity[bestDroneId] -= delivery.weight;
    }

    // Build MissionAssignment objects
    std::vector<MissionAssignment> result;
    for (auto &drone : drones) {
      auto &assigned = assignments[drone.id];
      auto ordered = nearestNeighbourOrder(assigned, base);
      double totalPayload = 0;
      for (auto &d : ordered)
        totalPayload += d.weight;

      MissionAssignment ma;
      ma.drone = drone;
      ma.deliveries = ordered;
      ma.baseStation = base;
      ma.startTime = 0.0;
      ma.initialBattery = PhysicsConstants::BATTERY_CAPACITY;
      ma.totalPayload = totalPayload;
      result.push_back(ma);
    }
    return result;
  }

  std::vector<Delivery>
  nearestNeighbourOrder(const std::vector<Delivery> &deliveries,
                        const ChargingStation &base) {
    if (deliveries.empty())
      return {};

    std::vector<Delivery> remaining = deliveries;
    std::vector<Delivery> ordered;
    double curX = base.x;
    double curY = base.y;

    while (!remaining.empty()) {
      int bestIdx = 0;
      double bestDist = euclidean(curX, curY, remaining[0].x, remaining[0].y);

      for (int i = 1; i < (int)remaining.size(); i++) {
        double d = euclidean(curX, curY, remaining[i].x, remaining[i].y);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }

      ordered.push_back(remaining[bestIdx]);
      curX = remaining[bestIdx].x;
      curY = remaining[bestIdx].y;
      remaining.erase(remaining.begin() + bestIdx);
    }
    return ordered;
  }

  // --- Manifest Building ---

  DroneManifest buildManifest(const MissionAssignment &assignment,
                              const EnvironmentRequest &request) {
    std::string droneId = assignment.drone.id;
    std::vector<PathNode> path;

    double curX = assignment.baseStation.x;
    double curY = assignment.baseStation.y;
    double curT = assignment.startTime;
    double curBat = assignment.initialBattery;
    double curPay = assignment.totalPayload;

    const auto &nfzs = request.noFlyZones;

    // Departure node
    PathNode depart;
    depart.x = curX;
    depart.y = curY;
    depart.t = curT;
    depart.action = "DEPART";
    depart.batteryPct = batteryPctUtil(curBat);
    path.push_back(depart);

    // Delivery legs
    for (auto &delivery : assignment.deliveries) {
      double distToDelivery = euclidean(curX, curY, delivery.x, delivery.y);
      double distDeliveryToBase =
          euclidean(delivery.x, delivery.y, assignment.baseStation.x,
                    assignment.baseStation.y);
      double totalDistNeeded = distToDelivery + distDeliveryToBase;
      double batNeeded = flightDrain(totalDistNeeded, curPay) +
                         PhysicsConstants::MINIMUM_RETURN_BATTERY;

      if (curBat < batNeeded) {
        // Route to nearest charging station
        ChargingStation nearest =
            findNearestStation(curX, curY, request.chargingStations);

        auto chargePathNodes =
            pathfinder_.findPath(droneId, curX, curY, nearest.x, nearest.y,
                                 curT, curBat, curPay, nfzs, "CHARGE", {});
        appendPathNodes(path, chargePathNodes,
                        PhysicsConstants::BATTERY_CAPACITY);

        if (!chargePathNodes.empty()) {
          auto &lastChargeNode = chargePathNodes.back();
          double chargeTime = (PhysicsConstants::BATTERY_CAPACITY - curBat) /
                              PhysicsConstants::CHARGE_RATE;
          curT = lastChargeNode->t + chargeTime;
          curX = nearest.x;
          curY = nearest.y;
          curBat = PhysicsConstants::BATTERY_CAPACITY;
        }
      }

      // Plan path to delivery location
      std::vector<std::string> deliveryIdList = {delivery.id};
      auto deliveryPath = pathfinder_.findPath(droneId, curX, curY, delivery.x,
                                               delivery.y, curT, curBat, curPay,
                                               nfzs, "DELIVER", deliveryIdList);
      appendPathNodes(path, deliveryPath, PhysicsConstants::BATTERY_CAPACITY);

      if (!deliveryPath.empty()) {
        auto &lastNode = deliveryPath.back();
        curX = delivery.x;
        curY = delivery.y;
        curT = lastNode->t;
        curBat = lastNode->battery;
        curPay = std::max(0.0, curPay - delivery.weight);
      }
    }

    // Return to base
    double baseX = assignment.baseStation.x;
    double baseY = assignment.baseStation.y;

    if (euclidean(curX, curY, baseX, baseY) > 1e-6) {
      auto returnPath =
          pathfinder_.findPath(droneId, curX, curY, baseX, baseY, curT, curBat,
                               curPay, nfzs, "LAND", {});
      appendPathNodes(path, returnPath, PhysicsConstants::BATTERY_CAPACITY);
    } else {
      PathNode land;
      land.x = baseX;
      land.y = baseY;
      land.t = curT;
      land.action = "LAND";
      land.batteryPct = batteryPctUtil(curBat);
      path.push_back(land);
    }

    DroneManifest manifest;
    manifest.droneId = droneId;
    manifest.path = path;
    return manifest;
  }

  // --- Path Node Conversion ---

  void appendPathNodes(std::vector<PathNode> &path,
                       const std::vector<std::shared_ptr<SearchState>> &states,
                       double batteryCapacity) {
    if (states.empty())
      return;

    for (auto &state : states) {
      PathNode node;
      node.x = roundCoord(state->x);
      node.y = roundCoord(state->y);
      node.t = roundCoord(state->t);
      node.action = state->action;
      node.batteryPct = state->batteryPct(batteryCapacity);

      if (!state->deliveryIds.empty()) {
        node.deliveryIds = state->deliveryIds;
        if (state->deliveryIds.size() == 1) {
          node.deliveryId = state->deliveryIds[0];
        }
      }

      // Suppress duplicate consecutive FLY waypoints at same position
      if (!path.empty()) {
        auto &last = path.back();
        if (std::abs(last.x - node.x) < 1e-6 &&
            std::abs(last.y - node.y) < 1e-6 && node.action == "FLY") {
          continue;
        }
      }
      path.push_back(node);
    }
  }

  // --- Utility ---

  ChargingStation selectPrimaryBase(const EnvironmentRequest &request) {
    if (!request.chargingStations.empty()) {
      return request.chargingStations[0];
    }
    std::cout << "[WARN] No charging stations; using origin (0,0)."
              << std::endl;
    ChargingStation origin;
    origin.x = 0.0;
    origin.y = 0.0;
    return origin;
  }

  ChargingStation
  findNearestStation(double fromX, double fromY,
                     const std::vector<ChargingStation> &stations) {
    if (stations.empty()) {
      ChargingStation fallback;
      fallback.x = 0.0;
      fallback.y = 0.0;
      return fallback;
    }

    int bestIdx = 0;
    double bestDist = euclidean(fromX, fromY, stations[0].x, stations[0].y);

    for (int i = 1; i < (int)stations.size(); i++) {
      double d = euclidean(fromX, fromY, stations[i].x, stations[i].y);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    return stations[bestIdx];
  }
};

// ============================================================================
// HTTP Server — REST Entry Point
// ============================================================================

int main() {
  httplib::Server svr;
  RoutingService routingService;

  // CORS headers for all responses
  auto setCorsHeaders = [](httplib::Response &res) {
    res.set_header("Access-Control-Allow-Origin", "*");
    res.set_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set_header("Access-Control-Allow-Headers",
                   "Content-Type, Accept, Authorization");
  };

  // Handle CORS preflight
  svr.Options("/(.*)", [&](const httplib::Request &, httplib::Response &res) {
    setCorsHeaders(res);
    res.status = 204;
  });

  // POST /api/v1/dispatch
  svr.Post("/api/v1/dispatch", [&](const httplib::Request &req,
                                   httplib::Response &res) {
    setCorsHeaders(res);

    auto startTime = std::chrono::steady_clock::now();

    try {
      // Parse request JSON
      json requestJson = json::parse(req.body);
      EnvironmentRequest envRequest = requestJson.get<EnvironmentRequest>();

      // Validate required fields
      if (envRequest.mapSize.size() != 2) {
        json errJ;
        errJ["timestamp"] =
            std::chrono::duration_cast<std::chrono::seconds>(
                std::chrono::system_clock::now().time_since_epoch())
                .count();
        errJ["status"] = 400;
        errJ["error"] = "VALIDATION_ERROR";
        errJ["message"] = "map_size must contain exactly [width, height]";
        res.status = 400;
        res.set_content(errJ.dump(2), "application/json");
        return;
      }

      if (envRequest.drones.empty()) {
        json errJ;
        errJ["timestamp"] =
            std::chrono::duration_cast<std::chrono::seconds>(
                std::chrono::system_clock::now().time_since_epoch())
                .count();
        errJ["status"] = 400;
        errJ["error"] = "VALIDATION_ERROR";
        errJ["message"] = "drones list is required";
        res.status = 400;
        res.set_content(errJ.dump(2), "application/json");
        return;
      }

      std::cout << "[INFO] POST /api/v1/dispatch — drones="
                << envRequest.drones.size()
                << ", deliveries=" << envRequest.deliveries.size()
                << ", nfzs=" << envRequest.noFlyZones.size() << std::endl;

      // Run dispatch
      ManifestResponse response = routingService.calculateRoutes(envRequest);

      auto endTime = std::chrono::steady_clock::now();
      long elapsedMs = std::chrono::duration_cast<std::chrono::milliseconds>(
                           endTime - startTime)
                           .count();

      std::cout << "[INFO] Dispatch complete in " << elapsedMs << "ms — "
                << response.flightManifest.size() << " manifests generated"
                << std::endl;

      json responseJson = manifestResponseToJson(response);
      res.status = 200;
      res.set_content(responseJson.dump(2), "application/json");

    } catch (const PathNotFoundException &e) {
      json errJ;
      errJ["timestamp"] =
          std::chrono::duration_cast<std::chrono::seconds>(
              std::chrono::system_clock::now().time_since_epoch())
              .count();
      errJ["status"] = 422;
      errJ["error"] = "PATH_NOT_FOUND";
      errJ["message"] = e.what();
      res.status = 422;
      res.set_content(errJ.dump(2), "application/json");

    } catch (const json::exception &e) {
      json errJ;
      errJ["timestamp"] =
          std::chrono::duration_cast<std::chrono::seconds>(
              std::chrono::system_clock::now().time_since_epoch())
              .count();
      errJ["status"] = 400;
      errJ["error"] = "VALIDATION_ERROR";
      errJ["message"] = std::string("JSON parsing error: ") + e.what();
      res.status = 400;
      res.set_content(errJ.dump(2), "application/json");

    } catch (const std::exception &e) {
      json errJ;
      errJ["timestamp"] =
          std::chrono::duration_cast<std::chrono::seconds>(
              std::chrono::system_clock::now().time_since_epoch())
              .count();
      errJ["status"] = 500;
      errJ["error"] = "INTERNAL_ERROR";
      errJ["message"] = "An unexpected error occurred in the dispatch engine.";
      res.status = 500;
      res.set_content(errJ.dump(2), "application/json");
      std::cerr << "[ERROR] " << e.what() << std::endl;
    }
  });

  // Health endpoint
  svr.Get("/actuator/health",
          [&](const httplib::Request &, httplib::Response &res) {
            setCorsHeaders(res);
            json health;
            health["status"] = "UP";
            health["components"]["app"]["status"] = "UP";
            health["components"]["app"]["details"]["name"] =
                "Drone Dispatch Engine (C++)";
            health["components"]["app"]["details"]["version"] = "1.0.0";
            res.set_content(health.dump(2), "application/json");
          });

  std::cout << "============================================================"
            << std::endl;
  std::cout << "  Autonomous Drone Dispatch Engine (C++)" << std::endl;
  std::cout << "  Listening on http://localhost:8080" << std::endl;
  std::cout << "  POST /api/v1/dispatch" << std::endl;
  std::cout << "  GET  /actuator/health" << std::endl;
  std::cout << "============================================================"
            << std::endl;

  svr.listen("0.0.0.0", 8080);

  return 0;
}
