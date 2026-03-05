import { useState, useEffect, useCallback } from 'react';
import type { NotificationConfig } from '@shared/types.js';

interface NotificationConfigWithStatus extends NotificationConfig {
  botConfigured: boolean;
}

export function NotificationSettingsPanel() {
  const [config, setConfig] = useState<NotificationConfigWithStatus | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const fetchConfig = useCallback(async () => {
    try {
      const response = await fetch('/api/notifications/config');
      if (response.ok) {
        const data = (await response.json()) as NotificationConfigWithStatus;
        setConfig(data);
      }
    } catch {
      // Silently ignore fetch errors — panel will stay in loading state
    }
  }, []);

  useEffect(() => {
    void fetchConfig();
  }, [fetchConfig]);

  const saveField = useCallback(async (patch: Partial<NotificationConfig>) => {
    if (!config) return;

    // Optimistically update local state
    setConfig((previous) => (previous ? { ...previous, ...patch } : previous));
    setIsSaving(true);

    try {
      const response = await fetch('/api/notifications/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });

      if (!response.ok) {
        // Revert on failure by re-fetching
        await fetchConfig();
      }
    } catch {
      // Revert on network error
      await fetchConfig();
    } finally {
      setIsSaving(false);
    }
  }, [config, fetchConfig]);

  if (config === null) {
    return (
      <div className="p-4 text-warden-text-dim text-sm">
        Loading...
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      {/* Bot status indicator */}
      <div className="flex items-center gap-2">
        <div
          className={`w-2 h-2 rounded-full flex-shrink-0 ${
            config.botConfigured ? 'bg-green-500' : 'bg-red-500'
          }`}
        />
        <span className="text-sm text-warden-text-dim">
          {config.botConfigured ? 'Bot configured' : 'Bot not configured'}
        </span>
        {isSaving && (
          <span className="text-xs text-warden-text-dim ml-auto">Saving...</span>
        )}
      </div>

      {/* Permission Prompt Notifications */}
      <div className="space-y-3 p-3 bg-warden-panel rounded border border-warden-border">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-warden-text">
            Permission Prompt Notifications
          </span>
          <button
            type="button"
            onClick={() => void saveField({ permissionAlertsEnabled: !config.permissionAlertsEnabled })}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              config.permissionAlertsEnabled
                ? 'bg-warden-accent/20 text-warden-accent'
                : 'bg-warden-border/50 text-warden-text-dim'
            }`}
          >
            {config.permissionAlertsEnabled ? 'On' : 'Off'}
          </button>
        </div>

        <div className="flex items-center gap-3">
          <label htmlFor="permission-cooldown" className="text-sm text-warden-text-dim">
            Cooldown (minutes)
          </label>
          <input
            id="permission-cooldown"
            type="number"
            min="1"
            defaultValue={Math.round(config.permissionCooldownMs / 60000)}
            key={config.permissionCooldownMs}
            onBlur={(event) => {
              const minutes = Math.max(1, parseInt(event.target.value, 10) || 1);
              void saveField({ permissionCooldownMs: minutes * 60000 });
            }}
            className="bg-warden-bg border border-warden-border text-warden-text rounded px-2 py-1 w-20 text-sm"
          />
        </div>
      </div>

      {/* Budget Alert Notifications */}
      <div className="space-y-3 p-3 bg-warden-panel rounded border border-warden-border">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-warden-text">
            Budget Alert Notifications
          </span>
          <button
            type="button"
            onClick={() => void saveField({ budgetAlertsEnabled: !config.budgetAlertsEnabled })}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              config.budgetAlertsEnabled
                ? 'bg-warden-accent/20 text-warden-accent'
                : 'bg-warden-border/50 text-warden-text-dim'
            }`}
          >
            {config.budgetAlertsEnabled ? 'On' : 'Off'}
          </button>
        </div>

        <div className="flex items-center gap-3">
          <label htmlFor="budget-cooldown" className="text-sm text-warden-text-dim">
            Cooldown (minutes)
          </label>
          <input
            id="budget-cooldown"
            type="number"
            min="1"
            defaultValue={Math.round(config.budgetCooldownMs / 60000)}
            key={config.budgetCooldownMs}
            onBlur={(event) => {
              const minutes = Math.max(1, parseInt(event.target.value, 10) || 1);
              void saveField({ budgetCooldownMs: minutes * 60000 });
            }}
            className="bg-warden-bg border border-warden-border text-warden-text rounded px-2 py-1 w-20 text-sm"
          />
        </div>
      </div>
    </div>
  );
}
