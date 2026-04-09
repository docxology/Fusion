import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRemoteNodeEvents } from "../useRemoteNodeEvents";

describe("useRemoteNodeEvents", () => {
  let mockEventSource: {
    close: ReturnType<typeof vi.fn>;
    onopen: ((...args: unknown[]) => void) | null;
    onerror: ((...args: unknown[]) => void) | null;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
    readyState: number;
  };

  beforeEach(() => {
    vi.useFakeTimers();

    // Create mock EventSource
    mockEventSource = {
      close: vi.fn(),
      onopen: null,
      onerror: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      readyState: 1, // CONNECTING
    };

    // Mock global EventSource constructor
    vi.stubGlobal("EventSource", vi.fn().mockImplementation(() => mockEventSource));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("when nodeId is null", () => {
    it("returns disconnected state without creating EventSource", () => {
      const { result } = renderHook(() => useRemoteNodeEvents(null));

      expect(result.current.isConnected).toBe(false);
      expect(result.current.lastEvent).toBe(null);
      expect(vi.mocked(EventSource)).not.toHaveBeenCalled();
    });

    it("returns disconnected state with null nodeId even after timer advances", () => {
      const { result } = renderHook(() => useRemoteNodeEvents(null));

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(result.current.isConnected).toBe(false);
      expect(result.current.lastEvent).toBe(null);
    });
  });

  describe("when nodeId is provided", () => {
    it("creates EventSource connected to proxy SSE endpoint", () => {
      renderHook(() => useRemoteNodeEvents("node_abc"));

      expect(vi.mocked(EventSource)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(EventSource)).toHaveBeenCalledWith("/api/proxy/node_abc/events");
    });

    it("properly encodes nodeId with special characters", () => {
      renderHook(() => useRemoteNodeEvents("node/abc+test"));

      expect(vi.mocked(EventSource)).toHaveBeenCalledWith("/api/proxy/node%2Fabc%2Btest/events");
    });

    it("returns disconnected initially until onopen fires", () => {
      const { result } = renderHook(() => useRemoteNodeEvents("node_abc"));

      expect(result.current.isConnected).toBe(false);
      expect(result.current.lastEvent).toBe(null);

      // Simulate connection open
      act(() => {
        mockEventSource.onopen?.({});
      });

      expect(result.current.isConnected).toBe(true);
    });

    it("stores last event when task:created event is received", () => {
      const { result } = renderHook(() => useRemoteNodeEvents("node_abc"));

      act(() => {
        mockEventSource.onopen?.({});
      });

      // Simulate task:created event
      const taskCreatedHandler = vi.mocked(mockEventSource.addEventListener).mock.calls.find(
        (call) => call[0] === "task:created",
      )?.[1] as (event: MessageEvent) => void;

      const mockEvent = { data: '{"id":"FN-001","title":"Test"}' } as MessageEvent;
      act(() => {
        taskCreatedHandler?.(mockEvent);
      });

      expect(result.current.lastEvent).toEqual({
        type: "task:created",
        data: '{"id":"FN-001","title":"Test"}',
      });
    });

    it("stores last event for each event type", () => {
      const { result } = renderHook(() => useRemoteNodeEvents("node_abc"));

      act(() => {
        mockEventSource.onopen?.({});
      });

      // Test task:moved
      const movedHandler = vi.mocked(mockEventSource.addEventListener).mock.calls.find(
        (call) => call[0] === "task:moved",
      )?.[1] as (event: MessageEvent) => void;
      act(() => {
        movedHandler?.({ data: '{"task":"FN-001","to":"in-progress"}' } as MessageEvent);
      });
      expect(result.current.lastEvent?.type).toBe("task:moved");

      // Test task:updated
      const updatedHandler = vi.mocked(mockEventSource.addEventListener).mock.calls.find(
        (call) => call[0] === "task:updated",
      )?.[1] as (event: MessageEvent) => void;
      act(() => {
        updatedHandler?.({ data: '{"id":"FN-001","title":"Updated"}' } as MessageEvent);
      });
      expect(result.current.lastEvent?.type).toBe("task:updated");

      // Test task:deleted
      const deletedHandler = vi.mocked(mockEventSource.addEventListener).mock.calls.find(
        (call) => call[0] === "task:deleted",
      )?.[1] as (event: MessageEvent) => void;
      act(() => {
        deletedHandler?.({ data: '{"id":"FN-001"}' } as MessageEvent);
      });
      expect(result.current.lastEvent?.type).toBe("task:deleted");

      // Test task:merged
      const mergedHandler = vi.mocked(mockEventSource.addEventListener).mock.calls.find(
        (call) => call[0] === "task:merged",
      )?.[1] as (event: MessageEvent) => void;
      act(() => {
        mergedHandler?.({ data: '{"id":"FN-001"}' } as MessageEvent);
      });
      expect(result.current.lastEvent?.type).toBe("task:merged");
    });

    it("closes EventSource on unmount", () => {
      const { unmount } = renderHook(() => useRemoteNodeEvents("node_abc"));

      act(() => {
        mockEventSource.onopen?.({});
      });

      expect(mockEventSource.close).not.toHaveBeenCalled();

      unmount();

      expect(mockEventSource.close).toHaveBeenCalledTimes(1);
    });

    it("closes EventSource and reconnects on error", () => {
      const { result } = renderHook(() => useRemoteNodeEvents("node_abc"));

      act(() => {
        mockEventSource.onopen?.({});
      });

      expect(result.current.isConnected).toBe(true);

      // Simulate error
      act(() => {
        mockEventSource.onerror?.({});
      });

      expect(mockEventSource.close).toHaveBeenCalledTimes(1);
      expect(result.current.isConnected).toBe(false);

      // Advance timer to trigger reconnect
      act(() => {
        vi.advanceTimersByTime(3000);
      });

      // Should have created a new EventSource
      expect(vi.mocked(EventSource)).toHaveBeenCalledTimes(2);
    });

    it("cleans up heartbeat timer on unmount", () => {
      const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");

      const { unmount } = renderHook(() => useRemoteNodeEvents("node_abc"));

      act(() => {
        mockEventSource.onopen?.({});
      });

      unmount();

      expect(clearTimeoutSpy).toHaveBeenCalled();
    });

    it("closes previous EventSource when nodeId changes", () => {
      const { rerender } = renderHook(
        ({ nodeId }: { nodeId: string | null }) => useRemoteNodeEvents(nodeId),
        { initialProps: { nodeId: "node_abc" } },
      );

      act(() => {
        mockEventSource.onopen?.({});
      });

      expect(mockEventSource.close).not.toHaveBeenCalled();

      // Change nodeId
      rerender({ nodeId: "node_xyz" });

      expect(mockEventSource.close).toHaveBeenCalledTimes(1);
    });

    it("closes EventSource on unmount", () => {
      const { unmount } = renderHook(() => useRemoteNodeEvents("node_abc"));

      act(() => {
        mockEventSource.onopen?.({});
      });

      expect(mockEventSource.close).not.toHaveBeenCalled();

      unmount();

      expect(mockEventSource.close).toHaveBeenCalledTimes(1);
    });
  });

  describe("reconnection timing", () => {
    it("reconnects after RECONNECT_DELAY_MS (3000)", () => {
      renderHook(() => useRemoteNodeEvents("node_abc"));

      act(() => {
        mockEventSource.onopen?.({});
      });

      act(() => {
        mockEventSource.onerror?.({});
      });

      expect(result => {
        vi.mocked(EventSource).mock.calls.length === 1;
      });

      // Advance time but not enough for reconnect
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      // Should not have reconnected yet
      expect(vi.mocked(EventSource)).toHaveBeenCalledTimes(1);

      // Advance remaining time
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      // Should have reconnected
      expect(vi.mocked(EventSource)).toHaveBeenCalledTimes(2);
    });
  });
});
