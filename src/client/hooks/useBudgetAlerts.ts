import { useState, useEffect, useRef } from 'react';

type BudgetAlertLevel = 'ok' | 'warning' | 'exceeded';

interface BudgetAlertStatusResponse {
  alertLevel: BudgetAlertLevel;
}

const POLL_INTERVAL_MS = 30_000;

/**
 * Polls /api/history/budget-config/status for budget alert level.
 *
 * @param enabled - When false, polling is paused and 'ok' is returned.
 *   Pass `false` when the terminals view is active to eliminate background
 *   network requests that could trigger React re-renders.
 */
export function useBudgetAlerts(enabled = true): BudgetAlertLevel {
  const [alertLevel, setAlertLevel] = useState<BudgetAlertLevel>('ok');
  const previousAlertLevelRef = useRef<BudgetAlertLevel>('ok');

  useEffect(() => {
    if (!enabled) return;

    const fetchStatus = async () => {
      try {
        const response = await fetch('/api/history/budget-config/status');
        if (!response.ok) return;
        const data = (await response.json()) as BudgetAlertStatusResponse;
        const nextLevel = data.alertLevel;
        // Only update state if the value has changed to prevent unnecessary re-renders
        if (nextLevel === previousAlertLevelRef.current) return;
        previousAlertLevelRef.current = nextLevel;
        setAlertLevel(nextLevel);
      } catch {
        // On fetch error, leave previous data in place
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [enabled]);

  return alertLevel;
}
