/**
 * useRemoteNodeEvents hook - subscribes to SSE events from a remote node via the proxy.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const RECONNECT_DELAY_MS = 3000;
/** If no SSE message (including heartbeat events) arrives within this window, force reconnect. */
const HEARTBEAT_TIMEOUT_MS = 45_000;

export interface RemoteNodeEvent {
  type: string;
  data: unknown;
}

export interface UseRemoteNodeEventsResult {
  /** Whether the SSE connection is currently active */
  isConnected: boolean;
  /** The last received event, or null if no events received */
  lastEvent: RemoteNodeEvent | null;
}

/**
 * Hook for subscribing to SSE events from a remote node via the proxy.
 * Opens an EventSource to /api/proxy/:nodeId/events and listens for task events.
 * Implements reconnection logic and heartbeat timeout detection.
 */
export function useRemoteNodeEvents(nodeId: string | null): UseRemoteNodeEventsResult {
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<RemoteNodeEvent | null>(null);
  const [connectionNonce, setConnectionNonce] = useState(0);

  // Refs for cleanup
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset heartbeat watchdog on each message
  const resetHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearTimeout(heartbeatTimerRef.current);
    }
    heartbeatTimerRef.current = setTimeout(() => {
      // No message received within the timeout — connection is likely dead
      handleConnectionError();
    }, HEARTBEAT_TIMEOUT_MS);
  }, []);

  // Handle connection errors and schedule reconnect
  const handleConnectionError = useCallback(() => {
    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (heartbeatTimerRef.current) {
      clearTimeout(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }

    setIsConnected(false);

    // Schedule reconnect
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
    }
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      setConnectionNonce((n) => n + 1);
    }, RECONNECT_DELAY_MS);
  }, []);

  // Set up EventSource connection
  useEffect(() => {
    // No nodeId means no connection needed
    if (!nodeId) {
      setIsConnected(false);
      setLastEvent(null);
      return;
    }

    // Clean up any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (heartbeatTimerRef.current) {
      clearTimeout(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    // Build SSE URL
    const encodedNodeId = encodeURIComponent(nodeId);
    const esUrl = `/api/proxy/${encodedNodeId}/events`;
    const eventSource = new EventSource(esUrl);
    eventSourceRef.current = eventSource;

    // Start heartbeat watchdog
    resetHeartbeat();

    // Handle open event
    eventSource.onopen = () => {
      setIsConnected(true);
      resetHeartbeat();
    };

    // Handle task:created events
    eventSource.addEventListener("task:created", (event: Event) => {
      resetHeartbeat();
      const messageEvent = event as MessageEvent;
      setLastEvent({
        type: "task:created",
        data: messageEvent.data,
      });
    });

    // Handle task:moved events
    eventSource.addEventListener("task:moved", (event: Event) => {
      resetHeartbeat();
      const messageEvent = event as MessageEvent;
      setLastEvent({
        type: "task:moved",
        data: messageEvent.data,
      });
    });

    // Handle task:updated events
    eventSource.addEventListener("task:updated", (event: Event) => {
      resetHeartbeat();
      const messageEvent = event as MessageEvent;
      setLastEvent({
        type: "task:updated",
        data: messageEvent.data,
      });
    });

    // Handle task:deleted events
    eventSource.addEventListener("task:deleted", (event: Event) => {
      resetHeartbeat();
      const messageEvent = event as MessageEvent;
      setLastEvent({
        type: "task:deleted",
        data: messageEvent.data,
      });
    });

    // Handle task:merged events
    eventSource.addEventListener("task:merged", (event: Event) => {
      resetHeartbeat();
      const messageEvent = event as MessageEvent;
      setLastEvent({
        type: "task:merged",
        data: messageEvent.data,
      });
    });

    // Handle heartbeat events (named event type)
    eventSource.addEventListener("heartbeat", () => {
      resetHeartbeat();
    });

    // Handle errors
    eventSource.onerror = () => {
      handleConnectionError();
    };

    // Cleanup on unmount or when nodeId changes
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (heartbeatTimerRef.current) {
        clearTimeout(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      setIsConnected(false);
    };
  }, [nodeId, connectionNonce, handleConnectionError, resetHeartbeat]);

  return {
    isConnected,
    lastEvent,
  };
}
