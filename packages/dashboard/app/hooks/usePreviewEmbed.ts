import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";

export type EmbedStatus = "unknown" | "loading" | "embedded" | "blocked" | "error";

const BLOCKED_CONTEXT = "The server may block iframe embedding via X-Frame-Options or Content-Security-Policy headers. Browsers prevent detecting these headers from JavaScript.";
const ERROR_CONTEXT = "The preview URL could not be loaded. The server may not be running or the URL may be incorrect.";
const TIMEOUT_CONTEXT = "Preview is taking longer than expected to load. The server may be blocking the iframe or may not have started yet.";

interface UsePreviewEmbedOptions {
  loadTimeoutMs?: number;
}

interface UsePreviewEmbedResult {
  embedStatus: EmbedStatus;
  setEmbedStatus: (status: EmbedStatus) => void;
  resetEmbedStatus: () => void;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  isEmbedded: boolean;
  isBlocked: boolean;
  embedContext: string | null;
  retry: () => void;
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
  const { loadTimeoutMs = 10000 } = options;

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [embedStatus, setEmbedStatusState] = useState<EmbedStatus>("unknown");
  const [embedContext, setEmbedContext] = useState<string | null>(null);

  const clearLoadingTimeout = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const setEmbedStatus = useCallback((status: EmbedStatus) => {
    setEmbedStatusState(status);
    setEmbedContext(defaultContextForStatus(status));
  }, []);

  const setBlockedByTimeout = useCallback(() => {
    setEmbedStatusState("blocked");
    setEmbedContext(TIMEOUT_CONTEXT);
  }, []);

  useEffect(() => {
    clearLoadingTimeout();

    if (!url) {
      setEmbedStatusState("unknown");
      setEmbedContext(null);
      return;
    }

    setEmbedStatusState("unknown");
    setEmbedContext(null);

    let canceled = false;
    queueMicrotask(() => {
      if (canceled) {
        return;
      }
      setEmbedStatusState("loading");
      setEmbedContext(null);
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
    setEmbedContext(null);
  }, [clearLoadingTimeout]);

  const retry = useCallback(() => {
    clearLoadingTimeout();
    setEmbedStatusState("unknown");
    setEmbedContext(null);
  }, [clearLoadingTimeout]);

  const isEmbedded = useMemo(() => embedStatus === "embedded", [embedStatus]);
  const isBlocked = useMemo(
    () => embedStatus === "blocked" || embedStatus === "error",
    [embedStatus],
  );

  return {
    embedStatus,
    setEmbedStatus,
    resetEmbedStatus,
    iframeRef,
    isEmbedded,
    isBlocked,
    embedContext,
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
