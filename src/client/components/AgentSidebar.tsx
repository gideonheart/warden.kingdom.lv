import type { AgentDetails, TopicMapping } from '../../shared/openclawTypes.js';

interface AgentSidebarProps {
  agents: AgentDetails[];
  topicMappings: TopicMapping[];
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string) => void;
  onClose?: () => void;
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return 'N/A';
  if (bytes === 0) return '0 bytes';

  const units = ['bytes', 'KB', 'MB', 'GB'];
  const unitIndex = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / Math.pow(1024, unitIndex);

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

export function AgentSidebar({ agents, topicMappings, selectedAgentId, onSelectAgent, onClose }: AgentSidebarProps) {
  const selectedAgent = agents.find((a) => a.id === selectedAgentId);
  const agentTopics = topicMappings.filter((t) => t.agentId === selectedAgentId);

  return (
    <div className="w-full lg:w-72 flex-1 min-h-0 bg-warden-panel border-l border-warden-border flex flex-col overflow-y-auto">
      <div className="flex items-center justify-between px-3 py-2 border-b border-warden-border">
        <h2 className="text-sm font-semibold text-warden-text">Agents</h2>
        {onClose && (
          <button
            onClick={onClose}
            className="lg:hidden px-2 py-1 text-xs text-warden-text-dim hover:text-warden-text transition-colors"
            aria-label="Close sidebar"
          >
            Close
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1 p-2">
        {agents.map((agent) => (
          <button
            key={agent.id}
            onClick={() => onSelectAgent(agent.id)}
            className={`flex items-center gap-2 px-2 py-1.5 min-h-[44px] rounded text-sm text-left transition-colors ${
              agent.id === selectedAgentId
                ? 'bg-warden-accent/20 text-warden-accent'
                : 'text-warden-text-dim hover:bg-warden-border/50 hover:text-warden-text'
            }`}
          >
            <div className="w-2 h-2 rounded-full bg-warden-success flex-shrink-0" />
            <span className="font-medium truncate">{agent.name}</span>
            {agent.isDefault && (
              <span className="text-xs opacity-50 ml-auto">default</span>
            )}
          </button>
        ))}
      </div>

      {selectedAgent && (
        <div className="border-t border-warden-border p-3 space-y-3">
          <h3 className="text-xs font-semibold text-warden-text uppercase tracking-wider">Details</h3>

          <div className="space-y-2 text-xs">
            <div>
              <span className="text-warden-text-dim">Workspace</span>
              <p className="text-warden-text font-mono mt-0.5 break-all">{selectedAgent.workspace || 'N/A'}</p>
            </div>
            <div>
              <span className="text-warden-text-dim">Model</span>
              <p className="text-warden-text font-mono mt-0.5">{selectedAgent.model}</p>
            </div>
            <div>
              <span className="text-warden-text-dim">SOUL.md</span>
              {selectedAgent.soulPreview ? (
                <p className="text-warden-text-dim/80 mt-0.5 text-xs leading-relaxed">{selectedAgent.soulPreview}</p>
              ) : (
                <p className="text-warden-text-dim/50 mt-0.5 italic">No SOUL.md found</p>
              )}
            </div>
            <div>
              <span className="text-warden-text-dim">Memory</span>
              <div className="flex items-center gap-2 mt-0.5">
                <div className={`w-2 h-2 rounded-full ${selectedAgent.memoryExists ? 'bg-warden-success' : 'bg-warden-text-dim/30'}`} />
                <span className="text-warden-text">
                  {selectedAgent.memoryExists ? formatBytes(selectedAgent.memorySizeBytes) : 'No MEMORY.md'}
                </span>
              </div>
            </div>
          </div>

          {agentTopics.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-warden-text-dim mb-1">Telegram Topics</h4>
              <div className="space-y-1">
                {agentTopics.map((topic) => (
                  <div
                    key={`${topic.groupId}-${topic.topicId}`}
                    className="px-2 py-1 bg-warden-border/30 rounded text-xs"
                  >
                    <span className="text-warden-text-dim">Topic #{topic.topicId}</span>
                    {topic.systemPrompt && (
                      <p className="text-warden-text-dim/60 mt-0.5 line-clamp-2">{topic.systemPrompt}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {topicMappings.length > 0 && (
        <div className="border-t border-warden-border p-3 mt-auto">
          <h3 className="text-xs font-semibold text-warden-text uppercase tracking-wider mb-2">Topic Map</h3>
          <div className="grid grid-cols-2 gap-1">
            {topicMappings.map((mapping) => (
              <div
                key={`${mapping.groupId}-${mapping.topicId}`}
                className={`px-2 py-1.5 rounded text-xs text-center transition-colors cursor-pointer ${
                  mapping.agentId === selectedAgentId
                    ? 'bg-warden-accent/20 text-warden-accent border border-warden-accent/30'
                    : 'bg-warden-border/30 text-warden-text-dim hover:bg-warden-border/50'
                }`}
                onClick={() => onSelectAgent(mapping.agentId)}
              >
                <div className="font-medium truncate">{mapping.agentName}</div>
                <div className="opacity-50">#{mapping.topicId}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
