import type { PluginModule } from '@shared/pluginTypes.js';

const pluginModules = import.meta.glob<PluginModule>('./*.tsx', { eager: true, import: 'default' });

export const registeredPlugins: Record<string, PluginModule> = Object.fromEntries(
  Object.values(pluginModules).map((plugin) => [plugin.manifest.id, plugin])
);
