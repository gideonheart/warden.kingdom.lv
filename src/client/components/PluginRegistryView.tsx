import type { PluginModule } from '@shared/pluginTypes.js';

interface PluginRegistryViewProps {
  plugins: Record<string, PluginModule>;
  enabledState: Record<string, boolean>;
  onToggle: (pluginId: string) => void;
}

export function PluginRegistryView({ plugins, enabledState, onToggle }: PluginRegistryViewProps) {
  const entries = Object.values(plugins);

  return (
    <div className="flex-1 overflow-auto p-4">
      <h2 className="text-lg font-semibold text-warden-text mb-4">Plugin Registry</h2>

      {entries.length === 0 ? (
        <p className="text-center text-warden-text-dim py-8">No plugins registered</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-warden-text-dim border-b border-warden-border">
              <th className="pb-2 pr-4 font-medium">Name</th>
              <th className="pb-2 pr-4 font-medium">Version</th>
              <th className="pb-2 pr-4 font-medium">Description</th>
              <th className="pb-2 pr-4 font-medium">Slot</th>
              <th className="pb-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(({ manifest }) => {
              const isEnabled = enabledState[manifest.id] ?? false;
              return (
                <tr key={manifest.id} className="border-b border-warden-border/50">
                  <td className="py-2 pr-4 text-warden-text">{manifest.name}</td>
                  <td className="py-2 pr-4 text-warden-text-dim">{manifest.version}</td>
                  <td className="py-2 pr-4 text-warden-text-dim">{manifest.description}</td>
                  <td className="py-2 pr-4 text-warden-text-dim font-mono text-xs">{manifest.slot}</td>
                  <td className="py-2">
                    <button
                      onClick={() => onToggle(manifest.id)}
                      className={`px-2 py-0.5 text-xs rounded transition-colors ${
                        isEnabled
                          ? 'bg-warden-success/20 text-warden-success'
                          : 'bg-warden-border/50 text-warden-text-dim'
                      }`}
                    >
                      {isEnabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
