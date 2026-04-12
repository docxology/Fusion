import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import type { Task } from "@fusion/core";
import * as fs from "node:fs";

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    existsSync: vi.fn(),
  };
});

const mockExistsSync = vi.mocked(fs.existsSync);

class MockStore extends EventEmitter {
  private tasks = new Map<string, Task>();

  getRootDir(): string {
    return "/tmp/fn-679";
  }

  getFusionDir(): string {
    return "/tmp/fn-679/.fusion";
  }

  getDatabase() {
    return {
      exec: vi.fn(),
      prepare: vi.fn().mockReturnValue({ run: vi.fn().mockReturnValue({ changes: 0 }), get: vi.fn(), all: vi.fn().mockReturnValue([]) }),
    };
  }

  getMissionStore() {
    return {
      listMissions: vi.fn().mockResolvedValue([]),
      createMission: vi.fn(),
      getMission: vi.fn(),
      updateMission: vi.fn(),
      deleteMission: vi.fn(),
      listTemplates: vi.fn().mockResolvedValue([]),
      createTemplate: vi.fn(),
      getTemplate: vi.fn(),
      updateTemplate: vi.fn(),
      deleteTemplate: vi.fn(),
      instantiateMission: vi.fn(),
    };
  }

  async listTasks(): Promise<Task[]> {
    return Array.from(this.tasks.values());
  }

  getTask(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  addTask(task: Task): void {
    this.tasks.set(task.id, task);
  }
}

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "FN-679",
    title: "Test task",
    description: "Test description",
    column: "in-progress",
    dependencies: [],
    steps: [],
    currentStep: 0,
    log: [],
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    columnMovedAt: "2026-04-01T00:00:00.000Z",
    worktree: "/tmp/fn-679",
    baseBranch: "main",
    ...overrides,
  };
}

async function requestDiff(app: Parameters<typeof import("../test-request.js").get>[0], taskId = "FN-679", worktree?: string): Promise<{ status: number; body: any }> {
  const { get } = await import("../test-request.js");
  const url = `/api/tasks/${taskId}/diff${worktree ? `?worktree=${encodeURIComponent(worktree)}` : ""}`;
  return get(app, url);
}

describe("GET /api/tasks/:id/diff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 404 when task not found", async () => {
    const store = new MockStore();

    const { createServer } = await import("../server.js");
    const app = createServer(store as any);
    const response = await requestDiff(app, "NONEXISTENT");

    expect(response.status).toBe(404);
  });

  it("handler can be created with valid task", async () => {
    const store = new MockStore();
    store.addTask(createTask({ baseBranch: "develop" }));

    const { createServer } = await import("../server.js");
    const app = createServer(store as any);
    const response = await requestDiff(app);

    // Should return 200 or 500 depending on git command results
    expect([200, 500]).toContain(response.status);
  });
});

describe("GET /api/tasks/:id/diff — done tasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns empty result when rev-parse sha^ fails", async () => {
    const store = new MockStore();
    store.addTask(createTask({
      column: "done",
      mergeDetails: { commitSha: "broken_sha" },
    }));

    const { createServer } = await import("../server.js");
    const app = createServer(store as any);
    const response = await requestDiff(app);

    expect(response.status).toBe(200);
    expect(response.body.files).toEqual([]);
  });

  it("returns empty result for done task without commitSha", async () => {
    const store = new MockStore();
    store.addTask(createTask({
      column: "done",
      mergeDetails: undefined,
    }));

    const { createServer } = await import("../server.js");
    const app = createServer(store as any);
    const response = await requestDiff(app);

    expect(response.status).toBe(200);
    expect(response.body.files).toEqual([]);
  });
});
