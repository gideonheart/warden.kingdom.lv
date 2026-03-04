import { useState, useEffect, useRef, useCallback } from 'react';

interface UseRecordingStateOptions {
  sessionName: string;
  agentId: string;
  agentName: string;
  projectPath: string;
  onRecordingStopped?: (reason: 'manual' | 'session_ended') => void;
}

interface UseRecordingStateResult {
  isRecording: boolean;
  elapsedMs: number;
  recordingId: number | null;
  startRecording: (cols: number, rows: number) => Promise<void>;
  stopRecording: () => Promise<void>;
  formattedElapsed: string;   // e.g., "02:34"
}

function formatElapsedMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function useRecordingState({
  sessionName,
  agentId,
  agentName,
  projectPath,
  onRecordingStopped,
}: UseRecordingStateOptions): UseRecordingStateResult {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [recordingId, setRecordingId] = useState<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onRecordingStoppedRef = useRef(onRecordingStopped);
  onRecordingStoppedRef.current = onRecordingStopped;

  // Cleanup ticker on unmount
  useEffect(() => {
    return () => {
      if (tickerRef.current) clearInterval(tickerRef.current);
    };
  }, []);

  const startRecording = useCallback(async (cols: number, rows: number) => {
    const response = await fetch(`/api/recordings/session/${encodeURIComponent(sessionName)}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, agentName, projectPath, cols, rows }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error ?? 'Failed to start recording');
    }
    const data = await response.json() as { recordingId: number };
    setRecordingId(data.recordingId);
    setIsRecording(true);
    setElapsedMs(0);
    startedAtRef.current = Date.now();

    // Tick elapsed every second
    tickerRef.current = setInterval(() => {
      if (startedAtRef.current !== null) {
        setElapsedMs(Date.now() - startedAtRef.current);
      }
    }, 1000);
  }, [sessionName, agentId, agentName, projectPath]);

  const stopRecording = useCallback(async () => {
    if (tickerRef.current) {
      clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
    startedAtRef.current = null;

    const response = await fetch(`/api/recordings/session/${encodeURIComponent(sessionName)}/stop`, {
      method: 'POST',
    });
    setIsRecording(false);
    setElapsedMs(0);
    setRecordingId(null);

    if (response.ok) {
      onRecordingStoppedRef.current?.('manual');
    }
  }, [sessionName]);

  return {
    isRecording,
    elapsedMs,
    recordingId,
    startRecording,
    stopRecording,
    formattedElapsed: formatElapsedMs(elapsedMs),
  };
}
