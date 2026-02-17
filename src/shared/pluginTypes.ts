import type { ComponentType } from 'react';

export type PluginSlot = 'sidebar-top' | 'sidebar-bottom' | 'bottom-panel' | 'terminal-overlay';

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  slot: PluginSlot;
  capabilities: readonly string[];
}

export interface PluginModule {
  manifest: PluginManifest;
  PanelComponent: ComponentType;
}
