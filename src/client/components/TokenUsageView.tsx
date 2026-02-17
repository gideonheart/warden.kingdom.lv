import { useState, useEffect, useCallback } from 'react';

interface TokenUsageEntry {
  agentId: string;
  date: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

interface TokenUsageSummary {
  agentId: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  dayCount: number;
}

export function TokenUsageView() {
  const [usage, setUsage] = useState<TokenUsageEntry[]>([]);
  const [summary, setSummary] = useState<TokenUsageSummary[]>([]);
  const [agentFilter, setAgentFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const fetchUsage = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (agentFilter) params.set('agentId', agentFilter);

      const response = await fetch(`/api/history/token-usage?${params}`);
      if (response.ok) {
        const data = await response.json();
        setUsage(data.usage);
        setSummary(data.summary);
      }
    } catch (error) {
      console.error('Failed to fetch token usage:', error);
    } finally {
      setIsLoading(false);
    }
  }, [agentFilter]);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  const formatNumber = (num: number) => num.toLocaleString();
  const formatCost = (cost: number) => `$${cost.toFixed(4)}`;

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="Filter by agent ID"
          value={agentFilter}
          onChange={(e) => setAgentFilter(e.target.value)}
          className="bg-warden-bg border border-warden-border rounded px-2 py-1 min-h-[44px] text-sm text-warden-text w-40"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-8 justify-center">
          <div className="w-4 h-4 border-2 border-warden-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-warden-text-dim text-sm">Loading...</span>
        </div>
      ) : (
        <>
          {summary.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-warden-text mb-3">Per-Agent Summary</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {summary.map((entry) => (
                  <div
                    key={entry.agentId}
                    className="bg-warden-border/20 rounded-lg p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-warden-text">{entry.agentId}</span>
                      <span className="text-xs text-warden-text-dim">{entry.dayCount} days</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-warden-text-dim">Input</span>
                        <p className="text-warden-text font-mono">{formatNumber(entry.totalInputTokens)}</p>
                      </div>
                      <div>
                        <span className="text-warden-text-dim">Output</span>
                        <p className="text-warden-text font-mono">{formatNumber(entry.totalOutputTokens)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-mono text-warden-accent">{formatCost(entry.totalCostUsd)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Mobile: show note instead of daily table */}
          <p className="sm:hidden text-xs text-warden-text-dim text-center py-2">View on desktop for daily breakdown</p>

          {/* Desktop: daily breakdown table */}
          {usage.length > 0 ? (
            <div className="hidden sm:block">
              <h3 className="text-sm font-semibold text-warden-text mb-3">Daily Breakdown</h3>
              <div className="space-y-1">
                <div className="flex items-center gap-3 px-3 py-1.5 text-xs text-warden-text-dim font-medium border-b border-warden-border">
                  <span className="w-24">Date</span>
                  <span className="w-20">Agent</span>
                  <span className="w-28 text-right">Input Tokens</span>
                  <span className="w-28 text-right">Output Tokens</span>
                  <span className="w-20 text-right">Cost</span>
                </div>
                {usage.map((entry, index) => (
                  <div
                    key={`${entry.agentId}-${entry.date}-${index}`}
                    className="flex items-center gap-3 px-3 py-1.5 text-sm hover:bg-warden-border/20 transition-colors"
                  >
                    <span className="w-24 text-warden-text font-mono text-xs">{entry.date}</span>
                    <span className="w-20 text-warden-text-dim">{entry.agentId}</span>
                    <span className="w-28 text-right text-warden-text font-mono">{formatNumber(entry.inputTokens)}</span>
                    <span className="w-28 text-right text-warden-text font-mono">{formatNumber(entry.outputTokens)}</span>
                    <span className="w-20 text-right text-warden-accent font-mono">{formatCost(entry.costUsd)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-warden-text-dim text-sm py-8 text-center">No token usage data recorded</p>
          )}
        </>
      )}
    </div>
  );
}
