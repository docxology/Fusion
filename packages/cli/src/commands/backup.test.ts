import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockListBackups = vi.fn();
const mockRestoreBackup = vi.fn();
const mockCleanupOldBackups = vi.fn();
const mockGetSettings = vi.fn();
const mockRunBackupCommand = vi.fn();
const mockResolveProject = vi.fn();

vi.mock("@fusion/core", () => ({
  BackupManager: vi.fn(),
  TaskStore: vi.fn().mockImplementation(() => ({
    init: vi.fn().mockResolvedValue(undefined),
    getSettings: mockGetSettings,
    kbDir: "/cwd/.kb",
  })),
  createBackupManager: vi.fn(() => ({
    listBackups: mockListBackups,
    restoreBackup: mockRestoreBackup,
    cleanupOldBackups: mockCleanupOldBackups,
  })),
  runBackupCommand: mockRunBackupCommand,
}));

vi.mock("../project-context.js", () => ({
  resolveProject: mockResolveProject,
}));

import { TaskStore } from "@fusion/core";
import { runBackupCreate, runBackupList, runBackupRestore, runBackupCleanup } from "./backup.js";

describe("backup commands", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    exitSpy = vi.spyOn(process, "exit").mockImplementation((code?: string | number | null) => {
      throw new Error(`process.exit:${code ?? 0}`);
    });
    mockGetSettings.mockResolvedValue({ autoBackupDir: ".kb/backups" });
    mockRunBackupCommand.mockResolvedValue({ success: true, output: "backup created" });
    mockListBackups.mockResolvedValue([]);
    mockRestoreBackup.mockResolvedValue(undefined);
    mockCleanupOldBackups.mockResolvedValue(0);
    mockResolveProject.mockResolvedValue({
      projectId: "proj-1",
      projectName: "demo-project",
      projectPath: "/projects/demo",
      isRegistered: true,
      store: { getSettings: mockGetSettings, kbDir: "/projects/demo/.kb" },
    });
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("runBackupCreate uses resolved project store with --project", async () => {
    await expect(runBackupCreate("demo-project")).rejects.toThrow("process.exit:0");
    expect(mockResolveProject).toHaveBeenCalledWith("demo-project");
    expect(mockRunBackupCommand).toHaveBeenCalledWith("/projects/demo/.kb", expect.anything());
  });

  it("runBackupList uses resolved project store with --project", async () => {
    mockListBackups.mockResolvedValue([{ filename: "kb.db.bak", size: 1024, createdAt: new Date().toISOString() }]);
    await runBackupList("demo-project");
    expect(mockResolveProject).toHaveBeenCalledWith("demo-project");
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Found 1 backup"));
  });

  it("runBackupRestore uses resolved project store with --project", async () => {
    await runBackupRestore("kb.db.bak", "demo-project");
    expect(mockResolveProject).toHaveBeenCalledWith("demo-project");
    expect(mockRestoreBackup).toHaveBeenCalledWith("kb.db.bak", { createPreRestoreBackup: true });
  });

  it("runBackupCleanup uses resolved project store with --project", async () => {
    mockCleanupOldBackups.mockResolvedValue(2);
    await runBackupCleanup("demo-project");
    expect(mockResolveProject).toHaveBeenCalledWith("demo-project");
    expect(logSpy).toHaveBeenCalledWith("Removed 2 old backup(s).");
  });

  it("runBackupList without project uses shared resolution flow", async () => {
    await runBackupList();
    expect(mockResolveProject).toHaveBeenCalledWith(undefined);
    expect(TaskStore).not.toHaveBeenCalled();
  });

  it("runBackupList without project falls back to current cwd task store when resolution fails", async () => {
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue("/local/project");
    mockResolveProject.mockRejectedValueOnce(new Error("No kb project found"));
    await runBackupList();
    expect(mockResolveProject).toHaveBeenCalledWith(undefined);
    expect(TaskStore).toHaveBeenCalledWith("/local/project");
    cwdSpy.mockRestore();
  });

  it("propagates project resolution errors for project-targeted backup commands", async () => {
    mockResolveProject.mockRejectedValue(new Error("Project 'missing' not found. Run 'kb project list' to see registered projects."));

    await expect(runBackupList("missing")).rejects.toThrow("Project 'missing' not found");
  });
});
