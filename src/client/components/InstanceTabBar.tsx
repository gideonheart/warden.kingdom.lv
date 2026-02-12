import type { AgentInstance } from '../../shared/types.js';

interface InstanceTabBarProps {
  instances: AgentInstance[];
  selectedSessionName: string | null;
  onSelectSession: (sessionName: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-warden-success',
  idle: 'bg-warden-idle',
  stopped: 'bg-warden-error',
  error: 'bg-warden-error',
};

export function InstanceTabBar({ instances, selectedSessionName, onSelectSession }: InstanceTabBarProps) {
  if (instances.length === 0) {
    return (
      <div className="flex items-center px-4 py-2 bg-warden-panel border-b border-warden-border">
        <span className="text-warden-text-dim text-sm">No active sessions</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 bg-warden-panel border-b border-warden-border overflow-x-auto">
      {instances.map((instance) => {
        const isSelected = instance.tmuxSessionName === selectedSessionName;
        const statusColor = STATUS_COLORS[instance.status] ?? 'bg-warden-idle';

        return (
          <button
            key={instance.tmuxSessionName}
            onClick={() => onSelectSession(instance.tmuxSessionName)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition-colors ${
              isSelected
                ? 'bg-warden-accent/20 text-warden-accent border border-warden-accent/30'
                : 'text-warden-text-dim hover:bg-warden-border/50 hover:text-warden-text border border-transparent'
            }`}
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
        );
      })}
    </div>
  );
}
