import type { PluginSlot, PluginModule } from '@shared/pluginTypes.js';
import { ErrorBoundary } from './ErrorBoundary.js';

interface PluginSlotRendererProps {
  slot: PluginSlot;
  enabledPlugins: PluginModule[];
}

export function PluginSlotRenderer({ slot, enabledPlugins }: PluginSlotRendererProps) {
  const matchingPlugins = enabledPlugins.filter((plugin) => plugin.manifest.slot === slot);

  if (matchingPlugins.length === 0) {
    return null;
  }

  return (
    <>
      {matchingPlugins.map(({ manifest, PanelComponent }) => (
        <ErrorBoundary
          key={manifest.id}
          fallback={
            <div className="p-2 text-xs text-warden-error">
              Plugin &ldquo;{manifest.name}&rdquo; failed to render.
            </div>
          }
        >
          <PanelComponent />
        </ErrorBoundary>
      ))}
    </>
  );
}
