import { useState, useCallback, useEffect, useRef } from 'react';
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
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync dropdown with tab selection - resets manual override on tab switch
  useEffect(() => {
    if (selectedAgentId) {
      setTargetAgentId(selectedAgentId);
    }
  }, [selectedAgentId]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    };
  }, []);

  const effectiveAgentId = targetAgentId || selectedAgentId || agents[0]?.id || '';

  const handleSend = useCallback(async () => {
    if (!prompt.trim() || !effectiveAgentId) return;

    setIsSending(true);
    setStatusMessage(null);
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }

    try {
      const response = await fetch(`/api/agents/${effectiveAgentId}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });

      const result = await response.json();

      if (response.ok) {
        const successText = result.message ?? `Prompt delivered to ${effectiveAgentId}`;
        setStatusMessage({ type: 'success', text: successText });
        setPrompt('');

        // Auto-dismiss success after 5 seconds
        const currentMessage = successText;
        dismissTimerRef.current = setTimeout(() => {
          setStatusMessage((prev) =>
            prev?.type === 'success' && prev.text === currentMessage ? null : prev
          );
        }, 5000);
      } else {
        setStatusMessage({ type: 'error', text: result.error ?? 'Failed to send prompt' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Network error';
      setStatusMessage({ type: 'error', text: `Could not reach Warden server: ${message}` });
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

  const handleDismissStatus = useCallback(() => {
    setStatusMessage(null);
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  }, []);

  return (
    <div className="border-t border-warden-border bg-warden-panel px-3 py-2">
      <div className="flex flex-wrap items-center gap-2 mb-1.5">
        <span className="text-xs text-warden-text-dim">Send prompt to agent:</span>
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
      </div>
      {statusMessage && (
        <div
          className={`flex items-center justify-between rounded px-2 py-1.5 mb-1.5 border ${
            statusMessage.type === 'success'
              ? 'bg-warden-success/15 border-warden-success/40 text-warden-success'
              : 'bg-warden-error/15 border-warden-error/40 text-warden-error'
          }`}
        >
          <span className="text-xs flex-1">{statusMessage.text}</span>
          <button
            onClick={handleDismissStatus}
            className="ml-2 text-xs text-current opacity-60 hover:opacity-100"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}
      <div className="flex flex-col gap-1">
        <span className="text-[10px] text-warden-text-dim/50">Sends prompt to the AI agent via OpenClaw Gateway — the agent interprets and acts</span>
        <div className="flex flex-col sm:flex-row gap-2">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a prompt for the AI agent... (Ctrl+Enter to send)"
            rows={2}
            className="flex-1 bg-warden-bg border border-warden-border rounded px-2 py-1.5 text-sm text-warden-text placeholder:text-warden-text-dim/40 resize-none focus:outline-none focus:border-warden-accent/50"
          />
          <button
            onClick={handleSend}
            disabled={isSending || !prompt.trim() || !effectiveAgentId}
            className="px-3 py-1.5 text-sm bg-warden-accent text-white rounded hover:bg-warden-accent-dim transition-colors disabled:opacity-40 disabled:cursor-not-allowed sm:self-end w-full sm:w-auto"
          >
            {isSending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
