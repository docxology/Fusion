import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";

export type EmbedStatus = "unknown" | "loading" | "embedded" | "blocked" | "error";
export type EmbedDetectionMethod = "auto" | "manual" | null;

const BLOCKED_CONTEXT = "The server may block iframe embedding via X-Frame-Options or Content-Security-Policy headers. Browsers prevent detecting these headers from JavaScript.";
const ERROR_CONTEXT = "The preview URL could not be loaded. The server may not be running or the URL may be incorrect.";
const TIMEOUT_CONTEXT = "Preview is taking longer than expected to load. The server may be blocking the iframe or may not have started yet.";

interface UsePreviewEmbedOptions {
  loadTimeoutMs?: number;
  detectionMethod?: EmbedDetectionMethod;
}

interface UsePreviewEmbedResult {
  embedStatus: EmbedStatus;
  isEmbedded: boolean;
  isBlocked: boolean;
  blockReason: string | null;
  detectionMethod: EmbedDetectionMethod;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  resetEmbedStatus: () => void;
  // Extended API for direct status control (backward compatibility)
  setEmbedStatus: (status: EmbedStatus) => void;
  retry: () => void;
  // Legacy aliases for backward compatibility
  embedContext: string | null;
  handleIframeLoad: () => void;
  handleIframeError: () => void;
  resetEmbed: () => void;
}

function defaultContextForStatus(status: EmbedStatus): string | null {
  switch (status) {
    case "blocked":
      return BLOCKED_CONTEXT;
    case "error":
      return ERROR_CONTEXT;
    case "embedded":
    case "loading":
    case "unknown":
    default:
      return null;
  }
}

export function usePreviewEmbed(url: string | null, options: UsePreviewEmbedOptions = {}): UsePreviewEmbedResult {
  const { loadTimeoutMs = 10000, detectionMethod: initialDetectionMethod = null } = options;

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [embedStatus, setEmbedStatusState] = useState<EmbedStatus>("unknown");
  const [blockReason, setBlockReason] = useState<string | null>(null);
  const [detectionMethod, setDetectionMethod] = useState<EmbedDetectionMethod>(initialDetectionMethod);

  const clearLoadingTimeout = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const setEmbedStatus = useCallback((status: EmbedStatus) => {
    setEmbedStatusState(status);
    setBlockReason(defaultContextForStatus(status));
  }, []);

  const setBlockedByTimeout = useCallback(() => {
    setEmbedStatusState("blocked");
    setBlockReason(TIMEOUT_CONTEXT);
  }, []);

  useEffect(() => {
    clearLoadingTimeout();

    if (!url) {
      setEmbedStatusState("unknown");
      setBlockReason(null);
      return;
    }

    setEmbedStatusState("unknown");
    setBlockReason(null);

    let canceled = false;
    queueMicrotask(() => {
      if (canceled) {
        return;
      }
      setEmbedStatusState("loading");
      setBlockReason(null);
    });

    return () => {
      canceled = true;
      clearLoadingTimeout();
    };
  }, [clearLoadingTimeout, url]);

  useEffect(() => {
    if (embedStatus !== "loading") {
      clearLoadingTimeout();
      return;
    }

    const timer = setTimeout(() => {
      timeoutRef.current = null;
      setBlockedByTimeout();
    }, loadTimeoutMs);

    timeoutRef.current = timer;

    return () => {
      clearTimeout(timer);
      if (timeoutRef.current === timer) {
        timeoutRef.current = null;
      }
    };
  }, [clearLoadingTimeout, embedStatus, loadTimeoutMs, setBlockedByTimeout]);

  const handleIframeLoad = useCallback(() => {
    const iframeEl = iframeRef.current;
    if (!iframeEl) {
      setEmbedStatus("embedded");
      return;
    }

    try {
      const frameHref = iframeEl.contentWindow?.location?.href;
      if (frameHref === "about:blank" && iframeEl.src !== "about:blank") {
        setEmbedStatus("blocked");
        return;
      }
    } catch {
      // Cross-origin access can throw; do not treat it as blocked.
    }

    setEmbedStatus("embedded");
  }, [setEmbedStatus]);

  const handleIframeError = useCallback(() => {
    setEmbedStatus("error");
  }, [setEmbedStatus]);

  const resetEmbedStatus = useCallback(() => {
    clearLoadingTimeout();
    setEmbedStatusState("unknown");
    setBlockReason(null);
  }, [clearLoadingTimeout]);

  const retry = useCallback(() => {
    clearLoadingTimeout();
    setEmbedStatusState("unknown");
    setBlockReason(null);
  }, [clearLoadingTimeout]);

  const isEmbedded = useMemo(() => embedStatus === "embedded", [embedStatus]);
  const isBlocked = useMemo(
    () => embedStatus === "blocked" || embedStatus === "error",
    [embedStatus],
  );

  return {
    embedStatus,
    isEmbedded,
    isBlocked,
    blockReason,
    detectionMethod,
    iframeRef,
    resetEmbedStatus,
    // Legacy aliases
    setEmbedStatus,
    embedContext: blockReason, // Alias for backward compatibility
    retry,
    handleIframeLoad,
    handleIframeError,
    resetEmbed: resetEmbedStatus,
  };
}

export const PREVIEW_EMBED_CONTEXT_MESSAGES = {
  blocked: BLOCKED_CONTEXT,
  error: ERROR_CONTEXT,
  timeout: TIMEOUT_CONTEXT,
} as const;
