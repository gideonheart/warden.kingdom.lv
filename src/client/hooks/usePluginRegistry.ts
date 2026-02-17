import { useState, useEffect, useCallback, useMemo } from 'react';
import { registeredPlugins } from '../plugins/index.js';
import type { PluginModule } from '@shared/pluginTypes.js';

const STORAGE_KEY = 'warden:plugin-enabled';

function loadPersistedState(pluginIds: string[]): Record<string, boolean> {
  let persisted: Record<string, boolean> = {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      persisted = JSON.parse(raw) as Record<string, boolean>;
    }
  } catch {
    // Corrupted or unavailable localStorage — start fresh
  }

  const state: Record<string, boolean> = {};
  for (const id of pluginIds) {
    state[id] = persisted[id] ?? true; // New plugins default to enabled
  }
  return state;
}

export function usePluginRegistry() {
  const [enabledState, setEnabledState] = useState<Record<string, boolean>>(() =>
    loadPersistedState(Object.keys(registeredPlugins))
  );

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(enabledState));
    } catch {
      // localStorage quota exceeded — silently ignore
    }
  }, [enabledState]);

  const togglePlugin = useCallback((pluginId: string) => {
    setEnabledState((prev) => ({
      ...prev,
      [pluginId]: !prev[pluginId],
    }));
  }, []);

  const enabledPlugins: PluginModule[] = useMemo(
    () => Object.values(registeredPlugins).filter((plugin) => enabledState[plugin.manifest.id]),
    [enabledState]
  );

  return { plugins: registeredPlugins, enabledState, enabledPlugins, togglePlugin };
}
