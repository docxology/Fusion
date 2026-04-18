import { useState, useEffect, useCallback } from "react";
import {
  fetchMemory,
  saveMemory,
  fetchMemoryInsights,
  saveMemoryInsights,
  triggerInsightExtraction,
  fetchMemoryAudit,
  fetchMemoryStats,
  compactMemory,
  fetchMemoryBackendStatus,
  type MemoryAuditReport,
  type MemoryBackendStatus,
} from "../api";
import { useMemoryBackendStatus } from "./useMemoryBackendStatus";

interface UseMemoryDataOptions {
  /** Project ID for multi-project contexts */
  projectId?: string;
}

interface UseMemoryDataResult {
  // Working memory
  workingMemory: string;
  workingMemoryLoading: boolean;
  workingMemoryDirty: boolean;
  setWorkingMemory: (content: string) => void;
  saveWorkingMemory: () => Promise<void>;
  savingWorkingMemory: boolean;

  // Insights
  insightsContent: string | null;
  insightsLoading: boolean;
  insightsExists: boolean;
  refreshInsights: () => Promise<void>;
  saveInsights: (content: string) => Promise<void>;

  // Backend status
  backendStatus: MemoryBackendStatus | null;
  backendLoading: boolean;

  // Extraction
  extractInsights: () => Promise<{ success: boolean; summary: string }>;
  extracting: boolean;

  // Audit
  auditReport: MemoryAuditReport | null;
  auditLoading: boolean;
  refreshAudit: () => Promise<void>;

  // Compact
  compactMemory: () => Promise<void>;
  compacting: boolean;

  // Stats
  stats: { workingMemorySize: number; insightsSize: number; insightsExists: boolean } | null;
}

export function useMemoryData(options: UseMemoryDataOptions = {}): UseMemoryDataResult {
  const { projectId } = options;

  // Working memory state
  const [workingMemory, setWorkingMemoryRaw] = useState("");
  const [workingMemoryLoading, setWorkingMemoryLoading] = useState(true);
  const [workingMemoryDirty, setWorkingMemoryDirty] = useState(false);
  const [savingWorkingMemory, setSavingWorkingMemory] = useState(false);

  // Insights state
  const [insightsContent, setInsightsContent] = useState<string | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [insightsExists, setInsightsExists] = useState(false);

  // Extraction state
  const [extracting, setExtracting] = useState(false);

  // Audit state
  const [auditReport, setAuditReport] = useState<MemoryAuditReport | null>(null);
  const [auditLoading, setAuditLoading] = useState(true);

  // Compact state
  const [compacting, setCompacting] = useState(false);

  // Stats state
  const [stats, setStats] = useState<{ workingMemorySize: number; insightsSize: number; insightsExists: boolean } | null>(null);

  // Backend status from existing hook
  const { status: backendStatus, loading: backendLoading } = useMemoryBackendStatus({ projectId });

  // Fetch working memory on mount
  useEffect(() => {
    let cancelled = false;

    async function loadWorkingMemory() {
      try {
        const data = await fetchMemory(projectId);
        if (!cancelled) {
          setWorkingMemoryRaw(data.content);
          setWorkingMemoryLoading(false);
        }
      } catch {
        if (!cancelled) {
          setWorkingMemoryRaw("");
          setWorkingMemoryLoading(false);
        }
      }
    }

    loadWorkingMemory();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Fetch insights on mount
  useEffect(() => {
    let cancelled = false;

    async function loadInsights() {
      try {
        const data = await fetchMemoryInsights(projectId);
        if (!cancelled) {
          setInsightsContent(data.content);
          setInsightsExists(data.exists);
          setInsightsLoading(false);
        }
      } catch {
        if (!cancelled) {
          setInsightsContent(null);
          setInsightsExists(false);
          setInsightsLoading(false);
        }
      }
    }

    loadInsights();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Fetch audit on mount
  useEffect(() => {
    let cancelled = false;

    async function loadAudit() {
      try {
        const data = await fetchMemoryAudit(projectId);
        if (!cancelled) {
          setAuditReport(data);
          setAuditLoading(false);
        }
      } catch {
        if (!cancelled) {
          setAuditReport(null);
          setAuditLoading(false);
        }
      }
    }

    loadAudit();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Set working memory with dirty tracking
  const setWorkingMemory = useCallback((content: string) => {
    setWorkingMemoryRaw(content);
    setWorkingMemoryDirty(true);
  }, []);

  // Save working memory
  const saveWorkingMemory = useCallback(async () => {
    if (!workingMemoryDirty) return;

    setSavingWorkingMemory(true);
    try {
      await saveMemory(workingMemory, projectId);
      setWorkingMemoryDirty(false);
    } finally {
      setSavingWorkingMemory(false);
    }
  }, [workingMemory, workingMemoryDirty, projectId]);

  // Refresh audit
  const refreshAudit = useCallback(async () => {
    try {
      const data = await fetchMemoryAudit(projectId);
      setAuditReport(data);
    } catch {
      setAuditReport(null);
    }
  }, [projectId]);

  // Refresh insights
  const refreshInsights = useCallback(async () => {
    try {
      const data = await fetchMemoryInsights(projectId);
      setInsightsContent(data.content);
      setInsightsExists(data.exists);
    } catch {
      setInsightsContent(null);
      setInsightsExists(false);
    }
  }, [projectId]);

  // Save insights
  const saveInsights = useCallback(async (content: string) => {
    await saveMemoryInsights(content, projectId);
    await refreshInsights();
  }, [projectId, refreshInsights]);

  // Extract insights
  const extractInsights = useCallback(async (): Promise<{ success: boolean; summary: string }> => {
    setExtracting(true);
    try {
      const result = await triggerInsightExtraction(projectId);
      // Refresh insights and audit after extraction
      await Promise.all([refreshInsights(), refreshAudit()]);
      return { success: result.success, summary: result.summary };
    } finally {
      setExtracting(false);
    }
  }, [projectId, refreshInsights, refreshAudit]);

  // Compact memory
  const compactMemoryAction = useCallback(async () => {
    setCompacting(true);
    try {
      const result = await compactMemory(projectId);
      // Update working memory with compacted content
      setWorkingMemoryRaw(result.content);
      setWorkingMemoryDirty(true);
    } finally {
      setCompacting(false);
    }
  }, [projectId]);

  return {
    // Working memory
    workingMemory,
    workingMemoryLoading,
    workingMemoryDirty,
    setWorkingMemory,
    saveWorkingMemory,
    savingWorkingMemory,

    // Insights
    insightsContent,
    insightsLoading,
    insightsExists,
    refreshInsights,
    saveInsights,

    // Backend status
    backendStatus,
    backendLoading,

    // Extraction
    extractInsights,
    extracting,

    // Audit
    auditReport,
    auditLoading,
    refreshAudit,

    // Compact
    compactMemory: compactMemoryAction,
    compacting,

    // Stats
    stats,
  };
}
