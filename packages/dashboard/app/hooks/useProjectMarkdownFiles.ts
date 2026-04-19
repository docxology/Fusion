import { useState, useEffect, useRef, useCallback } from "react";
import { fetchProjectMarkdownFiles, type MarkdownFileEntry } from "../api";

export interface UseProjectMarkdownFilesResult {
  files: MarkdownFileEntry[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Hook for fetching markdown files from the project workspace.
 *
 * Loading behavior matches useDocuments: loading is true only for the initial
 * fetch, not for subsequent refreshes, to avoid content flicker.
 */
export function useProjectMarkdownFiles(projectId?: string): UseProjectMarkdownFilesResult {
  const [files, setFiles] = useState<MarkdownFileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const initialLoadCompleteRef = useRef(false);

  const refresh = useCallback(async () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const requestController = new AbortController();
    abortRef.current = requestController;

    const isInitial = !initialLoadCompleteRef.current;
    if (isInitial) {
      setLoading(true);
    }

    setError(null);

    try {
      const response = await fetchProjectMarkdownFiles(projectId);

      if (requestController.signal.aborted) {
        return;
      }

      setFiles(response.files);
      initialLoadCompleteRef.current = true;
    } catch (err: unknown) {
      if (requestController.signal.aborted) {
        return;
      }

      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (!requestController.signal.aborted && isInitial) {
        setLoading(false);
      }
    }
  }, [projectId]);

  useEffect(() => {
    initialLoadCompleteRef.current = false;
    void refresh();

    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, [refresh]);

  return {
    files,
    loading,
    error,
    refresh,
  };
}
