/**
 * Tests for project.ts commands
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockListProjects = vi.fn();
const mockRegisterProject = vi.fn();
const mockUnregisterProject = vi.fn();
const mockGetProject = vi.fn();
const mockGetProjectByPath = vi.fn();
const mockInit = vi.fn();
const mockClose = vi.fn();
const mockQuestion = vi.fn();
const mockRlClose = vi.fn();
const mockSetDefaultProject = vi.fn();
const mockDetectProjectFromCwd = vi.fn();
const mockFormatProjectLine = vi.fn();
const mockGetSettings = vi.fn();
const mockGlobalInit = vi.fn();

vi.mock("@fusion/core", () => ({
  CentralCore: vi.fn().mockImplementation(() => ({
    init: mockInit.mockResolvedValue(undefined),
    close: mockClose.mockResolvedValue(undefined),
    listProjects: mockListProjects,
    registerProject: mockRegisterProject,
    unregisterProject: mockUnregisterProject,
    getProject: mockGetProject,
    getProjectByPath: mockGetProjectByPath,
  })),
  GlobalSettingsStore: vi.fn().mockImplementation(() => ({
    init: mockGlobalInit.mockResolvedValue(undefined),
    getSettings: mockGetSettings,
  })),
}));

vi.mock("node:readline/promises", () => ({
  createInterface: vi.fn(() => ({
    question: mockQuestion,
    close: mockRlClose,
  })),
}));

vi.mock("../project-context.js", () => ({
  formatProjectLine: mockFormatProjectLine,
  detectProjectFromCwd: mockDetectProjectFromCwd,
  setDefaultProject: mockSetDefaultProject,
}));

describe("project commands", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    exitSpy = vi.spyOn(process, "exit").mockImplementation((code?: string | number | null) => {
      throw new Error(`process.exit:${code ?? 0}`);
    });
    mockGetSettings.mockResolvedValue({});
    mockFormatProjectLine.mockImplementation((project, isDefault) => `${isDefault ? "* " : "  "}${project.name}`);
    mockQuestion.mockResolvedValue("y");
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("exports all project command functions", async () => {
    const project = await import("./project.js");
    expect(typeof project.runProjectList).toBe("function");
    expect(typeof project.runProjectAdd).toBe("function");
    expect(typeof project.runProjectRemove).toBe("function");
    expect(typeof project.runProjectShow).toBe("function");
    expect(typeof project.runProjectSetDefault).toBe("function");
    expect(typeof project.runProjectDetect).toBe("function");
  });

  it("runProjectList prints registered projects and summary", async () => {
    mockListProjects.mockResolvedValue([
      { id: "proj-1", name: "app-one", path: "/tmp/app-one", status: "active", isolationMode: "in-process" },
      { id: "proj-2", name: "app-two", path: "/tmp/app-two", status: "paused", isolationMode: "child-process" },
    ]);
    mockGetSettings.mockResolvedValue({ defaultProjectId: "proj-1" });
    mockGetProject.mockImplementation(async (id: string) => (
      id === "proj-1"
        ? { id: "proj-1", name: "app-one", path: "/tmp/app-one", status: "active", isolationMode: "in-process" }
        : undefined
    ));

    const { runProjectList } = await import("./project.js");
    await runProjectList();

    expect(mockFormatProjectLine).toHaveBeenCalledTimes(2);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("2 projects registered, 1 active"));
  });

  it("runProjectAdd registers project and prints sanitized path output", async () => {
    mockListProjects.mockResolvedValue([]);
    mockRegisterProject.mockResolvedValue({ id: "proj-1", name: "demo", path: "/tmp/demo", isolationMode: "in-process" });

    const { runProjectAdd } = await import("./project.js");
    await runProjectAdd("demo", ".", { force: true });

    expect(mockRegisterProject).toHaveBeenCalled();
    const lines = consoleSpy.mock.calls.map((call) => String(call[0]));
    expect(lines.some((line) => line.includes("Registered project 'demo'"))).toBe(true);
    expect(lines.some((line) => line.includes("Location:"))).toBe(true);
    expect(lines.some((line) => line.includes("/tmp/demo"))).toBe(false);
  });

  it("runProjectRemove unregisters project after confirmation", async () => {
    mockGetProject.mockResolvedValue({ id: "proj-1", name: "demo", path: "/tmp/demo", status: "active", isolationMode: "in-process" });

    const { runProjectRemove } = await import("./project.js");
    await runProjectRemove("proj-1", false);

    expect(mockUnregisterProject).toHaveBeenCalledWith("proj-1");
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Unregistered project 'demo'"));
  });

  it("runProjectShow prints detailed project metadata without absolute path leakage", async () => {
    mockGetProject.mockResolvedValue({
      id: "proj-1",
      name: "demo",
      path: "/tmp/demo",
      status: "active",
      isolationMode: "child-process",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
    mockGetSettings.mockResolvedValue({ defaultProjectId: "proj-1" });

    const { runProjectShow } = await import("./project.js");
    await runProjectShow("proj-1");

    const output = consoleSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain("Project: demo (default)");
    expect(output).toContain("Isolation: child-process");
    expect(output).toContain("Created:");
    expect(output).not.toContain("/tmp/demo");
  });

  it("runProjectSetDefault sets default project", async () => {
    mockGetProject.mockResolvedValue({ id: "proj-1", name: "demo", path: "/tmp/demo", status: "active", isolationMode: "in-process" });

    const { runProjectSetDefault } = await import("./project.js");
    await runProjectSetDefault("proj-1");

    expect(mockSetDefaultProject).toHaveBeenCalledWith("proj-1");
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Set 'demo' as default project"));
  });

  it("runProjectDetect prints detected project without absolute path leakage", async () => {
    mockDetectProjectFromCwd.mockResolvedValue({ id: "proj-1", name: "demo", path: "/tmp/demo" });

    const { runProjectDetect } = await import("./project.js");
    await runProjectDetect();

    const output = consoleSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain("Detected: demo");
    expect(output).toContain("Location:");
    expect(output).not.toContain("/tmp/demo");
  });

  it("validation exits on missing required args", async () => {
    const { runProjectAdd, runProjectRemove, runProjectShow, runProjectSetDefault } = await import("./project.js");

    await expect(runProjectAdd("", "/tmp")).rejects.toThrow("process.exit:1");
    await expect(runProjectRemove("")).rejects.toThrow("process.exit:1");
    await expect(runProjectShow("")).rejects.toThrow("process.exit:1");
    await expect(runProjectSetDefault("")).rejects.toThrow("process.exit:1");
  });
});
