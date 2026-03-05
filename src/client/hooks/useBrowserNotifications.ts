import { useState, useEffect, useCallback, useRef } from 'react';

const NOTIFICATION_STORAGE_KEY = 'warden:notifications-enabled';

type BudgetAlertLevel = 'ok' | 'warning' | 'exceeded';

interface UseBrowserNotificationsParams {
  budgetAlertLevel: BudgetAlertLevel;
}

interface UseBrowserNotificationsResult {
  notificationsEnabled: boolean;
  toggleNotifications: () => void;
  notificationPermission: NotificationPermission | 'unsupported';
}

/** Browser notification opt-in for budget alerts.
 *
 *  Budget alerts: fires a notification when budgetAlertLevel transitions into
 *  'warning' or 'exceeded'. Uses a ref to detect transitions so notifications
 *  are not repeated on every poll cycle.
 *
 *  Permission prompt notifications are handled server-side by NotificationPoller
 *  which sends Telegram messages directly.
 *
 *  localStorage persistence: toggle state survives page reloads.
 *
 *  Notification tag deduplication: the browser suppresses duplicate notifications
 *  with the same tag, providing a second layer of dedup beyond the ref-based check. */
export function useBrowserNotifications({
  budgetAlertLevel,
}: UseBrowserNotificationsParams): UseBrowserNotificationsResult {
  // Feature detection — guard SSR and older browsers
  const isSupported = typeof Notification !== 'undefined';

  // Initialize from localStorage to persist the opt-in across page reloads
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    if (!isSupported) return false;
    try {
      return localStorage.getItem(NOTIFICATION_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  // Track permission state so the UI can show different states (default/granted/denied)
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() => {
    if (!isSupported) return 'unsupported';
    return Notification.permission;
  });

  // Track previous budget alert level to detect transitions (ok→warning, ok→exceeded, etc.)
  const previousBudgetLevelRef = useRef<BudgetAlertLevel>('ok');

  // Budget alert effect — fires a notification when the budget level transitions
  // into 'warning' or 'exceeded'. Does not fire when returning to 'ok'.
  useEffect(() => {
    if (!notificationsEnabled || !isSupported || Notification.permission !== 'granted') {
      previousBudgetLevelRef.current = budgetAlertLevel;
      return;
    }

    const previous = previousBudgetLevelRef.current;
    previousBudgetLevelRef.current = budgetAlertLevel;

    // Only fire on transitions that represent a worsening state
    if (budgetAlertLevel === 'ok' || budgetAlertLevel === previous) return;

    const isExceeded = budgetAlertLevel === 'exceeded';
    new Notification(
      isExceeded ? 'Warden — Budget Exceeded' : 'Warden — Budget Warning',
      {
        body: isExceeded
          ? 'Token budget has been exceeded. Review usage in History.'
          : 'Token budget warning threshold reached. Review usage in History.',
        // Tag ensures browser deduplicates if the level stays the same across polls
        tag: `warden-budget-${budgetAlertLevel}`,
      },
    );
  }, [budgetAlertLevel, notificationsEnabled, isSupported]);

  // Toggle callback — must be triggered by a user gesture (button click).
  // Browser silently blocks Notification.requestPermission() outside user gesture context.
  const toggleNotifications = useCallback(() => {
    if (!isSupported) return;

    if (!notificationsEnabled) {
      // Turning ON — check/request permission first
      if (Notification.permission === 'default') {
        // requestPermission() must run in user gesture context (this is a button click handler)
        void Notification.requestPermission().then((result) => {
          setPermission(result);
          if (result === 'granted') {
            setNotificationsEnabled(true);
            try {
              localStorage.setItem(NOTIFICATION_STORAGE_KEY, 'true');
            } catch {
              // localStorage unavailable
            }
          }
          // If 'denied', do nothing — browser won't ask again until settings are changed
        });
      } else if (Notification.permission === 'granted') {
        setNotificationsEnabled(true);
        try {
          localStorage.setItem(NOTIFICATION_STORAGE_KEY, 'true');
        } catch {
          // localStorage unavailable
        }
      }
      // If 'denied', toggle does nothing — UI shows disabled state with tooltip
    } else {
      // Turning OFF
      setNotificationsEnabled(false);
      try {
        localStorage.setItem(NOTIFICATION_STORAGE_KEY, 'false');
      } catch {
        // localStorage unavailable
      }
    }
  }, [notificationsEnabled, isSupported]);

  return { notificationsEnabled, toggleNotifications, notificationPermission: permission };
}
