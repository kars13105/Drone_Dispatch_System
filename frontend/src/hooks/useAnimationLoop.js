import { useState, useEffect, useRef, useCallback } from 'react';

const DEFAULT_SPEED = 1.0; // real-time multiplier
const FRAME_RATE = 60;

/**
 * Custom hook for managing the animation timeline.
 * Returns current time t, playback controls, and speed settings.
 */
export function useAnimationLoop(maxTime = 100) {
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(DEFAULT_SPEED);
  const [isLooping, setIsLooping] = useState(true);

  const rafRef = useRef(null);
  const lastTimestampRef = useRef(null);
  const currentTimeRef = useRef(0);
  const maxTimeRef = useRef(maxTime);
  const speedRef = useRef(speed);
  const isPlayingRef = useRef(false);
  const isLoopingRef = useRef(isLooping);

  // Keep refs in sync
  useEffect(() => { maxTimeRef.current = maxTime; }, [maxTime]);
  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => { isLoopingRef.current = isLooping; }, [isLooping]);

  const tick = useCallback((timestamp) => {
    if (!isPlayingRef.current) return;

    if (lastTimestampRef.current === null) {
      lastTimestampRef.current = timestamp;
    }

    const deltaMs = timestamp - lastTimestampRef.current;
    lastTimestampRef.current = timestamp;

    const deltaT = (deltaMs / 1000) * speedRef.current;
    let newTime = currentTimeRef.current + deltaT;

    if (newTime >= maxTimeRef.current) {
      if (isLoopingRef.current) {
        newTime = 0;
      } else {
        newTime = maxTimeRef.current;
        isPlayingRef.current = false;
        setIsPlaying(false);
      }
    }

    currentTimeRef.current = newTime;
    setCurrentTime(newTime);

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const play = useCallback(() => {
    if (currentTimeRef.current >= maxTimeRef.current) {
      currentTimeRef.current = 0;
      setCurrentTime(0);
    }
    isPlayingRef.current = true;
    lastTimestampRef.current = null;
    setIsPlaying(true);
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const pause = useCallback(() => {
    isPlayingRef.current = false;
    setIsPlaying(false);
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    lastTimestampRef.current = null;
  }, []);

  const seek = useCallback((t) => {
    const clampedT = Math.max(0, Math.min(t, maxTimeRef.current));
    currentTimeRef.current = clampedT;
    setCurrentTime(clampedT);
  }, []);

  const reset = useCallback(() => {
    pause();
    currentTimeRef.current = 0;
    setCurrentTime(0);
  }, [pause]);

  const togglePlay = useCallback(() => {
    if (isPlayingRef.current) {
      pause();
    } else {
      play();
    }
  }, [play, pause]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  return {
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
  };
}
