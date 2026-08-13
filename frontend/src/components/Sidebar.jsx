import React, { useState } from 'react';
import {
  Radio,
  Package,
  Zap,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Circle,
  Crosshair,
} from 'lucide-react';

function Section({ title, icon: Icon, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-surface transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2 text-xs font-mono font-semibold text-text-dim uppercase tracking-widest">
          <Icon size={11} />
          <span>{title}</span>
        </div>
        {open ? (
          <ChevronDown size={11} className="text-muted" />
        ) : (
          <ChevronRight size={11} className="text-muted" />
        )}
      </button>
      {open && <div className="pb-2">{children}</div>}
    </div>
  );
}

function ActionBadge({ action }) {
  const map = {
    START: { bg: 'bg-accent/10', text: 'text-accent', label: 'START' },
    FLY: { bg: 'bg-success/10', text: 'text-success', label: 'FLY' },
    WAIT: { bg: 'bg-warning/10', text: 'text-warning', label: 'WAIT' },
    DELIVER: { bg: 'bg-drone/10', text: 'text-drone', label: 'DELIVER' },
    CHARGE: { bg: 'bg-success/10', text: 'text-success', label: 'CHARGE' },
    IDLE: { bg: 'bg-surface', text: 'text-muted', label: 'IDLE' },
  };
  const style = map[action] ?? map.IDLE;
  return (
    <span className={`tag ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  );
}

function DroneRow({ drone, isSelected, onClick }) {
  const [r, g, b] = drone.color;
  const colorHex = `rgb(${r},${g},${b})`;

  return (
    <button
      className={`w-full data-row flex items-center gap-3 px-4 py-2 text-left transition-colors ${
        isSelected ? 'bg-accent/5 border-l-2 border-accent' : 'border-l-2 border-transparent'
      }`}
      onClick={onClick}
    >
      {/* Color indicator */}
      <div
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ background: colorHex, boxShadow: `0 0 6px ${colorHex}` }}
      />

      {/* Drone ID */}
      <span className="font-mono text-xs font-semibold text-text-bright flex-1">
        {drone.drone_id}
      </span>

      {/* Action */}
      <ActionBadge action={drone.currentAction} />

      {/* Distance */}
      <span className="font-mono text-xs text-text-dim">
        {drone.distanceTraveled.toFixed(0)}u
      </span>
    </button>
  );
}

export default function Sidebar({
  environmentRequest,
  manifestResponse,
  droneStats,
  analytics,
  currentTime,
  selectedDrone,
  onSelectDrone,
}) {
  const { drones = [], deliveries = [], no_fly_zones = [], charging_stations = [] } = environmentRequest;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Drone Fleet */}
      <Section title="Fleet Status" icon={Radio} defaultOpen>
        {droneStats.length === 0 ? (
          <div className="px-4 py-2 font-mono text-xs text-muted">
            Awaiting dispatch...
          </div>
        ) : (
          droneStats.map((drone) => (
            <DroneRow
              key={drone.drone_id}
              drone={drone}
              isSelected={selectedDrone === drone.drone_id}
              onClick={() =>
                onSelectDrone(
                  selectedDrone === drone.drone_id ? null : drone.drone_id
                )
              }
            />
          ))
        )}

        {/* Static drone list before dispatch */}
        {droneStats.length === 0 &&
          drones.map((d) => (
            <div key={d.id} className="flex items-center gap-3 px-4 py-1.5 data-row">
              <div className="w-2 h-2 rounded-full bg-muted flex-shrink-0" />
              <span className="font-mono text-xs text-text-dim">{d.id}</span>
              <span className="tag bg-surface text-muted ml-auto">
                {d.max_payload}kg cap
              </span>
            </div>
          ))}
      </Section>

      {/* Deliveries */}
      <Section title="Delivery Manifest" icon={Package} defaultOpen>
        {deliveries.length === 0 ? (
          <div className="px-4 py-2 font-mono text-xs text-muted">No deliveries loaded</div>
        ) : (
          deliveries.map((d) => {
            const isCompleted =
              analytics?.droneStats?.some((drone) =>
                drone?.position?.action === 'DELIVER' &&
                manifestResponse?.flight_manifest?.some((m) =>
                  m.path.some(
                    (wp) =>
                      wp.action === 'DELIVER' &&
                      wp.delivery_id === d.id &&
                      wp.t <= currentTime
                  )
                )
              ) ||
              manifestResponse?.flight_manifest?.some((m) =>
                m.path.some(
                  (wp) =>
                    wp.action === 'DELIVER' &&
                    wp.delivery_id === d.id &&
                    wp.t <= currentTime
                )
              );

            return (
              <div
                key={d.id}
                className="flex flex-col gap-1 px-4 py-2 data-row border-l-2 border-transparent"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-text-bright">
                    {d.id}
                  </span>
                  {isCompleted ? (
                    <span className="tag bg-success/10 text-success">DELIVERED</span>
                  ) : (
                    <span className="tag bg-warning/10 text-warning">PENDING</span>
                  )}
                </div>
                <div className="flex gap-3 font-mono text-xs text-text-dim">
                  <span>({d.x}, {d.y})</span>
                  <span className="text-muted">·</span>
                  <span>{d.weight}kg</span>
                  <span className="text-muted">·</span>
                  <span className={currentTime > d.deadline ? 'text-danger' : 'text-text-dim'}>
                    DL: T{d.deadline}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </Section>

      {/* No-Fly Zones */}
      <Section title="No-Fly Zones" icon={AlertTriangle} defaultOpen>
        {no_fly_zones.length === 0 ? (
          <div className="px-4 py-2 font-mono text-xs text-muted">Clear airspace</div>
        ) : (
          no_fly_zones.map((nfz, i) => {
            const isActive = currentTime >= nfz.T_start && currentTime <= nfz.T_end;
            return (
              <div
                key={i}
                className={`flex flex-col gap-1 px-4 py-2 data-row border-l-2 transition-colors ${
                  isActive ? 'border-danger' : 'border-transparent'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-text-bright">
                    NFZ-{String(i + 1).padStart(2, '0')}
                  </span>
                  {isActive ? (
                    <span className="tag bg-danger/10 text-danger danger-pulse">ACTIVE</span>
                  ) : (
                    <span className="tag bg-surface text-muted">STANDBY</span>
                  )}
                </div>
                <div className="font-mono text-xs text-text-dim">
                  {nfz.shape} · r={nfz.radius} · ({nfz.center?.join(', ')})
                </div>
                <div className="font-mono text-xs text-muted">
                  T{nfz.T_start} → T{nfz.T_end}
                  {isActive && (
                    <span className="text-danger ml-2">
                      ({Math.max(0, nfz.T_end - currentTime).toFixed(0)}s remaining)
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </Section>

      {/* Charging Stations */}
      <Section title="Charging Stations" icon={Zap} defaultOpen={false}>
        {charging_stations.map((s, i) => (
          <div key={i} className="flex items-center justify-between px-4 py-2 data-row">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-success status-pulse" />
              <span className="font-mono text-xs text-text-bright">CS{i + 1}</span>
            </div>
            <span className="font-mono text-xs text-text-dim">
              ({s.x}, {s.y})
            </span>
            <span className="tag bg-success/10 text-success">ONLINE</span>
          </div>
        ))}
      </Section>

      {/* Flight Manifest (raw, scrollable) */}
      {manifestResponse && (
        <Section title="Flight Log" icon={Crosshair} defaultOpen={false}>
          <div className="max-h-48 overflow-y-auto px-4 py-1">
            {manifestResponse.flight_manifest.map((entry) =>
              entry.path.map((wp, i) => {
                const isPast = wp.t <= currentTime;
                return (
                  <div
                    key={`${entry.drone_id}-${i}`}
                    className={`flex items-center gap-2 py-0.5 font-mono text-xs transition-colors ${
                      isPast ? 'text-text-dim' : 'text-muted'
                    }`}
                  >
                    <Circle
                      size={5}
                      fill={isPast ? 'currentColor' : 'transparent'}
                      className={isPast ? 'text-accent' : 'text-muted'}
                    />
                    <span className="text-muted w-12 flex-shrink-0">T{wp.t.toFixed(1)}</span>
                    <ActionBadge action={wp.action} />
                    <span>
                      ({wp.x},{wp.y})
                    </span>
                    {wp.delivery_id && (
                      <span className="text-warning">→ {wp.delivery_id}</span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </Section>
      )}
    </div>
  );
}
