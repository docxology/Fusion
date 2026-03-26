import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentSemaphore } from "./concurrency.js";

// Mock external dependencies
vi.mock("./pi.js", () => ({
  createHaiAgent: vi.fn(),
}));
vi.mock("./reviewer.js", () => ({
  reviewStep: vi.fn(),
}));
vi.mock("./merger.js", () => ({
  findWorktreeUser: vi.fn().mockResolvedValue(null),
}));

// Mock node modules used by executor
vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));
vi.mock("node:fs", () => ({
  existsSync: vi.fn().mockReturnValue(true),
}));

import { TaskExecutor } from "./executor.js";
import { createHaiAgent } from "./pi.js";
import { execSync } from "node:child_process";
import { findWorktreeUser } from "./merger.js";
import type { Column, Task } from "@hai/core";

const mockedCreateHaiAgent = vi.mocked(createHaiAgent);

function createMockStore() {
  const listeners = new Map<string, Function[]>();
  return {
    on: vi.fn((event: string, fn: Function) => {
      const existing = listeners.get(event) || [];
      existing.push(fn);
      listeners.set(event, existing);
    }),
    emit: vi.fn(),
    listTasks: vi.fn().mockResolvedValue([]),
    getTask: vi.fn().mockResolvedValue({
      id: "HAI-001",
      title: "Test",
      description: "Test task",
      column: "in-progress",
      dependencies: [],
      steps: [],
      currentStep: 0,
      log: [],
      prompt: "# test\n## Steps\n### Step 0: Preflight\n- [ ] check",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
    updateTask: vi.fn().mockResolvedValue({}),
    moveTask: vi.fn().mockResolvedValue({}),
    logEntry: vi.fn().mockResolvedValue(undefined),
    parseStepsFromPrompt: vi.fn().mockResolvedValue([]),
    getSettings: vi.fn().mockResolvedValue({
      maxConcurrent: 2,
      maxWorktrees: 4,
      pollIntervalMs: 15000,
      groupOverlappingFiles: false,
      autoMerge: false,
      worktreeInitCommand: undefined,
    }),
    updateStep: vi.fn().mockResolvedValue({}),
  } as any;
}

describe("TaskExecutor with semaphore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("acquires semaphore before creating agent and releases after", async () => {
    const sem = new AgentSemaphore(2);
    const store = createMockStore();
    const acquireSpy = vi.spyOn(sem, "acquire");
    const releaseSpy = vi.spyOn(sem, "release");

    mockedCreateHaiAgent.mockResolvedValue({
      session: {
        prompt: vi.fn().mockResolvedValue(undefined),
        dispose: vi.fn(),
      },
    } as any);

    const executor = new TaskExecutor(store, "/tmp/test", { semaphore: sem });

    await executor.execute({
      id: "HAI-001",
      title: "Test",
      description: "Test",
      column: "in-progress",
      dependencies: [],
      steps: [],
      currentStep: 0,
      log: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    expect(acquireSpy).toHaveBeenCalledOnce();
    expect(releaseSpy).toHaveBeenCalledOnce();
    expect(sem.activeCount).toBe(0);
  });

  it("releases semaphore on agent error", async () => {
    const sem = new AgentSemaphore(1);
    const store = createMockStore();

    mockedCreateHaiAgent.mockRejectedValue(new Error("agent failed"));

    const onError = vi.fn();
    const executor = new TaskExecutor(store, "/tmp/test", {
      semaphore: sem,
      onError,
    });

    await executor.execute({
      id: "HAI-001",
      title: "Test",
      description: "Test",
      column: "in-progress",
      dependencies: [],
      steps: [],
      currentStep: 0,
      log: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    expect(sem.activeCount).toBe(0);
    expect(onError).toHaveBeenCalled();
  });

  it("concurrent executions respect semaphore limit", async () => {
    const sem = new AgentSemaphore(1);
    const store = createMockStore();
    let concurrent = 0;
    let maxConcurrent = 0;

    mockedCreateHaiAgent.mockImplementation(async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      return {
        session: {
          prompt: vi.fn().mockImplementation(async () => {
            await new Promise((r) => setTimeout(r, 10));
            concurrent--;
          }),
          dispose: vi.fn(),
        },
      } as any;
    });

    const executor = new TaskExecutor(store, "/tmp/test", { semaphore: sem });

    const task = (id: string) => ({
      id,
      title: "Test",
      description: "Test",
      column: "in-progress" as const,
      dependencies: [],
      steps: [],
      currentStep: 0,
      log: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await Promise.all([
      executor.execute(task("HAI-001")),
      executor.execute(task("HAI-002")),
      executor.execute(task("HAI-003")),
    ]);

    expect(maxConcurrent).toBe(1);
    expect(sem.activeCount).toBe(0);
  });
});

const mockedExecSync = vi.mocked(execSync);
const { existsSync: mockedExistsSyncRaw } = await import("node:fs");
const mockedExistsSync = vi.mocked(mockedExistsSyncRaw);

describe("TaskExecutor worktreeInitCommand", () => {
  const makeTask = (id = "HAI-010") => ({
    id,
    title: "Test",
    description: "Test",
    column: "in-progress" as const,
    dependencies: [],
    steps: [],
    currentStep: 0,
    log: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: worktree does NOT exist (new worktree)
    mockedExistsSync.mockReturnValue(false);
    mockedCreateHaiAgent.mockResolvedValue({
      session: {
        prompt: vi.fn().mockResolvedValue(undefined),
        dispose: vi.fn(),
      },
    } as any);
  });

  it("runs worktreeInitCommand in new worktree when configured", async () => {
    const store = createMockStore();
    store.getSettings.mockResolvedValue({
      maxConcurrent: 2,
      maxWorktrees: 4,
      pollIntervalMs: 15000,
      groupOverlappingFiles: false,
      autoMerge: false,
      worktreeInitCommand: "pnpm install",
    });

    const executor = new TaskExecutor(store, "/tmp/test");
    await executor.execute(makeTask());

    // execSync is called for worktree creation + init command
    const initCall = mockedExecSync.mock.calls.find(
      (call) => call[0] === "pnpm install",
    );
    expect(initCall).toBeDefined();
    expect(initCall![1]).toMatchObject({
      cwd: expect.stringContaining("HAI-010"),
      timeout: 120_000,
    });

    // Should log success
    expect(store.logEntry).toHaveBeenCalledWith(
      "HAI-010",
      "Worktree init command completed",
      "pnpm install",
    );
  });

  it("does NOT run init command when worktreeInitCommand is not set", async () => {
    const store = createMockStore();
    // getSettings returns default (no worktreeInitCommand)

    const executor = new TaskExecutor(store, "/tmp/test");
    await executor.execute(makeTask());

    // Only worktree creation calls to execSync, no "pnpm install" etc.
    const initCall = mockedExecSync.mock.calls.find(
      (call) => typeof call[0] === "string" && !call[0].startsWith("git"),
    );
    expect(initCall).toBeUndefined();
  });

  it("catches init command failure and logs without aborting", async () => {
    const store = createMockStore();
    store.getSettings.mockResolvedValue({
      maxConcurrent: 2,
      maxWorktrees: 4,
      pollIntervalMs: 15000,
      groupOverlappingFiles: false,
      autoMerge: false,
      worktreeInitCommand: "npm run setup",
    });

    // Make the init command fail (but not git worktree commands)
    mockedExecSync.mockImplementation((cmd: any) => {
      if (cmd === "npm run setup") {
        const err: any = new Error("command failed");
        err.stderr = Buffer.from("setup script error");
        throw err;
      }
      return Buffer.from("");
    });

    const onError = vi.fn();
    const executor = new TaskExecutor(store, "/tmp/test", { onError });
    await executor.execute(makeTask());

    // Should log the failure
    expect(store.logEntry).toHaveBeenCalledWith(
      "HAI-010",
      expect.stringContaining("Worktree init command failed"),
    );

    // Should NOT have called onError (task continues)
    expect(onError).not.toHaveBeenCalled();

    // Agent should still have been created
    expect(mockedCreateHaiAgent).toHaveBeenCalled();
  });

  it("does NOT run init command on worktree resume", async () => {
    const store = createMockStore();
    store.getSettings.mockResolvedValue({
      maxConcurrent: 2,
      maxWorktrees: 4,
      pollIntervalMs: 15000,
      groupOverlappingFiles: false,
      autoMerge: false,
      worktreeInitCommand: "pnpm install",
    });

    // Worktree already exists (resume)
    mockedExistsSync.mockReturnValue(true);

    const executor = new TaskExecutor(store, "/tmp/test");
    await executor.execute(makeTask());

    // getSettings should NOT have been called (skipped entire !isResume block)
    expect(store.getSettings).not.toHaveBeenCalled();
  });
});

const mockedFindWorktreeUser = vi.mocked(findWorktreeUser);

describe("TaskExecutor worktree reuse", () => {
  const makeTask = (overrides: Partial<Task> = {}): Task => ({
    id: "HAI-020",
    title: "Dependent task",
    description: "Test",
    column: "in-progress",
    dependencies: [],
    steps: [],
    currentStep: 0,
    log: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockedExistsSync.mockReturnValue(false);
    mockedFindWorktreeUser.mockResolvedValue(null);
    mockedCreateHaiAgent.mockResolvedValue({
      session: {
        prompt: vi.fn().mockResolvedValue(undefined),
        dispose: vi.fn(),
      },
    } as any);
  });

  it("reuses dependency worktree when dep has existing worktree on disk", async () => {
    const store = createMockStore();
    const depWorktreePath = "/tmp/test/.worktrees/HAI-019";

    // Dep task is in-review with an existing worktree
    store.listTasks.mockResolvedValue([
      makeTask({
        id: "HAI-019",
        column: "in-review",
        worktree: depWorktreePath,
        dependencies: [],
      }),
      makeTask({
        id: "HAI-020",
        column: "in-progress",
        dependencies: ["HAI-019"],
      }),
    ]);

    // existsSync: dep worktree exists on disk
    mockedExistsSync.mockImplementation((p: any) => {
      return p === depWorktreePath;
    });

    const executor = new TaskExecutor(store, "/tmp/test");
    await executor.execute(makeTask({ id: "HAI-020", dependencies: ["HAI-019"] }));

    // Should call `git checkout -b` (reuse), NOT `git worktree add`
    const checkoutCall = mockedExecSync.mock.calls.find(
      (call) => typeof call[0] === "string" && call[0].includes("git checkout -b"),
    );
    expect(checkoutCall).toBeDefined();
    expect(checkoutCall![0]).toContain("hai/hai-020");

    const worktreeAddCall = mockedExecSync.mock.calls.find(
      (call) => typeof call[0] === "string" && call[0].includes("git worktree add"),
    );
    expect(worktreeAddCall).toBeUndefined();

    // Task's worktree should be set to the reused path
    expect(store.updateTask).toHaveBeenCalledWith("HAI-020", { worktree: depWorktreePath });
  });

  it("creates fresh worktree when dependency worktree does NOT exist on disk", async () => {
    const store = createMockStore();

    // Dep is done but worktree was removed (cleared on done)
    store.listTasks.mockResolvedValue([
      makeTask({ id: "HAI-019", column: "done", dependencies: [] }),
      makeTask({ id: "HAI-020", column: "in-progress", dependencies: ["HAI-019"] }),
    ]);

    mockedExistsSync.mockReturnValue(false);

    const executor = new TaskExecutor(store, "/tmp/test");
    await executor.execute(makeTask({ id: "HAI-020", dependencies: ["HAI-019"] }));

    // Should call `git worktree add`, NOT `git checkout -b`
    const worktreeAddCall = mockedExecSync.mock.calls.find(
      (call) => typeof call[0] === "string" && call[0].includes("git worktree add"),
    );
    expect(worktreeAddCall).toBeDefined();

    const checkoutCall = mockedExecSync.mock.calls.find(
      (call) => typeof call[0] === "string" && call[0].includes("git checkout -b"),
    );
    expect(checkoutCall).toBeUndefined();
  });

  it("creates fresh worktree when task has NO dependencies", async () => {
    const store = createMockStore();
    store.listTasks.mockResolvedValue([]);
    mockedExistsSync.mockReturnValue(false);

    const executor = new TaskExecutor(store, "/tmp/test");
    await executor.execute(makeTask({ id: "HAI-020", dependencies: [] }));

    const worktreeAddCall = mockedExecSync.mock.calls.find(
      (call) => typeof call[0] === "string" && call[0].includes("git worktree add"),
    );
    expect(worktreeAddCall).toBeDefined();
  });

  it("does NOT run worktreeInitCommand when reusing a worktree", async () => {
    const store = createMockStore();
    const depWorktreePath = "/tmp/test/.worktrees/HAI-019";

    store.listTasks.mockResolvedValue([
      makeTask({
        id: "HAI-019",
        column: "in-review",
        worktree: depWorktreePath,
        dependencies: [],
      }),
    ]);

    store.getSettings.mockResolvedValue({
      maxConcurrent: 2,
      maxWorktrees: 4,
      pollIntervalMs: 15000,
      groupOverlappingFiles: false,
      autoMerge: false,
      worktreeInitCommand: "pnpm install",
    });

    mockedExistsSync.mockImplementation((p: any) => p === depWorktreePath);

    const executor = new TaskExecutor(store, "/tmp/test");
    await executor.execute(makeTask({ id: "HAI-020", dependencies: ["HAI-019"] }));

    // Init command should NOT have been run
    const initCall = mockedExecSync.mock.calls.find(
      (call) => call[0] === "pnpm install",
    );
    expect(initCall).toBeUndefined();
  });

  it("resolveDependencyWorktree picks first dependency with existing worktree", async () => {
    const store = createMockStore();
    const depAPath = "/tmp/test/.worktrees/HAI-018";
    const depBPath = "/tmp/test/.worktrees/HAI-019";

    // Two deps: A has no worktree on disk, B does
    store.listTasks.mockResolvedValue([
      makeTask({ id: "HAI-018", column: "in-review" as Column, worktree: depAPath, dependencies: [] }),
      makeTask({ id: "HAI-019", column: "in-review" as Column, worktree: depBPath, dependencies: [] }),
    ]);

    mockedExistsSync.mockImplementation((p: any) => p === depBPath);

    const executor = new TaskExecutor(store, "/tmp/test");
    await executor.execute(makeTask({ id: "HAI-020", dependencies: ["HAI-018", "HAI-019"] }));

    // Should reuse HAI-019's worktree (the one that exists)
    expect(store.updateTask).toHaveBeenCalledWith("HAI-020", { worktree: depBPath });

    const checkoutCall = mockedExecSync.mock.calls.find(
      (call) => typeof call[0] === "string" && call[0].includes("git checkout -b"),
    );
    expect(checkoutCall).toBeDefined();
    expect(checkoutCall![1]).toMatchObject({ cwd: depBPath });
  });
});

describe("TaskExecutor cleanup — chain-aware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedExistsSync.mockReturnValue(false);
    mockedFindWorktreeUser.mockResolvedValue(null);
    mockedCreateHaiAgent.mockResolvedValue({
      session: {
        prompt: vi.fn().mockResolvedValue(undefined),
        dispose: vi.fn(),
      },
    } as any);
  });

  it("does NOT remove worktree if another task still uses it", async () => {
    const store = createMockStore();
    mockedFindWorktreeUser.mockResolvedValue("HAI-021");

    const executor = new TaskExecutor(store, "/tmp/test");

    // Execute a task to register a worktree
    mockedExistsSync.mockReturnValue(false);
    await executor.execute({
      id: "HAI-020",
      title: "Test",
      description: "Test",
      column: "in-progress" as const,
      dependencies: [],
      steps: [],
      currentStep: 0,
      log: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Now cleanup — should skip removal because findWorktreeUser returns "HAI-021"
    await executor.cleanup("HAI-020");

    const removeCall = mockedExecSync.mock.calls.find(
      (call) => typeof call[0] === "string" && call[0].includes("git worktree remove"),
    );
    expect(removeCall).toBeUndefined();
  });

  it("removes worktree when no other task uses it", async () => {
    const store = createMockStore();
    mockedFindWorktreeUser.mockResolvedValue(null);

    const executor = new TaskExecutor(store, "/tmp/test");

    mockedExistsSync.mockReturnValue(false);
    await executor.execute({
      id: "HAI-020",
      title: "Test",
      description: "Test",
      column: "in-progress" as const,
      dependencies: [],
      steps: [],
      currentStep: 0,
      log: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await executor.cleanup("HAI-020");

    const removeCall = mockedExecSync.mock.calls.find(
      (call) => typeof call[0] === "string" && call[0].includes("git worktree remove"),
    );
    expect(removeCall).toBeDefined();
  });
});
