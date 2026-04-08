// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import {
  __resetSubtaskBreakdownState,
  getSubtaskSession,
  rehydrateFromStore,
  setAiSessionStore,
  subtaskStreamManager,
} from "./subtask-breakdown.js";
import type { AiSessionRow } from "./ai-session-store.js";

class MockAiSessionStore extends EventEmitter {
  rows = new Map<string, AiSessionRow>();

  get(id: string): AiSessionRow | null {
    return this.rows.get(id) ?? null;
  }

  listRecoverable(): AiSessionRow[] {
    return [...this.rows.values()].filter(
      (row) => row.status === "awaiting_input" || row.status === "generating",
    );
  }

  on(event: "ai_session:deleted", listener: (sessionId: string) => void): this {
    return super.on(event, listener);
  }

  off(event: "ai_session:deleted", listener: (sessionId: string) => void): this {
    return super.off(event, listener);
  }
}

function buildSubtaskRow(
  overrides: Partial<AiSessionRow> & Pick<AiSessionRow, "id" | "status">,
): AiSessionRow {
  const now = new Date().toISOString();
  return {
    id: overrides.id,
    type: overrides.type ?? "subtask",
    status: overrides.status,
    title: overrides.title ?? "Subtask breakdown",
    inputPayload:
      overrides.inputPayload ?? JSON.stringify({ initialDescription: "Break this task down" }),
    conversationHistory: overrides.conversationHistory ?? "[]",
    currentQuestion: overrides.currentQuestion ?? null,
    result:
      overrides.result ??
      JSON.stringify([
        {
          id: "subtask-1",
          title: "Define scope",
          description: "Plan the work",
          suggestedSize: "S",
          dependsOn: [],
        },
      ]),
    thinkingOutput: overrides.thinkingOutput ?? "thinking",
    error: overrides.error ?? null,
    projectId: overrides.projectId ?? null,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
}

describe("subtask-breakdown stream buffering", () => {
  beforeEach(() => {
    __resetSubtaskBreakdownState();
  });

  it("buffers broadcast events and forwards ids to subscribers", () => {
    const sessionId = "subtask-session-1";
    const callback = vi.fn();

    const unsubscribe = subtaskStreamManager.subscribe(sessionId, callback);

    const firstId = subtaskStreamManager.broadcast(sessionId, {
      type: "thinking",
      data: "delta-1",
    });
    const secondId = subtaskStreamManager.broadcast(sessionId, {
      type: "subtasks",
      data: [
        {
          id: "subtask-1",
          title: "Title",
          description: "Description",
          suggestedSize: "S",
          dependsOn: [],
        },
      ],
    });

    expect(firstId).toBe(1);
    expect(secondId).toBe(2);
    expect(callback).toHaveBeenNthCalledWith(1, { type: "thinking", data: "delta-1" }, 1);
    expect(callback).toHaveBeenNthCalledWith(2, expect.objectContaining({ type: "subtasks" }), 2);

    const buffered = subtaskStreamManager.getBufferedEvents(sessionId, 1);
    expect(buffered).toHaveLength(1);
    expect(buffered[0]).toMatchObject({ id: 2, event: "subtasks" });

    unsubscribe();
  });

  it("buffers complete events without subscribers", () => {
    const sessionId = "subtask-session-2";

    const eventId = subtaskStreamManager.broadcast(sessionId, { type: "complete" });

    expect(eventId).toBe(1);
    expect(subtaskStreamManager.getBufferedEvents(sessionId, 0)).toEqual([
      { id: 1, event: "complete", data: "{}" },
    ]);
  });

  it("clears subscriptions and buffered events on cleanupSession", () => {
    const sessionId = "subtask-session-3";
    const callback = vi.fn();

    subtaskStreamManager.subscribe(sessionId, callback);
    subtaskStreamManager.broadcast(sessionId, { type: "thinking", data: "delta" });

    expect(subtaskStreamManager.getBufferedEvents(sessionId, 0)).toHaveLength(1);

    subtaskStreamManager.cleanupSession(sessionId);

    expect(subtaskStreamManager.getBufferedEvents(sessionId, 0)).toEqual([]);
  });
});

describe("subtask-breakdown rehydration", () => {
  beforeEach(() => {
    __resetSubtaskBreakdownState();
  });

  it("rehydrates recoverable subtask sessions from SQLite rows", () => {
    const store = new MockAiSessionStore();
    const subtaskRow = buildSubtaskRow({ id: "subtask-rehydrate-1", status: "generating" });
    const planningRow = buildSubtaskRow({ id: "planning-rehydrate-1", status: "awaiting_input", type: "planning" });

    store.rows.set(subtaskRow.id, subtaskRow);
    store.rows.set(planningRow.id, planningRow);

    const rehydrated = rehydrateFromStore(store as any);

    expect(rehydrated).toBe(1);
    const session = getSubtaskSession(subtaskRow.id);
    expect(session).toBeDefined();
    expect(session?.sessionId).toBe(subtaskRow.id);
    expect(session?.initialDescription).toBe("Break this task down");
    expect(session?.status).toBe("generating");
    expect(session?.subtasks).toHaveLength(1);
    expect(getSubtaskSession(planningRow.id)).toBeUndefined();
  });

  it("skips corrupted rows and continues with valid rows", () => {
    const store = new MockAiSessionStore();
    const goodRow = buildSubtaskRow({ id: "subtask-good", status: "generating" });
    const badRow = buildSubtaskRow({
      id: "subtask-bad",
      status: "generating",
      inputPayload: "{bad-json",
    });

    store.rows.set(goodRow.id, goodRow);
    store.rows.set(badRow.id, badRow);

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const rehydrated = rehydrateFromStore(store as any);

    expect(rehydrated).toBe(1);
    expect(getSubtaskSession(goodRow.id)).toBeDefined();
    expect(getSubtaskSession(badRow.id)).toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      `[subtask-breakdown] Failed to rehydrate session ${badRow.id}:`,
      expect.any(Error),
    );
    errorSpy.mockRestore();
  });

  it("falls through to SQLite when session is missing in memory", () => {
    const store = new MockAiSessionStore();
    const row = buildSubtaskRow({ id: "subtask-fallthrough", status: "generating" });
    store.rows.set(row.id, row);
    setAiSessionStore(store as any);

    const session = getSubtaskSession(row.id);

    expect(session).toBeDefined();
    expect(session?.sessionId).toBe(row.id);
    expect(session?.initialDescription).toBe("Break this task down");
    expect(session?.status).toBe("generating");
  });

  it("returns in-memory session before SQLite fallback", () => {
    const store = new MockAiSessionStore();
    const row = buildSubtaskRow({ id: "subtask-memory-first", status: "generating" });
    store.rows.set(row.id, row);

    setAiSessionStore(store as any);
    rehydrateFromStore(store as any);

    store.rows.set(
      row.id,
      buildSubtaskRow({
        id: row.id,
        status: "generating",
        inputPayload: JSON.stringify({ initialDescription: "SQLite version" }),
      }),
    );

    const getSpy = vi.spyOn(store, "get");
    const session = getSubtaskSession(row.id);

    expect(session?.initialDescription).toBe("Break this task down");
    expect(getSpy).not.toHaveBeenCalled();
  });

  it("returns undefined when session exists nowhere", () => {
    const store = new MockAiSessionStore();
    setAiSessionStore(store as any);

    expect(getSubtaskSession("missing-subtask-session")).toBeUndefined();
  });
});
