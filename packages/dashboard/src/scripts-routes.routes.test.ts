// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import type { TaskStore } from "@fusion/core";
import { createApiRoutes } from "./routes.js";
import { request as performRequest, get as performGet } from "./test-request.js";

function createMockGlobalSettingsStore() {
  return {
    getSettings: vi.fn().mockResolvedValue({}),
    updateSettings: vi.fn().mockResolvedValue({}),
    getSettingsPath: vi.fn().mockReturnValue("/fake/home/.pi/kb/settings.json"),
    init: vi.fn().mockResolvedValue(false),
  };
}

function createMockMissionStore() {
  return {
    createSession: vi.fn().mockResolvedValue({ id: "session-1", status: "active" }),
    getSession: vi.fn().mockResolvedValue({ id: "session-1", status: "active", answers: [] }),
    updateSession: vi.fn().mockResolvedValue(undefined),
    addAnswer: vi.fn().mockResolvedValue(undefined),
    deleteSession: vi.fn().mockResolvedValue(undefined),
    listSessions: vi.fn().mockResolvedValue([]),
    generatePlan: vi.fn().mockResolvedValue({ plan: "Test plan", steps: [] }),
  };
}

function createMockStore(overrides: Partial<TaskStore> = {}): TaskStore {
  return {
    getTask: vi.fn(),
    listTasks: vi.fn().mockResolvedValue([]),
    createTask: vi.fn(),
    moveTask: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
    mergeTask: vi.fn(),
    archiveTask: vi.fn(),
    unarchiveTask: vi.fn(),
    getSettings: vi.fn().mockResolvedValue({}),
    updateSettings: vi.fn(),
    updateGlobalSettings: vi.fn(),
    getSettingsByScope: vi.fn().mockResolvedValue({ global: {}, project: {} }),
    getGlobalSettingsStore: vi.fn().mockReturnValue(createMockGlobalSettingsStore()),
    logEntry: vi.fn().mockResolvedValue(undefined),
    getAgentLogs: vi.fn().mockResolvedValue([]),
    addComment: vi.fn(),
    addTaskComment: vi.fn(),
    updateTaskComment: vi.fn(),
    deleteTaskComment: vi.fn(),
    updatePrInfo: vi.fn().mockResolvedValue(undefined),
    updateIssueInfo: vi.fn().mockResolvedValue(undefined),
    getRootDir: vi.fn().mockReturnValue("/fake/root"),
    listWorkflowSteps: vi.fn().mockResolvedValue([]),
    createWorkflowStep: vi.fn(),
    getWorkflowStep: vi.fn(),
    updateWorkflowStep: vi.fn(),
    deleteWorkflowStep: vi.fn(),
    getMissionStore: vi.fn().mockReturnValue(createMockMissionStore()),
    ...overrides,
  } as unknown as TaskStore;
}

async function GET(app: express.Express, path: string): Promise<{ status: number; body: any }> {
  const res = await performGet(app, path);
  return { status: res.status, body: res.body };
}

async function REQUEST(
  app: express.Express,
  method: string,
  path: string,
  body?: Buffer | string,
  headers?: Record<string, string>,
): Promise<{ status: number; body: any }> {
  const res = await performRequest(app, method, path, body, headers);
  return { status: res.status, body: res.body };
}

describe("Scripts routes", () => {
  let store: TaskStore;

  beforeEach(() => {
    store = createMockStore();
  });

  function buildApp() {
    const app = express();
    app.use(express.json());
    app.use("/api", createApiRoutes(store));
    return app;
  }

  it("returns all scripts from project settings", async () => {
    (store.getSettings as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      scripts: { build: "pnpm build", test: "pnpm test" },
    });

    const res = await GET(buildApp(), "/api/scripts");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ build: "pnpm build", test: "pnpm test" });
  });

  it("creates a new script and returns 201", async () => {
    (store.getSettings as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ scripts: { test: "pnpm test" } });
    (store.updateSettings as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

    const res = await REQUEST(
      buildApp(),
      "POST",
      "/api/scripts",
      JSON.stringify({ name: "build", command: "pnpm build" }),
      { "Content-Type": "application/json" },
    );

    expect(res.status).toBe(201);
    expect(store.updateSettings).toHaveBeenCalledWith({
      scripts: { test: "pnpm test", build: "pnpm build" },
    });
  });

  it("returns 409 when creating a duplicate script", async () => {
    (store.getSettings as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ scripts: { build: "pnpm build" } });

    const res = await REQUEST(
      buildApp(),
      "POST",
      "/api/scripts",
      JSON.stringify({ name: "build", command: "pnpm build --filter app" }),
      { "Content-Type": "application/json" },
    );

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("already exists");
    expect(store.updateSettings).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid script names", async () => {
    const res = await REQUEST(
      buildApp(),
      "POST",
      "/api/scripts",
      JSON.stringify({ name: "bad name", command: "echo hi" }),
      { "Content-Type": "application/json" },
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("alphanumeric");
  });

  it("returns 400 for reserved script names", async () => {
    const res = await REQUEST(
      buildApp(),
      "POST",
      "/api/scripts",
      JSON.stringify({ name: "run", command: "echo hi" }),
      { "Content-Type": "application/json" },
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("reserved");
  });

  it("returns 400 when command is missing", async () => {
    const res = await REQUEST(
      buildApp(),
      "POST",
      "/api/scripts",
      JSON.stringify({ name: "build", command: "   " }),
      { "Content-Type": "application/json" },
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("command is required");
  });


  it("deletes an existing script and persists remaining scripts", async () => {
    (store.getSettings as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      scripts: { build: "pnpm build", test: "pnpm test" },
    });
    (store.updateSettings as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

    const res = await REQUEST(buildApp(), "DELETE", "/api/scripts/build");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ test: "pnpm test" });
    expect(store.updateSettings).toHaveBeenCalledWith({ scripts: { test: "pnpm test" } });
  });

  it("returns 400 when deleting an invalid script name", async () => {
    const res = await REQUEST(buildApp(), "DELETE", "/api/scripts/bad%20name");

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("alphanumeric");
  });

  it("returns 404 when deleting a missing script", async () => {
    (store.getSettings as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ scripts: { test: "pnpm test" } });

    const res = await REQUEST(buildApp(), "DELETE", "/api/scripts/build");

    expect(res.status).toBe(404);
    expect(res.body.error).toContain("not found");
  });

  it("returns 400 when running an invalid script name", async () => {
    const res = await REQUEST(
      buildApp(),
      "POST",
      "/api/scripts/bad%20name/run",
      JSON.stringify({ args: [] }),
      { "Content-Type": "application/json" },
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("alphanumeric");
  });

  it("returns 404 when running a missing script", async () => {
    (store.getSettings as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ scripts: { test: "pnpm test" } });

    const res = await REQUEST(
      buildApp(),
      "POST",
      "/api/scripts/build/run",
      JSON.stringify({ args: [] }),
      { "Content-Type": "application/json" },
    );

    expect(res.status).toBe(404);
    expect(res.body.error).toContain("not found");
  });

  it("returns 400 when run args are not an array", async () => {
    (store.getSettings as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ scripts: { test: "pnpm test" } });

    const res = await REQUEST(
      buildApp(),
      "POST",
      "/api/scripts/test/run",
      JSON.stringify({ args: "--ok" }),
      { "Content-Type": "application/json" },
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("array of strings");
  });

  it("returns 400 when run args are not an array of strings", async () => {
    (store.getSettings as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ scripts: { test: "pnpm test" } });

    const res = await REQUEST(
      buildApp(),
      "POST",
      "/api/scripts/test/run",
      JSON.stringify({ args: ["--ok", 123] }),
      { "Content-Type": "application/json" },
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("array of strings");
  });

  it("returns terminal service errors when session creation fails", async () => {
    const createSessionSpy = vi
      .spyOn(await import("./terminal-service.js"), "getTerminalService")
      .mockReturnValue({
        createSession: vi.fn().mockResolvedValue({
          success: false,
          code: "max_sessions",
          error: "Maximum terminal sessions reached",
        }),
      } as any);

    (store.getSettings as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ scripts: { test: "pnpm test" } });

    const res = await REQUEST(
      buildApp(),
      "POST",
      "/api/scripts/test/run",
      JSON.stringify({ args: [] }),
      { "Content-Type": "application/json" },
    );

    expect(res.status).toBe(503);
    expect(res.body.error).toContain("Maximum terminal sessions reached");
    createSessionSpy.mockRestore();
  });

  it("creates a terminal session in the project root when running a script", async () => {
    const writeInput = vi.fn();
    const createSession = vi.fn().mockResolvedValue({
      success: true,
      session: { id: "pty-123", cwd: "/fake/root", shell: "/bin/zsh" },
    });
    const terminalServiceSpy = vi
      .spyOn(await import("./terminal-service.js"), "getTerminalService")
      .mockReturnValue({ createSession, writeInput } as any);

    (store.getSettings as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ scripts: { test: "pnpm test" } });

    const res = await REQUEST(
      buildApp(),
      "POST",
      "/api/scripts/test/run",
      JSON.stringify({ args: ["--filter", "web app; rm -rf /"] }),
      { "Content-Type": "application/json" },
    );

    expect(res.status).toBe(201);
    expect(res.body.sessionId).toBe("pty-123");
    expect(res.body.command).toBe('pnpm test "--filter" "web app; rm -rf /"');
    expect(createSession).toHaveBeenCalledWith({ cwd: "/fake/root" });
    expect(writeInput).toHaveBeenCalledWith("pty-123", 'pnpm test "--filter" "web app; rm -rf /"\n');
    terminalServiceSpy.mockRestore();
  });
});
