import { useState, useMemo, useCallback } from "react";
import { FileEditor } from "./FileEditor";
import { useMemoryData } from "../hooks/useMemoryData";
import { Loader2 } from "lucide-react";

interface MemoryViewProps {
  projectId?: string;
  addToast: (message: string, type: "success" | "error" | "info") => void;
}

type Tab = "working" | "insights" | "engines";

/** Known category headers in the insights file */
const CATEGORY_HEADERS: Record<string, string> = {
  "Patterns": "pattern",
  "Principles": "principle",
  "Conventions": "convention",
  "Pitfalls": "pitfall",
  "Context": "context",
};

interface ParsedInsightCategory {
  name: string;
  key: string;
  items: string[];
  expanded: boolean;
}

/** Parse insights markdown content into categorized sections */
function parseInsightsContent(content: string | null): ParsedInsightCategory[] {
  if (!content) return [];

  const categories: ParsedInsightCategory[] = [];
  const sections = content.split(/(?=^## )/m);

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) continue;

    // Check if this is a category header
    const match = trimmed.match(/^##\s+(.+?)(\n|$)/);
    if (match) {
      const header = match[1].trim();
      const key = CATEGORY_HEADERS[header] ?? header.toLowerCase();
      const body = trimmed.slice(match[0].length).trim();

      // Extract bullet points
      const items = body
        .split("\n")
        .map((line) => line.replace(/^-\s+/, "").trim())
        .filter((line) => line.length > 0 && (line.startsWith("- ") || line.startsWith("* ")));

      if (items.length > 0 || body.length > 0) {
        categories.push({
          name: header,
          key,
          items: items.length > 0 ? items : (body.length > 0 ? [body] : []),
          expanded: true,
        });
      }
    }
  }

  return categories;
}

/** Parse the "Last Updated" timestamp from insights content */
function parseLastUpdated(content: string | null): string | null {
  if (!content) return null;
  const match = content.match(/##\s+Last\s+Updated:\s*(\d{4}-\d{2}-\d{2})/i);
  return match ? match[1] : null;
}

/** Count total insights from parsed categories */
function countTotalInsights(categories: ParsedInsightCategory[]): number {
  return categories.reduce((sum, cat) => sum + cat.items.length, 0);
}

/** Get backend display name */
function getBackendDisplayName(backend: string): string {
  switch (backend) {
    case "file":
      return "File (.fusion/memory.md)";
    case "readonly":
      return "Read-Only";
    case "qmd":
      return "QMD (Quantized Memory Distillation)";
    default:
      return backend;
  }
}

/** Get health badge text */
function getHealthBadgeText(health: "healthy" | "warning" | "issues"): string {
  switch (health) {
    case "healthy":
      return "Healthy";
    case "warning":
      return "Warning";
    case "issues":
      return "Issues Found";
  }
}

export function MemoryView({ projectId, addToast }: MemoryViewProps) {
  const [activeTab, setActiveTab] = useState<Tab>("working");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [editingInsights, setEditingInsights] = useState(false);
  const [insightsEditorContent, setInsightsEditorContent] = useState<string | null>(null);

  const {
    workingMemory,
    workingMemoryLoading,
    workingMemoryDirty,
    setWorkingMemory,
    saveWorkingMemory,
    savingWorkingMemory,
    insightsContent,
    insightsLoading,
    insightsExists,
    refreshInsights,
    saveInsights,
    backendStatus,
    backendLoading,
    extractInsights,
    extracting,
    auditReport,
    auditLoading,
    refreshAudit,
    compactMemory,
    compacting,
  } = useMemoryData({ projectId });

  // Parse insights content
  const parsedCategories = useMemo(
    () => parseInsightsContent(insightsContent),
    [insightsContent]
  );

  const totalInsights = useMemo(
    () => countTotalInsights(parsedCategories),
    [parsedCategories]
  );

  const lastUpdated = useMemo(
    () => parseLastUpdated(insightsContent),
    [insightsContent]
  );

  // Toggle category expansion
  const toggleCategory = useCallback((key: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  // Handle save working memory
  const handleSaveWorkingMemory = useCallback(async () => {
    try {
      await saveWorkingMemory();
      addToast("Working memory saved", "success");
    } catch {
      addToast("Failed to save working memory", "error");
    }
  }, [saveWorkingMemory, addToast]);

  // Handle compact memory
  const handleCompactMemory = useCallback(async () => {
    try {
      await compactMemory();
      addToast("Memory compacted successfully", "success");
    } catch {
      addToast("Failed to compact memory", "error");
    }
  }, [compactMemory, addToast]);

  // Handle extract insights
  const handleExtractInsights = useCallback(async () => {
    try {
      const result = await extractInsights();
      addToast(result.summary, "success");
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Failed to extract insights", "error");
    }
  }, [extractInsights, addToast]);

  // Handle save insights (from raw editor)
  const handleSaveInsights = useCallback(async () => {
    if (insightsEditorContent === null) return;
    try {
      await saveInsights(insightsEditorContent);
      setEditingInsights(false);
      setInsightsEditorContent(null);
      addToast("Insights saved", "success");
    } catch {
      addToast("Failed to save insights", "error");
    }
  }, [insightsEditorContent, saveInsights, addToast]);

  // Start editing insights
  const handleStartEditingInsights = useCallback(() => {
    setInsightsEditorContent(insightsContent ?? "");
    setEditingInsights(true);
  }, [insightsContent]);

  // Cancel editing insights
  const handleCancelEditingInsights = useCallback(() => {
    setEditingInsights(false);
    setInsightsEditorContent(null);
  }, []);

  const isWritable = backendStatus?.capabilities?.writable ?? false;

  return (
    <div className="memory-view">
      {/* Header */}
      <div className="memory-view-header">
        <div>
          <h2>Memory</h2>
          <p className="memory-view-description">
            Working memory, long-term insights, and engine status
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="memory-view-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "working"}
          className={`memory-view-tab${activeTab === "working" ? " memory-view-tab--active" : ""}`}
          onClick={() => setActiveTab("working")}
          data-testid="memory-tab-working"
        >
          Working Memory
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "insights"}
          className={`memory-view-tab${activeTab === "insights" ? " memory-view-tab--active" : ""}`}
          onClick={() => setActiveTab("insights")}
          data-testid="memory-tab-insights"
        >
          Insights
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "engines"}
          className={`memory-view-tab${activeTab === "engines" ? " memory-view-tab--active" : ""}`}
          onClick={() => setActiveTab("engines")}
          data-testid="memory-tab-engines"
        >
          Engines
        </button>
      </div>

      {/* Content area */}
      <div className="memory-view-content">
        {/* Working Memory Tab */}
        {activeTab === "working" && (
          <div className="memory-working-tab">
            {!isWritable && (
              <div className="memory-readonly-banner">
                This memory backend is read-only. Changes cannot be saved.
              </div>
            )}

            {workingMemoryLoading ? (
              <div className="memory-empty-state">
                <Loader2 size={20} className="animate-spin" />
                <span>Loading working memory…</span>
              </div>
            ) : (
              <>
                <div className="memory-editor-container">
                  <FileEditor
                    content={workingMemory}
                    onChange={setWorkingMemory}
                    readOnly={!isWritable}
                    filePath=".fusion/memory/MEMORY.md"
                  />
                </div>

                <div className="memory-action-bar">
                  <span className="memory-char-count">{workingMemory.length} characters</span>
                  <div style={{ flex: 1 }} />
                  {isWritable && workingMemory.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={handleCompactMemory}
                      disabled={compacting}
                    >
                      {compacting ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          Compacting…
                        </>
                      ) : (
                        "Compact Memory"
                      )}
                    </button>
                  )}
                  {workingMemoryDirty && isWritable && (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={handleSaveWorkingMemory}
                      disabled={savingWorkingMemory}
                    >
                      {savingWorkingMemory ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          Saving…
                        </>
                      ) : (
                        "Save"
                      )}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Insights Tab */}
        {activeTab === "insights" && (
          <div className="memory-insights-tab">
            {insightsLoading ? (
              <div className="memory-empty-state">
                <Loader2 size={20} className="animate-spin" />
                <span>Loading insights…</span>
              </div>
            ) : editingInsights ? (
              // Raw editor mode
              <>
                <div className="memory-editor-container">
                  <FileEditor
                    content={insightsEditorContent ?? ""}
                    onChange={setInsightsEditorContent}
                    readOnly={false}
                    filePath=".fusion/memory/INSIGHTS.md"
                  />
                </div>
                <div className="memory-action-bar">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleCancelEditingInsights}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={handleSaveInsights}
                  >
                    Save Insights
                  </button>
                </div>
              </>
            ) : !insightsExists || parsedCategories.length === 0 ? (
              // Empty state
              <div className="memory-empty-state">
                <p>No insights extracted yet.</p>
                <p>
                  Insights are automatically extracted from working memory.
                  Click &quot;Extract Now&quot; to trigger extraction manually.
                </p>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleExtractInsights}
                  disabled={extracting}
                  style={{ marginTop: "var(--space-md)" }}
                >
                  {extracting ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Extracting…
                    </>
                  ) : (
                    "Extract Now"
                  )}
                </button>
              </div>
            ) : (
              // Parsed insights view
              <>
                <div className="memory-stats-row">
                  <div className="memory-stat-card">
                    <div className="memory-stat-value">{totalInsights}</div>
                    <div className="memory-stat-label">Total Insights</div>
                  </div>
                  <div className="memory-stat-card">
                    <div className="memory-stat-value">{parsedCategories.length}</div>
                    <div className="memory-stat-label">Categories</div>
                  </div>
                  {lastUpdated && (
                    <div className="memory-stat-card">
                      <div className="memory-stat-value" style={{ fontSize: "16px" }}>{lastUpdated}</div>
                      <div className="memory-stat-label">Last Updated</div>
                    </div>
                  )}
                </div>

                <div className="memory-action-bar">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={handleExtractInsights}
                    disabled={extracting}
                  >
                    {extracting ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Extracting…
                      </>
                    ) : (
                      "Extract Now"
                    )}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleStartEditingInsights}
                  >
                    Edit Raw
                  </button>
                </div>

                <div className="memory-categories-list">
                  {parsedCategories.map((category) => {
                    const isExpanded = !expandedCategories.has(category.key);
                    return (
                      <div key={category.key} className="memory-category-section">
                        <div
                          className="memory-category-header"
                          onClick={() => toggleCategory(category.key)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              toggleCategory(category.key);
                            }
                          }}
                        >
                          <h4>{category.name}</h4>
                          <span className="memory-category-count">
                            {category.items.length}
                          </span>
                        </div>
                        {isExpanded && (
                          <div className="memory-category-items">
                            {category.items.map((item, index) => (
                              <div key={index} className="memory-insight-item">
                                {item.replace(/^-\s+/, "").replace(/^\*\s+/, "")}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* Engines Tab */}
        {activeTab === "engines" && (
          <div className="memory-engines-tab">
            {backendLoading || auditLoading ? (
              <div className="memory-empty-state">
                <Loader2 size={20} className="animate-spin" />
                <span>Loading engine status…</span>
              </div>
            ) : (
              <>
                {/* Backend Card */}
                <div className="memory-engine-card">
                  <h3>Current Backend</h3>
                  <div className="memory-engine-status">
                    <span style={{ fontWeight: 500 }}>{getBackendDisplayName(backendStatus?.currentBackend ?? "unknown")}</span>
                  </div>
                  <div style={{ display: "flex", gap: "var(--space-xs)", marginTop: "var(--space-sm)", flexWrap: "wrap" }}>
                    {backendStatus?.capabilities?.readable && (
                      <span className="memory-capability-badge">Readable</span>
                    )}
                    {backendStatus?.capabilities?.writable && (
                      <span className="memory-capability-badge">Writable</span>
                    )}
                    {backendStatus?.capabilities?.supportsAtomicWrite && (
                      <span className="memory-capability-badge">Atomic Writes</span>
                    )}
                    {backendStatus?.capabilities?.persistent && (
                      <span className="memory-capability-badge">Persistent</span>
                    )}
                  </div>
                </div>

                {/* Health Status Card */}
                {auditReport && (
                  <div className="memory-engine-card">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-md)" }}>
                      <h3>Health Status</h3>
                      <span className={`memory-health-badge memory-health-badge--${auditReport.health}`}>
                        {getHealthBadgeText(auditReport.health)}
                      </span>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-md)" }}>
                      <div>
                        <div style={{ fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "var(--space-xs)" }}>
                          Working Memory
                        </div>
                        <div style={{ fontWeight: 500 }}>{auditReport.workingMemory.size} chars</div>
                        <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                          {auditReport.workingMemory.sectionCount} sections
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "var(--space-xs)" }}>
                          Insights Memory
                        </div>
                        <div style={{ fontWeight: 500 }}>{auditReport.insightsMemory.size} chars</div>
                        <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                          {auditReport.insightsMemory.insightCount} insights
                        </div>
                      </div>
                    </div>

                    <div style={{ marginTop: "var(--space-md)", paddingTop: "var(--space-md)", borderTop: "1px solid var(--border)" }}>
                      <div style={{ fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "var(--space-xs)" }}>
                        Last Extraction
                      </div>
                      <div style={{ fontWeight: 500 }}>
                        {auditReport.extraction.success ? (
                          <span style={{ color: "var(--color-success)" }}>Success</span>
                        ) : (
                          <span style={{ color: "var(--color-error)" }}>Failed</span>
                        )}
                      </div>
                      <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                        {auditReport.extraction.summary || `${auditReport.extraction.insightCount} insights extracted`}
                      </div>
                    </div>

                    <div style={{ marginTop: "var(--space-md)", paddingTop: "var(--space-md)", borderTop: "1px solid var(--border)" }}>
                      <div style={{ fontSize: "12px", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "var(--space-xs)" }}>
                        Pruning
                      </div>
                      <div style={{ fontWeight: 500 }}>
                        {auditReport.pruning.applied ? (
                          <span style={{ color: "var(--color-warning)" }}>Applied</span>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>Not needed</span>
                        )}
                      </div>
                      {auditReport.pruning.applied && (
                        <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                          {auditReport.pruning.reason}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Audit Checks */}
                {auditReport && auditReport.checks.length > 0 && (
                  <div className="memory-engine-card">
                    <h3>Audit Checks</h3>
                    <div>
                      {auditReport.checks.map((check) => (
                        <div key={check.id} className="memory-audit-check">
                          <span className={check.passed ? "memory-audit-check-passed" : "memory-audit-check-failed"}>
                            {check.passed ? "✓" : "✗"}
                          </span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 500 }}>{check.name}</div>
                            <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>{check.details}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="memory-action-bar">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => refreshAudit()}
                  >
                    Run Audit
                  </button>
                </div>

                {/* Note about Settings */}
                <div style={{ marginTop: "var(--space-lg)", fontSize: "13px", color: "var(--text-muted)" }}>
                  Note: Change backend type in{' '}
                  <span
                    style={{ cursor: "pointer", textDecoration: "underline" }}
                    onClick={() => {
                      // This would open the settings modal with memory section focused
                      // For now, just add a toast hint
                      addToast("Open Settings → Memory to change backend type", "info");
                    }}
                  >
                    Settings → Memory
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
