import { useState, useEffect, useRef } from 'react';

type BudgetAlertLevel = 'ok' | 'warning' | 'exceeded';

interface BudgetAlertStatusResponse {
  alertLevel: BudgetAlertLevel;
}

const POLL_INTERVAL_MS = 30_000;

export function useBudgetAlerts(): BudgetAlertLevel {
  const [alertLevel, setAlertLevel] = useState<BudgetAlertLevel>('ok');
  const previousAlertLevelRef = useRef<BudgetAlertLevel>('ok');

  useEffect(() => {
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
  }, []);

  return alertLevel;
}
