import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useBackgroundSessions } from "../useBackgroundSessions";
import {
  __destroyAiSessionSyncStoreForTests,
  __resetAiSessionSyncStoreForTests,
  useAiSessionSync,
} from "../useAiSessionSync";
import * as apiModule from "../../api";

vi.mock("../../api", () => ({
  fetchAiSessions: vi.fn(),
  deleteAiSession: vi.fn(),
}));

const mockFetchAiSessions = vi.mocked(apiModule.fetchAiSessions);
const mockDeleteAiSession = vi.mocked(apiModule.deleteAiSession);

class MockEventSource {
  static instances: MockEventSource[] = [];

  readonly url: string;
  private listeners = new Map<string, Set<(event: MessageEvent) => void>>();

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    const set = this.listeners.get(type) ?? new Set<(event: MessageEvent) => void>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: (event: MessageEvent) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  close(): void {
    this.listeners.clear();
  }

  emit(type: string, payload: unknown): void {
    const event = { data: JSON.stringify(payload) } as MessageEvent;
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

describe("useBackgroundSessions", () => {
  const originalEventSource = globalThis.EventSource;

  beforeEach(() => {
    vi.clearAllMocks();
    __resetAiSessionSyncStoreForTests();
    __destroyAiSessionSyncStoreForTests();

    MockEventSource.instances = [];
    (globalThis as unknown as { EventSource: typeof EventSource }).EventSource =
      MockEventSource as unknown as typeof EventSource;

    mockFetchAiSessions.mockResolvedValue([]);
    mockDeleteAiSession.mockResolvedValue(undefined);
  });

  afterEach(() => {
    __resetAiSessionSyncStoreForTests();
    __destroyAiSessionSyncStoreForTests();
    (globalThis as unknown as { EventSource: typeof EventSource }).EventSource = originalEventSource;
  });

  it("merges cross-tab session updates into the local list", async () => {
    const background = renderHook(() => useBackgroundSessions("proj-1"));
    const sync = renderHook(() => useAiSessionSync());

    await waitFor(() => {
      expect(mockFetchAiSessions).toHaveBeenCalledWith("proj-1");
    });

    act(() => {
      sync.result.current.broadcastUpdate({
        sessionId: "sess-cross-tab",
        status: "awaiting_input",
        needsInput: true,
        type: "planning",
        title: "Cross-tab planning",
        projectId: "proj-1",
        owningTabId: "tab-other",
        timestamp: 500,
      });
    });

    await waitFor(() => {
      expect(background.result.current.sessions).toHaveLength(1);
      expect(background.result.current.sessions[0]).toMatchObject({
        id: "sess-cross-tab",
        status: "awaiting_input",
        type: "planning",
      });
    });
  });

  it("broadcasts SSE updates through the sync store", async () => {
    const background = renderHook(() => useBackgroundSessions("proj-1"));
    const sync = renderHook(() => useAiSessionSync());

    await waitFor(() => {
      expect(MockEventSource.instances.length).toBeGreaterThan(0);
    });

    const eventSource = MockEventSource.instances[0];

    act(() => {
      eventSource.emit("ai_session:updated", {
        id: "sess-sse",
        type: "subtask",
        status: "generating",
        title: "SSE session",
        projectId: "proj-1",
        lockedByTab: "tab-remote",
        updatedAt: "2026-04-08T00:00:00.000Z",
      });
    });

    await waitFor(() => {
      expect(background.result.current.sessions[0]?.id).toBe("sess-sse");
    });

    await waitFor(() => {
      const synced = sync.result.current.sessions.get("sess-sse");
      expect(synced?.status).toBe("generating");
      expect(synced?.type).toBe("subtask");
      expect(synced?.owningTabId).toBe("tab-remote");
    });
  });
});
