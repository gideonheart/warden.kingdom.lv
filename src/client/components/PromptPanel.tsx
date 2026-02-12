import { useState, useCallback, useEffect } from 'react';
import type { AgentDetails } from '../../shared/openclawTypes.js';

interface PromptPanelProps {
  agents: AgentDetails[];
  selectedAgentId: string | null;
}

export function PromptPanel({ agents, selectedAgentId }: PromptPanelProps) {
  const [prompt, setPrompt] = useState('');
  const [targetAgentId, setTargetAgentId] = useState<string>(selectedAgentId ?? '');
  const [isSending, setIsSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Sync dropdown with tab selection - resets manual override on tab switch
  useEffect(() => {
    if (selectedAgentId) {
      setTargetAgentId(selectedAgentId);
    }
  }, [selectedAgentId]);

  const effectiveAgentId = targetAgentId || selectedAgentId || agents[0]?.id || '';

  const handleSend = useCallback(async () => {
    if (!prompt.trim() || !effectiveAgentId) return;

    setIsSending(true);
    setStatusMessage(null);

    try {
      const response = await fetch(`/api/agents/${effectiveAgentId}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });

      const result = await response.json();

      if (response.ok) {
        setStatusMessage({ type: 'success', text: result.message ?? 'Prompt sent' });
        setPrompt('');
      } else {
        setStatusMessage({ type: 'error', text: result.error ?? 'Failed to send prompt' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Network error';
      setStatusMessage({ type: 'error', text: message });
    } finally {
      setIsSending(false);
    }
  }, [prompt, effectiveAgentId]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  return (
    <div className="border-t border-warden-border bg-warden-panel px-3 py-2">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-xs text-warden-text-dim">Send prompt via OpenClaw Gateway to</span>
        <select
          value={effectiveAgentId}
          onChange={(e) => setTargetAgentId(e.target.value)}
          className="text-xs bg-warden-bg border border-warden-border rounded px-1.5 py-0.5 text-warden-text"
        >
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>
        {statusMessage && (
          <span
            className={`text-xs ml-auto ${statusMessage.type === 'success' ? 'text-warden-success' : 'text-warden-error'}`}
          >
            {statusMessage.text}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[10px] text-warden-text-dim/50">Sends to agent via Gateway API — not typed into the terminal</span>
        <div className="flex gap-2">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a prompt for the agent via OpenClaw Gateway... (Ctrl+Enter to send)"
            rows={2}
            className="flex-1 bg-warden-bg border border-warden-border rounded px-2 py-1.5 text-sm text-warden-text placeholder:text-warden-text-dim/40 resize-none focus:outline-none focus:border-warden-accent/50"
          />
          <button
            onClick={handleSend}
            disabled={isSending || !prompt.trim() || !effectiveAgentId}
            className="px-3 py-1.5 text-sm bg-warden-accent text-white rounded hover:bg-warden-accent-dim transition-colors disabled:opacity-40 disabled:cursor-not-allowed self-end"
          >
            {isSending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
