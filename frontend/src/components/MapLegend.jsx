import React from 'react';
import { Navigation, Package, Zap, AlertTriangle, Minus } from 'lucide-react';

const LEGEND_ITEMS = [
  { icon: null, color: '#00d4ff', label: 'Drone' },
  { icon: null, color: '#fbbf24', label: 'Delivery Point' },
  { icon: null, color: '#10b981', label: 'Charging Station' },
  { icon: null, color: '#ef4444', label: 'No-Fly Zone' },
  { icon: null, color: '#00d4ff', label: 'Flight Trail', opacity: 0.5, dash: true },
  { icon: null, color: '#00d4ff', label: 'Route Plan', opacity: 0.2, dash: true },
];

function LegendDot({ color, opacity = 1, dash }) {
  return dash ? (
    <div
      className="w-5 h-0.5 flex-shrink-0"
      style={{
        background: `repeating-linear-gradient(90deg, ${color} 0, ${color} 3px, transparent 3px, transparent 6px)`,
        opacity,
      }}
    />
  ) : (
    <div
      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
      style={{ background: color, opacity, boxShadow: `0 0 5px ${color}` }}
    />
  );
}

export default function MapLegend() {
  return (
    <div className="panel-glass rounded-sm px-3 py-2.5 flex flex-col gap-1.5 min-w-[140px]">
      <div className="font-mono text-xs text-muted uppercase tracking-widest mb-0.5">
        Legend
      </div>
      {LEGEND_ITEMS.map((item) => (
        <div key={item.label} className="flex items-center gap-2">
          <LegendDot color={item.color} opacity={item.opacity} dash={item.dash} />
          <span className="font-mono text-xs text-text-dim">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
