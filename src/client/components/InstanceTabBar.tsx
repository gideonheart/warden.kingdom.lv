import { useState } from 'react';
import type { AgentInstance } from '../../shared/types.js';

interface InstanceTabBarProps {
  instances: AgentInstance[];
  selectedSessionName: string | null;
  onSelectSession: (sessionName: string) => void;
  onSessionStopped?: (sessionName: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-warden-success',
  idle: 'bg-warden-idle',
  stopped: 'bg-warden-error',
  error: 'bg-warden-error',
};

export function InstanceTabBar({ instances, selectedSessionName, onSelectSession, onSessionStopped }: InstanceTabBarProps) {
  const [stoppingSession, setStoppingSession] = useState<string | null>(null);

  const handleStop = async (instance: AgentInstance) => {
    setStoppingSession(instance.tmuxSessionName);
    try {
      const response = await fetch(`/api/instances/${instance.id}/stop`, { method: 'POST' });
      if (!response.ok) {
        throw new Error(`Failed to stop session: ${response.statusText}`);
      }
      onSessionStopped?.(instance.tmuxSessionName);
    } catch (error) {
      console.error('Error stopping session:', error);
      alert('Failed to stop session');
    } finally {
      setStoppingSession(null);
    }
  };

  if (instances.length === 0) {
    return (
      <div className="flex items-center px-4 py-2 bg-warden-panel border-b border-warden-border">
        <span className="text-warden-text-dim text-sm">No active sessions</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 bg-warden-panel border-b border-warden-border overflow-x-auto touch-scroll">
      {instances.map((instance) => {
        const isSelected = instance.tmuxSessionName === selectedSessionName;
        const statusColor = STATUS_COLORS[instance.status] ?? 'bg-warden-idle';
        const isStopping = stoppingSession === instance.tmuxSessionName;

        return (
          <div
            key={instance.tmuxSessionName}
            className={`flex items-center gap-2 px-3 py-1.5 min-h-[44px] rounded-md text-sm whitespace-nowrap transition-colors ${
              isSelected
                ? 'bg-warden-accent/20 text-warden-accent border border-warden-accent/30'
                : 'text-warden-text-dim hover:bg-warden-border/50 hover:text-warden-text border border-transparent'
            }`}
          >
            <button
              onClick={() => onSelectSession(instance.tmuxSessionName)}
              className="flex items-center gap-2 flex-1"
            >
              <div className={`w-2 h-2 rounded-full ${statusColor}`} />
              <span className="font-medium">{instance.agentName || instance.agentId}</span>
              <span className="text-xs opacity-60 font-mono">{instance.tmuxSessionName.split('-').slice(1).join('-')}</span>
              {instance.projectPath && (
                <span className="text-xs opacity-40 font-mono hidden lg:inline" title={instance.projectPath}>
                  {instance.projectPath.split('/').pop()}
                </span>
              )}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleStop(instance);
              }}
              disabled={isStopping || instance.status === 'stopped'}
              className="px-1.5 py-0.5 text-xs bg-warden-error/20 text-warden-error rounded hover:bg-warden-error/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Stop session"
            >
              {isStopping ? 'Stopping...' : 'Stop'}
            </button>
          </div>
        );
      })}
    </div>
  );
}
