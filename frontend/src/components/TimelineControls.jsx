import React, { useCallback } from 'react';
import { Play, Pause, RotateCcw, FastForward, Repeat, ChevronRight } from 'lucide-react';

const SPEED_OPTIONS = [0.25, 0.5, 1, 2, 5, 10];

function formatTime(t) {
  const s = Math.floor(t);
  const ms = Math.floor((t - s) * 10);
  return `T+${String(s).padStart(4, '0')}.${ms}s`;
}

function formatPercent(t, max) {
  if (max <= 0) return '0.0%';
  return `${((t / max) * 100).toFixed(1)}%`;
}

export default function TimelineControls({
  currentTime,
  maxTime,
  isPlaying,
  speed,
  isLooping,
  onPlay,
  onPause,
  onSeek,
  onReset,
  onTogglePlay,
  onSetSpeed,
  onSetLooping,
  isDisabled,
}) {
  const progress = maxTime > 0 ? (currentTime / maxTime) * 100 : 0;

  const handleScrub = useCallback(
    (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const ratio = Math.max(0, Math.min(1, x / rect.width));
      onSeek?.(ratio * maxTime);
    },
    [onSeek, maxTime]
  );

  const handleScrubMouseDown = useCallback(
    (e) => {
      e.preventDefault();
      handleScrub(e);

      const onMove = (moveEvent) => handleScrub(moveEvent);
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [handleScrub]
  );

  const cycleSpeed = useCallback(() => {
    const idx = SPEED_OPTIONS.indexOf(speed);
    const next = SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length];
    onSetSpeed?.(next);
  }, [speed, onSetSpeed]);

  return (
    <div className="panel-glass border border-border rounded-sm px-4 py-2.5">
      {/* Scrubber */}
      <div
        className="relative w-full h-1.5 bg-surface rounded-full cursor-pointer group mb-3"
        onMouseDown={handleScrubMouseDown}
      >
        {/* Track */}
        <div className="absolute inset-0 rounded-full overflow-hidden">
          <div
            className="h-full bg-accent transition-none"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Thumb */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-accent border-2 border-void shadow-accent group-hover:scale-110 transition-transform"
          style={{ left: `calc(${progress}% - 6px)` }}
        />

        {/* Hover glow */}
        <div
          className="absolute inset-0 rounded-full bg-accent opacity-0 group-hover:opacity-5 transition-opacity"
        />
      </div>

      {/* Controls row */}
      <div className="flex items-center gap-3">
        {/* Reset */}
        <button
          onClick={onReset}
          disabled={isDisabled}
          className="p-1.5 rounded text-text-dim hover:text-text hover:bg-surface transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          title="Reset"
        >
          <RotateCcw size={13} />
        </button>

        {/* Play/Pause */}
        <button
          onClick={onTogglePlay}
          disabled={isDisabled}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono font-semibold transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          style={{
            background: isPlaying
              ? 'rgba(239,68,68,0.15)'
              : 'rgba(0,212,255,0.15)',
            color: isPlaying ? '#ef4444' : '#00d4ff',
            border: `1px solid ${isPlaying ? 'rgba(239,68,68,0.4)' : 'rgba(0,212,255,0.4)'}`,
          }}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause size={12} /> : <Play size={12} />}
          <span>{isPlaying ? 'PAUSE' : 'PLAY'}</span>
        </button>

        {/* Speed */}
        <button
          onClick={cycleSpeed}
          disabled={isDisabled}
          className="flex items-center gap-1 px-2 py-1.5 rounded text-xs font-mono transition-colors disabled:opacity-30 disabled:cursor-not-allowed text-text-dim hover:text-accent border border-border hover:border-accent-dim"
          title="Cycle playback speed"
        >
          <FastForward size={11} />
          <span>{speed}×</span>
        </button>

        {/* Loop */}
        <button
          onClick={() => onSetLooping?.(!isLooping)}
          disabled={isDisabled}
          className={`p-1.5 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
            isLooping ? 'text-accent' : 'text-text-dim hover:text-text'
          }`}
          title="Toggle loop"
        >
          <Repeat size={13} />
        </button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Time display */}
        <div className="flex items-center gap-3 font-mono text-xs">
          <span className="text-text-dim">
            {formatTime(currentTime)}
          </span>
          <span className="text-muted">/</span>
          <span className="text-text-dim">
            {formatTime(maxTime)}
          </span>
          <span
            className="text-accent tabular-nums font-semibold"
            style={{ minWidth: '5ch', textAlign: 'right' }}
          >
            {formatPercent(currentTime, maxTime)}
          </span>
        </div>
      </div>
    </div>
  );
}
