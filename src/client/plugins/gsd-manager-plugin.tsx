// GSD content moved to dedicated GSD nav page (GsdView.tsx).
// This plugin slot is intentionally disabled — the bottom-panel renders nothing.
import type { PluginManifest, PluginModule } from '@shared/pluginTypes.js';

const manifest = {
  id: 'gsd-manager',
  name: 'GSD Manager',
  version: '1.0.0',
  description: 'Control center for GSD agent sessions',
  slot: 'bottom-panel',
  capabilities: ['gsd-management', 'agent-control', 'session-monitoring'],
} as const satisfies PluginManifest;

function DisabledPanel() {
  return null;
}

export default { manifest, PanelComponent: DisabledPanel } satisfies PluginModule;
