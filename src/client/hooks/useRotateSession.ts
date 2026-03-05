import { useState, useCallback, useRef, useEffect } from 'react';

export interface RotateResult {
  success: boolean;
  message: string;
}

interface UseRotateSessionReturn {
  isRotating: boolean;
  result: RotateResult | null;
  confirmPending: boolean;
  requestRotate: () => Promise<void>;
}

/**
 * Custom hook encapsulating rotate-session state, confirmation UX, and API call.
 *
 * Implements a "click again to confirm" pattern: the first call to `requestRotate`
 * sets `confirmPending = true` and starts a 3-second auto-reset timer. A second call
 * while `confirmPending` is true executes the actual rotation. This prevents
 * accidental single-click session rotations.
 *
 * Uses a ref for the isRotating guard to avoid unnecessary callback identity changes.
 */
export function useRotateSession(
  agentId: string | null | undefined,
  onComplete?: () => void,
): UseRotateSessionReturn {
  const [isRotating, setIsRotating] = useState(false);
  const [result, setResult] = useState<RotateResult | null>(null);
  const [confirmPending, setConfirmPending] = useState(false);

  // Use ref for isRotating guard so the callback identity doesn't change on every rotation
  const isRotatingRef = useRef(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup confirm timer on unmount
  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) {
        clearTimeout(confirmTimerRef.current);
      }
    };
  }, []);

  // Auto-clear result after 4 seconds
  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(() => setResult(null), 4000);
    return () => clearTimeout(timer);
  }, [result]);

  const requestRotate = useCallback(async () => {
    if (!agentId || isRotatingRef.current) return;

    // First click: set confirm pending and start auto-reset timer
    if (!confirmPending) {
      setConfirmPending(true);
      // Clear any existing timer
      if (confirmTimerRef.current) {
        clearTimeout(confirmTimerRef.current);
      }
      confirmTimerRef.current = setTimeout(() => {
        setConfirmPending(false);
        confirmTimerRef.current = null;
      }, 3000);
      return;
    }

    // Second click (confirmation): execute the rotation
    setConfirmPending(false);
    if (confirmTimerRef.current) {
      clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }

    isRotatingRef.current = true;
    setIsRotating(true);
    setResult(null);

    try {
      const response = await fetch(`/api/gsd/agents/${encodeURIComponent(agentId)}/rotate-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await response.json();
      if (response.ok && data.rotated) {
        setResult({ success: true, message: `Rotated to ${data.newSessionId?.slice(0, 8) ?? 'new'}...` });
        onComplete?.();
      } else {
        setResult({ success: false, message: data.error ?? 'Rotation failed' });
      }
    } catch {
      setResult({ success: false, message: 'Network error' });
    } finally {
      isRotatingRef.current = false;
      setIsRotating(false);
    }
  }, [agentId, confirmPending, onComplete]);

  return { isRotating, result, confirmPending, requestRotate };
}
