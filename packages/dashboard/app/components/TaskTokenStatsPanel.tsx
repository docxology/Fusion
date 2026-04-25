import type { TaskTokenUsage } from "@fusion/core";
import "./TaskTokenStatsPanel.css";

interface TaskTokenStatsPanelProps {
  tokenUsage?: TaskTokenUsage;
  loading: boolean;
}

function formatTokenCount(value: number): string {
  return value.toLocaleString();
}

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

export function TaskTokenStatsPanel({ tokenUsage, loading }: TaskTokenStatsPanelProps) {
  if (!tokenUsage && loading) {
    return (
      <section className="task-token-stats-panel" aria-label="Task token usage">
        <h4>Token Usage</h4>
        <div className="task-token-stats-panel__loading" role="status" aria-live="polite">
          Loading token statistics…
        </div>
      </section>
    );
  }

  if (!tokenUsage) {
    return (
      <section className="task-token-stats-panel" aria-label="Task token usage">
        <h4>Token Usage</h4>
        <div className="task-token-stats-panel__empty" role="status">
          No token usage recorded for this task yet.
        </div>
      </section>
    );
  }

  return (
    <section className="task-token-stats-panel" aria-label="Task token usage">
      <h4>Token Usage</h4>
      <div className="task-token-stats-panel__grid" role="list" aria-label="Task token totals">
        <div className="task-token-stats-panel__metric" role="listitem">
          <span className="task-token-stats-panel__label">Input</span>
          <span className="task-token-stats-panel__value">{formatTokenCount(tokenUsage.inputTokens)}</span>
        </div>
        <div className="task-token-stats-panel__metric" role="listitem">
          <span className="task-token-stats-panel__label">Output</span>
          <span className="task-token-stats-panel__value">{formatTokenCount(tokenUsage.outputTokens)}</span>
        </div>
        <div className="task-token-stats-panel__metric" role="listitem">
          <span className="task-token-stats-panel__label">Cached</span>
          <span className="task-token-stats-panel__value">{formatTokenCount(tokenUsage.cachedTokens)}</span>
        </div>
        <div className="task-token-stats-panel__metric" role="listitem">
          <span className="task-token-stats-panel__label">Total</span>
          <span className="task-token-stats-panel__value">{formatTokenCount(tokenUsage.totalTokens)}</span>
        </div>
      </div>
      <dl className="task-token-stats-panel__timestamps">
        <div className="task-token-stats-panel__timestamp-row">
          <dt>First used</dt>
          <dd>
            <time dateTime={tokenUsage.firstUsedAt}>{formatTimestamp(tokenUsage.firstUsedAt)}</time>
          </dd>
        </div>
        <div className="task-token-stats-panel__timestamp-row">
          <dt>Last used</dt>
          <dd>
            <time dateTime={tokenUsage.lastUsedAt}>{formatTimestamp(tokenUsage.lastUsedAt)}</time>
          </dd>
        </div>
      </dl>
    </section>
  );
}
