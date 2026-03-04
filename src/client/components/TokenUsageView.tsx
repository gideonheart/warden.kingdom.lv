import { useState, useEffect, useCallback } from 'react';
import type { BurnWindow, BurnRateEntry, BudgetConfig, BudgetAlertStatus } from '@shared/types.js';

interface TokenUsageEntry {
  agentId: string;
  date: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  costUsd: number;
}

interface TokenUsageSummary {
  agentId: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreationInputTokens: number;
  totalCacheReadInputTokens: number;
  totalCostUsd: number;
  dayCount: number;
}

const BURN_WINDOW_LABELS: Record<BurnWindow, string> = {
  today: 'Today',
  '2day': '2-day',
  '7day': '7-day',
};

const BURN_WINDOWS: BurnWindow[] = ['today', '2day', '7day'];

/**
 * Convert a Claude Code project directory name (e.g. "home-forge-warden-kingdom-lv")
 * to a human-readable label. Extracts the last two meaningful path segments.
 * e.g. "home-forge-warden-kingdom-lv" → "warden-kingdom-lv"
 */
function formatAgentId(agentId: string): string {
  // Typical format: home-forge-<project-name>
  // Split on '-' and try to identify the project slug (last 2-4 segments)
  const parts = agentId.split('-');
  if (parts.length > 3) {
    // Drop "home" and "forge" prefix segments if present
    if (parts[0] === 'home' && parts[1] === 'forge') {
      return parts.slice(2).join('-');
    }
  }
  return agentId;
}

function getBudgetProgressColor(budgetPct: number): string {
  if (budgetPct >= 100) return 'bg-red-500';
  if (budgetPct >= 80) return 'bg-amber-500';
  return 'bg-green-500';
}

export function TokenUsageView() {
  const [usage, setUsage] = useState<TokenUsageEntry[]>([]);
  const [summary, setSummary] = useState<TokenUsageSummary[]>([]);
  const [agentFilter, setAgentFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isScanning, setIsScanning] = useState(false);

  // Burn rate state
  const [burnWindow, setBurnWindow] = useState<BurnWindow>('today');
  const [burnRates, setBurnRates] = useState<BurnRateEntry[]>([]);
  const [isBurnRateLoading, setIsBurnRateLoading] = useState(false);

  // Budget config state
  const [budgetConfigs, setBudgetConfigs] = useState<BudgetConfig[]>([]);
  const [budgetStatuses, setBudgetStatuses] = useState<BudgetAlertStatus[]>([]);

  // Inline budget editing state — maps agentId to the draft string value
  const [editingBudget, setEditingBudget] = useState<Record<string, string>>({});

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

  // Fetch burn rates whenever the selected window changes
  useEffect(() => {
    const fetchBurnRates = async () => {
      setIsBurnRateLoading(true);
      try {
        const response = await fetch(`/api/history/burn-rate?window=${burnWindow}`);
        if (response.ok) {
          const data = await response.json();
          setBurnRates(data.entries ?? []);
        }
      } catch (error) {
        console.error('Failed to fetch burn rates:', error);
      } finally {
        setIsBurnRateLoading(false);
      }
    };

    fetchBurnRates();
  }, [burnWindow]);

  // Fetch budget configs and statuses on mount
  const fetchBudgetData = useCallback(async () => {
    try {
      const [configsResponse, statusResponse] = await Promise.all([
        fetch('/api/history/budget-config'),
        fetch('/api/history/budget-config/status'),
      ]);

      if (configsResponse.ok) {
        const data = await configsResponse.json();
        setBudgetConfigs(data.configs ?? []);
      }

      if (statusResponse.ok) {
        const data = await statusResponse.json();
        setBudgetStatuses(data.agents ?? []);
      }
    } catch (error) {
      console.error('Failed to fetch budget data:', error);
    }
  }, []);

  useEffect(() => {
    fetchBudgetData();
  }, [fetchBudgetData]);

  const handleScanNow = useCallback(async () => {
    setIsScanning(true);
    try {
      await fetch('/api/history/token-usage/scan', { method: 'POST' });
      await fetchUsage();
    } catch (error) {
      console.error('Failed to trigger token usage scan:', error);
    } finally {
      setIsScanning(false);
    }
  }, [fetchUsage]);

  // Save budget for an agent on blur or Enter key press
  const saveBudget = useCallback(async (agentId: string) => {
    const draftValue = editingBudget[agentId];
    // If not in edit mode for this agent, nothing to save
    if (draftValue === undefined) return;

    const numericValue = draftValue === '' ? 0 : parseFloat(draftValue);
    if (isNaN(numericValue) || numericValue < 0) return;

    try {
      const response = await fetch(`/api/history/budget-config/${agentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dailyBudgetUsd: numericValue }),
      });

      if (response.ok) {
        // Clear the editing state for this agent and refresh budget data
        setEditingBudget((prev) => {
          const updated = { ...prev };
          delete updated[agentId];
          return updated;
        });
        await fetchBudgetData();
      }
    } catch (error) {
      console.error('Failed to save budget config:', error);
    }
  }, [editingBudget, fetchBudgetData]);

  const handleBudgetInputKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>, agentId: string) => {
    if (event.key === 'Enter') {
      event.currentTarget.blur();
      saveBudget(agentId);
    }
  }, [saveBudget]);

  const handleBudgetInputBlur = useCallback((agentId: string) => {
    saveBudget(agentId);
  }, [saveBudget]);

  const getBudgetForAgent = (agentId: string): number | null => {
    const config = budgetConfigs.find((c) => c.agentId === agentId);
    return config ? config.dailyBudgetUsd : null;
  };

  const getBudgetStatusForAgent = (agentId: string): BudgetAlertStatus | null => {
    return budgetStatuses.find((s) => s.agentId === agentId) ?? null;
  };

  const getBudgetDisplayValue = (agentId: string): string => {
    // Show draft value while editing
    if (agentId in editingBudget) return editingBudget[agentId];
    const budget = getBudgetForAgent(agentId);
    return budget !== null && budget > 0 ? String(budget) : '';
  };

  const formatNumber = (num: number) => num.toLocaleString();
  const formatCost = (cost: number) => `$${cost.toFixed(4)}`;
  const formatCostShort = (cost: number) => `$${cost.toFixed(2)}`;

  // Aggregate burn rate totals
  const totalBurnRatePerHour = burnRates.reduce((sum, entry) => sum + entry.burnRatePerHour, 0);
  const totalWindowCostUsd = burnRates.reduce((sum, entry) => sum + entry.windowCostUsd, 0);
  const totalProjectedDailyUsd = burnRates.reduce((sum, entry) => sum + entry.projectedDailyUsd, 0);
  const totalProjectedWeeklyUsd = burnRates.reduce((sum, entry) => sum + entry.projectedWeeklyUsd, 0);

  return (
    <div className="p-4 space-y-6">
      {/* Filter controls and scan button */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="Filter by agent ID"
          value={agentFilter}
          onChange={(e) => setAgentFilter(e.target.value)}
          className="bg-warden-bg border border-warden-border rounded px-2 py-1 min-h-[44px] text-sm text-warden-text w-40"
        />
        <button
          onClick={handleScanNow}
          disabled={isScanning}
          className="flex items-center gap-2 px-3 py-1.5 rounded text-sm bg-warden-accent/20 text-warden-accent hover:bg-warden-accent/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isScanning ? (
            <>
              <span className="w-3 h-3 border-2 border-warden-accent border-t-transparent rounded-full animate-spin" />
              Scanning...
            </>
          ) : (
            'Scan Now'
          )}
        </button>
      </div>

      {/* Window Selector */}
      <div>
        <div className="flex items-center gap-1 p-0.5 bg-warden-border/30 rounded-lg w-fit">
          {BURN_WINDOWS.map((window) => (
            <button
              key={window}
              onClick={() => setBurnWindow(window)}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors min-h-[36px] ${
                burnWindow === window
                  ? 'bg-warden-accent/20 text-warden-accent font-medium'
                  : 'text-warden-text-dim hover:text-warden-text'
              }`}
            >
              {BURN_WINDOW_LABELS[window]}
            </button>
          ))}
        </div>
      </div>

      {/* Burn Rate Section */}
      <div>
        <h3 className="text-sm font-semibold text-warden-text mb-3">
          Burn Rate
          {isBurnRateLoading && (
            <span className="ml-2 inline-block w-3 h-3 border-2 border-warden-accent border-t-transparent rounded-full animate-spin align-middle" />
          )}
        </h3>

        {burnRates.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Per-agent cards */}
            {burnRates.map((entry) => {
              const budgetStatus = getBudgetStatusForAgent(entry.agentId);
              const budgetDisplayValue = getBudgetDisplayValue(entry.agentId);
              const hasBudget = budgetStatus !== null && budgetStatus.dailyBudgetUsd > 0;

              return (
                <div
                  key={entry.agentId}
                  className="bg-warden-border/20 rounded-lg p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-warden-text" title={entry.agentId}>
                      {formatAgentId(entry.agentId)}
                    </span>
                    <span className="text-xs text-warden-text-dim font-mono">
                      {BURN_WINDOW_LABELS[burnWindow]}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-warden-text-dim">Burn rate</span>
                      <p className="text-warden-accent font-mono text-sm">
                        {formatCost(entry.burnRatePerHour)}/hr
                      </p>
                    </div>
                    <div>
                      <span className="text-warden-text-dim">Window cost</span>
                      <p className="text-warden-text font-mono text-sm">
                        {formatCostShort(entry.windowCostUsd)}
                      </p>
                    </div>
                  </div>

                  {/* Daily budget inline editor */}
                  <div className="flex items-center gap-2 text-xs">
                    <label className="text-warden-text-dim whitespace-nowrap">Daily budget:</label>
                    <div className="flex items-center gap-1 flex-1">
                      <span className="text-warden-text-dim">$</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        placeholder="none"
                        value={budgetDisplayValue}
                        onChange={(e) => setEditingBudget((prev) => ({ ...prev, [entry.agentId]: e.target.value }))}
                        onBlur={() => handleBudgetInputBlur(entry.agentId)}
                        onKeyDown={(e) => handleBudgetInputKeyDown(e, entry.agentId)}
                        className="w-20 bg-warden-bg border border-warden-border rounded px-1.5 py-0.5 text-xs text-warden-text font-mono focus:outline-none focus:border-warden-accent"
                      />
                    </div>
                  </div>

                  {/* Budget progress bar (only shown when budget is configured) */}
                  {hasBudget && budgetStatus && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-warden-text-dim">
                          {formatCostShort(budgetStatus.todayCostUsd)} / {formatCostShort(budgetStatus.dailyBudgetUsd)}
                        </span>
                        <span className={`font-mono ${
                          budgetStatus.budgetPct >= 100 ? 'text-red-400' :
                          budgetStatus.budgetPct >= 80 ? 'text-amber-400' :
                          'text-green-400'
                        }`}>
                          {budgetStatus.budgetPct.toFixed(1)}%
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-warden-border/50 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${getBudgetProgressColor(budgetStatus.budgetPct)}`}
                          style={{ width: `${Math.min(budgetStatus.budgetPct, 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Aggregate "All Agents" card */}
            <div className="bg-warden-border/20 rounded-lg p-3 space-y-2 border border-warden-border/40">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-warden-text">All Agents</span>
                <span className="text-xs text-warden-text-dim font-mono">
                  {BURN_WINDOW_LABELS[burnWindow]}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-warden-text-dim">Total burn rate</span>
                  <p className="text-warden-accent font-mono text-sm">
                    {formatCost(totalBurnRatePerHour)}/hr
                  </p>
                </div>
                <div>
                  <span className="text-warden-text-dim">Window total</span>
                  <p className="text-warden-text font-mono text-sm">
                    {formatCostShort(totalWindowCostUsd)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          !isBurnRateLoading && (
            <p className="text-warden-text-dim text-sm py-4 text-center">
              No burn rate data for this window
            </p>
          )
        )}
      </div>

      {/* Cost Projection Card */}
      {burnRates.length > 0 && (
        <div className="bg-warden-border/20 rounded-lg p-3">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-warden-text">
              Cost Projection ({BURN_WINDOW_LABELS[burnWindow]})
            </h3>
            <span className="text-xs text-warden-text-dim font-mono">
              at {formatCost(totalBurnRatePerHour)}/hr total
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-xs text-warden-text-dim">Est. Daily</span>
              <p className="text-warden-accent font-mono text-lg">{formatCostShort(totalProjectedDailyUsd)}</p>
            </div>
            <div>
              <span className="text-xs text-warden-text-dim">Est. Weekly</span>
              <p className="text-warden-accent font-mono text-lg">{formatCostShort(totalProjectedWeeklyUsd)}</p>
            </div>
          </div>
        </div>
      )}

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
                {summary.map((entry) => {
                  const hasCacheTokens =
                    entry.totalCacheCreationInputTokens > 0 || entry.totalCacheReadInputTokens > 0;
                  return (
                    <div
                      key={entry.agentId}
                      className="bg-warden-border/20 rounded-lg p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-warden-text" title={entry.agentId}>
                          {formatAgentId(entry.agentId)}
                        </span>
                        <span className="text-xs text-warden-text-dim">{entry.dayCount} days</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-warden-text-dim">Input</span>
                          <p className="text-warden-text font-mono">{formatNumber(entry.totalInputTokens)}</p>
                          {hasCacheTokens && (
                            <p className="text-warden-text-dim font-mono text-xs">
                              +{formatNumber(entry.totalCacheCreationInputTokens)} write
                            </p>
                          )}
                          {hasCacheTokens && (
                            <p className="text-warden-text-dim font-mono text-xs">
                              +{formatNumber(entry.totalCacheReadInputTokens)} read
                            </p>
                          )}
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
                  );
                })}
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
                <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-warden-text-dim font-medium border-b border-warden-border">
                  <span className="w-24">Date</span>
                  <span className="w-24">Agent</span>
                  <span className="w-24 text-right">Input</span>
                  <span className="w-24 text-right">Cache Write</span>
                  <span className="w-24 text-right">Cache Read</span>
                  <span className="w-24 text-right">Output</span>
                  <span className="w-20 text-right">Cost</span>
                </div>
                {usage.map((entry, index) => (
                  <div
                    key={`${entry.agentId}-${entry.date}-${index}`}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-warden-border/20 transition-colors"
                  >
                    <span className="w-24 text-warden-text font-mono text-xs">{entry.date}</span>
                    <span className="w-24 text-warden-text-dim text-xs truncate" title={entry.agentId}>
                      {formatAgentId(entry.agentId)}
                    </span>
                    <span className="w-24 text-right text-warden-text font-mono text-xs">{formatNumber(entry.inputTokens)}</span>
                    <span className="w-24 text-right text-warden-text-dim font-mono text-xs">{formatNumber(entry.cacheCreationInputTokens)}</span>
                    <span className="w-24 text-right text-warden-text-dim font-mono text-xs">{formatNumber(entry.cacheReadInputTokens)}</span>
                    <span className="w-24 text-right text-warden-text font-mono text-xs">{formatNumber(entry.outputTokens)}</span>
                    <span className="w-20 text-right text-warden-accent font-mono text-xs">{formatCost(entry.costUsd)}</span>
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
