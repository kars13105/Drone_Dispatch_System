import React from 'react';
import { Navigation, Activity, Cpu, Clock, Shield, Wifi } from 'lucide-react';

function StatCell({ label, value, unit, accent }) {
  return (
    <div className="flex flex-col px-4 py-2 border-r border-border last:border-r-0">
      <span className="font-mono text-xs text-muted uppercase tracking-widest mb-0.5">{label}</span>
      <span
        className="font-mono text-base font-bold tabular-nums"
        style={{ color: accent || 'var(--color-accent)' }}
      >
        {value}
        {unit && <span className="text-xs font-normal text-text-dim ml-1">{unit}</span>}
      </span>
    </div>
  );
}

function SystemStatus({ label, ok }) {
  return (
    <div className="flex items-center gap-1.5 text-xs font-mono">
      <div
        className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-success status-pulse' : 'bg-danger danger-pulse'}`}
      />
      <span className={ok ? 'text-text-dim' : 'text-danger'}>{label}</span>
    </div>
  );
}

export default function Header({
  missionStatus,
  analytics,
  droneCount,
  lastDispatchTime,
  apiConnected,
}) {
  const { completedDeliveries = 0, totalDeliveries = 0, deliveryRate = 0, droneStats = [] } = analytics;

  const activeDrones = droneStats.filter((d) => d.isActive).length;

  const statusColor =
    missionStatus === 'OPTIMIZING'
      ? '#f59e0b'
      : missionStatus === 'COMPLETE'
      ? '#10b981'
      : missionStatus === 'ERROR'
      ? '#ef4444'
      : '#6a86a8';

  return (
    <div className="panel-glass border-b border-border flex items-stretch h-14 flex-shrink-0">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 border-r border-border flex-shrink-0">
        <Navigation size={18} className="text-accent" strokeWidth={1.5} />
        <div className="flex flex-col">
          <span className="font-display text-sm font-semibold text-text-bright tracking-wider">
            AEGIS
          </span>
          <span className="font-mono text-xs text-muted -mt-0.5 tracking-widest">
            DISPATCH
          </span>
        </div>
      </div>

      {/* Mission status */}
      <div className="flex items-center px-4 border-r border-border gap-2.5">
        <div
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{
            background: statusColor,
            boxShadow: `0 0 8px ${statusColor}`,
            animation:
              missionStatus === 'OPTIMIZING' || missionStatus === 'RUNNING'
                ? 'dangerPulse 1s ease-in-out infinite'
                : 'none',
          }}
        />
        <span
          className="font-mono text-xs font-semibold tracking-widest"
          style={{ color: statusColor }}
        >
          {missionStatus}
        </span>
      </div>

      {/* Stats */}
      <div className="flex flex-1 overflow-x-auto">
        <StatCell label="Active Drones" value={activeDrones} unit={`/ ${droneCount}`} />
        <StatCell
          label="Deliveries"
          value={completedDeliveries}
          unit={`/ ${totalDeliveries}`}
          accent={deliveryRate === 100 ? '#10b981' : '#00d4ff'}
        />
        <StatCell
          label="Success Rate"
          value={`${deliveryRate}`}
          unit="%"
          accent={deliveryRate === 100 ? '#10b981' : deliveryRate > 50 ? '#f59e0b' : '#00d4ff'}
        />
      </div>

      {/* System checks */}
      <div className="flex items-center gap-4 px-5 border-l border-border">
        <SystemStatus label="API" ok={apiConnected} />
        <SystemStatus label="A*" ok={true} />
        <SystemStatus label="NFZ" ok={true} />
      </div>

      {/* Time */}
      {lastDispatchTime && (
        <div className="flex items-center gap-2 px-4 border-l border-border">
          <Clock size={11} className="text-muted" />
          <span className="font-mono text-xs text-muted">
            {lastDispatchTime}
          </span>
        </div>
      )}
    </div>
  );
}
