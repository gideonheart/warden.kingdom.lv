import { useState, useEffect } from 'react';
import type { ModelComparisonRow } from '@shared/types.js';

interface ModelComparisonViewProps {
  agentFilter?: string;
}

type TimeRange = '24h' | '7d' | '30d' | 'all';

const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  '24h': 'Today',
  '7d': '7d',
  '30d': '30d',
  all: 'All',
};

const TIME_RANGES: TimeRange[] = ['24h', '7d', '30d', 'all'];

/**
 * Returns a Tailwind background color class based on the model name substring.
 * purple = Opus, blue = Sonnet, green = Haiku, fallback = warden accent.
 */
function getModelColorClass(modelName: string): string {
  const lower = modelName.toLowerCase();
  if (lower.includes('opus')) return 'bg-purple-500';
  if (lower.includes('sonnet')) return 'bg-blue-500';
  if (lower.includes('haiku')) return 'bg-emerald-500';
  return 'bg-warden-accent/70';
}

/**
 * Calculate the dateFrom query param value for a given time range.
 * Returns undefined for 'all' (no filter).
 */
function calculateDateFrom(timeRange: TimeRange): string | undefined {
  if (timeRange === 'all') return undefined;

  const now = new Date();
  if (timeRange === '24h') {
    // Use today's date
    return now.toISOString().slice(0, 10);
  }

  const daysBack = timeRange === '7d' ? 7 : 30;
  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - daysBack);
  return fromDate.toISOString().slice(0, 10);
}

/**
 * Convert a Claude Code project directory name (e.g. "home-forge-warden-kingdom-lv")
 * to a human-readable label. Extracts meaningful path segments after "home-forge-".
 */
function formatAgentId(agentId: string): string {
  const parts = agentId.split('-');
  if (parts.length > 3) {
    if (parts[0] === 'home' && parts[1] === 'forge') {
      return parts.slice(2).join('-');
    }
  }
  return agentId;
}

/**
 * ModelComparisonView renders a per-agent grouped horizontal bar chart
 * showing cost breakdown by model variant (Opus/Sonnet/Haiku).
 * Includes a time range selector and an auto-generated insight headline.
 */
export function ModelComparisonView({ agentFilter }: ModelComparisonViewProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const [data, setData] = useState<ModelComparisonRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams();
        if (agentFilter) params.set('agentId', agentFilter);

        const dateFrom = calculateDateFrom(timeRange);
        if (dateFrom) params.set('dateFrom', dateFrom);

        const response = await fetch(`/api/history/model-comparison?${params}`);
        if (response.ok) {
          const json = await response.json();
          setData(json.modelComparison ?? []);
        }
      } catch (error) {
        console.error('[ModelComparisonView] Failed to fetch model comparison data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [timeRange, agentFilter]);

  // --- Derived values ---

  // Global max cost across all model rows — used for proportional bar width scaling
  const globalMaxCost = data.reduce((max, row) => Math.max(max, row.totalCostUsd), 0);

  // Insight headline: find the model with the highest total spend across all agents
  const modelTotals = new Map<string, number>();
  let grandTotal = 0;
  for (const row of data) {
    modelTotals.set(row.model, (modelTotals.get(row.model) ?? 0) + row.totalCostUsd);
    grandTotal += row.totalCostUsd;
  }

  let insightHeadline = 'No usage data yet';
  if (grandTotal > 0) {
    let topModel = '';
    let topCost = 0;
    for (const [model, cost] of modelTotals) {
      if (cost > topCost) {
        topCost = cost;
        topModel = model;
      }
    }
    const pct = Math.round((topCost / grandTotal) * 100);
    insightHeadline = `${topModel} is ${pct}% of total spend`;
  }

  // Group rows by agentId for rendering
  const agentGroups = new Map<string, ModelComparisonRow[]>();
  for (const row of data) {
    if (!agentGroups.has(row.agentId)) {
      agentGroups.set(row.agentId, []);
    }
    agentGroups.get(row.agentId)!.push(row);
  }

  const formatCost = (cost: number) => `$${cost.toFixed(4)}`;

  return (
    <div className="space-y-4">
      {/* Time range selector */}
      <div className="flex items-center gap-1 p-0.5 bg-warden-border/30 rounded-lg w-fit">
        {TIME_RANGES.map((range) => (
          <button
            key={range}
            onClick={() => setTimeRange(range)}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors min-h-[36px] ${
              timeRange === range
                ? 'bg-warden-accent/20 text-warden-accent font-medium'
                : 'text-warden-text-dim hover:text-warden-text'
            }`}
          >
            {TIME_RANGE_LABELS[range]}
          </button>
        ))}
      </div>

      {/* Insight headline */}
      {!isLoading && (
        <p className="text-sm font-semibold text-warden-text">
          {insightHeadline}
        </p>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center gap-2 py-8 justify-center">
          <div className="w-4 h-4 border-2 border-warden-accent border-t-transparent rounded-full animate-spin" />
          <span className="text-warden-text-dim text-sm">Loading...</span>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && data.length === 0 && (
        <p className="text-warden-text-dim text-sm py-8 text-center">
          No model comparison data yet — data appears after a token usage scan runs.
        </p>
      )}

      {/* Bar chart — grouped by agent */}
      {!isLoading && agentGroups.size > 0 && (
        <div className="space-y-6">
          {Array.from(agentGroups.entries()).map(([agentId, rows]) => {
            const agentTotal = rows.reduce((sum, r) => sum + r.totalCostUsd, 0);

            return (
              <div key={agentId} className="space-y-2">
                {/* Agent section header */}
                <div className="flex items-center justify-between">
                  <span
                    className="text-sm font-medium text-warden-text"
                    title={agentId}
                  >
                    {formatAgentId(agentId)}
                  </span>
                  <span className="text-xs text-warden-text-dim font-mono">
                    {formatCost(agentTotal)}
                  </span>
                </div>

                {/* Per-model bars */}
                <div className="space-y-1.5">
                  {rows.map((row) => {
                    const barWidthPct =
                      globalMaxCost > 0
                        ? (row.totalCostUsd / globalMaxCost) * 100
                        : 0;
                    const colorClass = getModelColorClass(row.model);

                    return (
                      <div key={row.model} className="flex items-center gap-2">
                        {/* Model name — fixed width, truncated */}
                        <span
                          className="text-xs text-warden-text-dim truncate shrink-0"
                          style={{ width: 140 }}
                          title={row.model}
                        >
                          {row.model}
                        </span>

                        {/* Bar */}
                        <div className="flex-1 h-5 bg-warden-border/20 rounded overflow-hidden">
                          <div
                            className={`h-full rounded ${colorClass} transition-all`}
                            style={{ width: `${barWidthPct}%` }}
                          />
                        </div>

                        {/* Cost label */}
                        <span className="text-xs text-warden-text font-mono shrink-0 text-right" style={{ width: 72 }}>
                          {formatCost(row.totalCostUsd)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
