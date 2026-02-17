import type { PluginManifest, PluginModule } from '@shared/pluginTypes.js';

const manifest = {
  id: 'example-plugin',
  name: 'Example Plugin',
  version: '1.0.0',
  description: 'Demonstrates the plugin registry system',
  slot: 'sidebar-bottom',
  capabilities: ['demo'],
} as const satisfies PluginManifest;

function ExamplePluginPanel() {
  return (
    <div className="p-3 text-xs text-warden-text-dim">
      Example plugin panel rendered in sidebar-bottom slot.
    </div>
  );
}

export default { manifest, PanelComponent: ExamplePluginPanel } satisfies PluginModule;
