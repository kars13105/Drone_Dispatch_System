import React, { useState, useCallback } from 'react';
import {
  Play,
  Settings,
  Code,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Cpu,
} from 'lucide-react';
import { DEFAULT_ENVIRONMENT_REQUEST } from '../api.js';

export default function ControlPanel({
  onRunOptimization,
  missionStatus,
  isLoading,
  errorMessage,
  lastResponse,
}) {
  const [showPayload, setShowPayload] = useState(false);
  const [payloadText, setPayloadText] = useState(
    JSON.stringify(DEFAULT_ENVIRONMENT_REQUEST, null, 2)
  );
  const [payloadError, setPayloadError] = useState(null);

  const handlePayloadChange = useCallback((e) => {
    setPayloadText(e.target.value);
    try {
      JSON.parse(e.target.value);
      setPayloadError(null);
    } catch {
      setPayloadError('Invalid JSON');
    }
  }, []);

  const handleRun = useCallback(() => {
    let payload;
    try {
      payload = JSON.parse(payloadText);
    } catch {
      setPayloadError('Cannot dispatch: invalid JSON payload');
      return;
    }
    onRunOptimization(payload);
  }, [payloadText, onRunOptimization]);

  const resetPayload = useCallback(() => {
    setPayloadText(JSON.stringify(DEFAULT_ENVIRONMENT_REQUEST, null, 2));
    setPayloadError(null);
  }, []);

  const isRunning = isLoading || missionStatus === 'OPTIMIZING';

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* Run Button */}
      <button
        onClick={handleRun}
        disabled={isRunning || !!payloadError}
        className="btn-primary w-full flex items-center justify-center gap-2 px-4 py-3 rounded font-mono text-sm font-bold tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background: isRunning
            ? 'rgba(245,158,11,0.15)'
            : 'rgba(0,212,255,0.12)',
          border: `1px solid ${isRunning ? 'rgba(245,158,11,0.5)' : 'rgba(0,212,255,0.4)'}`,
          color: isRunning ? '#f59e0b' : '#00d4ff',
          boxShadow: isRunning
            ? '0 0 20px rgba(245,158,11,0.15)'
            : '0 0 20px rgba(0,212,255,0.1)',
        }}
      >
        {isRunning ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            OPTIMIZING...
          </>
        ) : (
          <>
            <Cpu size={14} />
            RUN OPTIMIZATION
          </>
        )}
      </button>

      {/* Status feedback */}
      {missionStatus === 'COMPLETE' && !isRunning && (
        <div className="flex items-center gap-2 px-3 py-2 rounded bg-success/10 border border-success/30 font-mono text-xs text-success">
          <CheckCircle2 size={12} />
          Manifest received — {lastResponse?.flight_manifest?.length ?? 0} drone(s) dispatched
        </div>
      )}

      {missionStatus === 'ERROR' && errorMessage && (
        <div className="flex items-start gap-2 px-3 py-2 rounded bg-danger/10 border border-danger/30 font-mono text-xs text-danger">
          <XCircle size={12} className="mt-0.5 flex-shrink-0" />
          <span className="break-all">{errorMessage}</span>
        </div>
      )}

      {payloadError && (
        <div className="flex items-center gap-2 px-3 py-2 rounded bg-warning/10 border border-warning/30 font-mono text-xs text-warning">
          <AlertCircle size={12} />
          {payloadError}
        </div>
      )}

      {/* Divider */}
      <div className="border-t border-border pt-3">
        {/* Payload toggle */}
        <button
          onClick={() => setShowPayload((v) => !v)}
          className="w-full flex items-center justify-between text-xs font-mono text-text-dim hover:text-text transition-colors"
        >
          <div className="flex items-center gap-2">
            <Code size={11} />
            <span className="uppercase tracking-widest">Request Payload</span>
          </div>
          {showPayload ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </button>

        {showPayload && (
          <div className="mt-2 flex flex-col gap-2">
            <textarea
              value={payloadText}
              onChange={handlePayloadChange}
              spellCheck={false}
              className="w-full h-64 font-mono text-xs p-3 rounded bg-void border border-border text-text-dim focus:outline-none focus:border-accent-dim resize-none leading-relaxed"
              style={{ fontSize: '10.5px' }}
            />
            <button
              onClick={resetPayload}
              className="text-xs font-mono text-muted hover:text-text-dim transition-colors text-right"
            >
              ↺ Reset to defaults
            </button>
          </div>
        )}
      </div>

      {/* Algorithm info */}
      <div className="border-t border-border pt-3 flex flex-col gap-2">
        <div className="text-xs font-mono text-muted uppercase tracking-widest mb-1">
          Algorithm
        </div>
        {[
          ['Solver', 'Time-Space A*'],
          ['Strategy', 'Pareto Dominance'],
          ['Coord System', 'Cartesian 2D'],
          ['Grid', '100 × 100'],
          ['Endpoint', 'POST /api/v1/dispatch'],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between font-mono text-xs">
            <span className="text-muted">{k}</span>
            <span className="text-text-dim">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
