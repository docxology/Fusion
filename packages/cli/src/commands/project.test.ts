import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runProjectList, runProjectAdd, runProjectRemove, runProjectInfo } from "./project.js";

// Mock dependencies
vi.mock("@fusion/core", async () => {
  const actual = await vi.importActual<typeof import("@fusion/core")>("@fusion/core");
  return {
    ...actual,
    CentralCore: vi.fn(),
    GlobalSettingsStore: vi.fn(),
    TaskStore: vi.fn().mockImplementation(() => ({
      init: vi.fn().mockResolvedValue(undefined),
      listTasks: vi.fn().mockResolvedValue([]),
    })),
  };
});

vi.mock("@fusion/engine", () => ({
  ProjectManager: vi.fn().mockImplementation(() => ({
    getRuntime: vi.fn().mockReturnValue(undefined),
    removeProject: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("../project-resolver.js", () => ({
  getCentralCore: vi.fn(),
  getProjectManager: vi.fn(),
  findKbDir: vi.fn().mockReturnValue(null),
  isKbProject: vi.fn().mockReturnValue(true),
  suggestProjectName: vi.fn().mockReturnValue("test-project"),
  formatLastActivity: vi.fn().mockReturnValue("just now"),
}));

describe("Project Commands", () => {
  describe("exports", () => {
    it("exports runProjectList as a function", () => {
      expect(typeof runProjectList).toBe("function");
    });

    it("exports runProjectAdd as a function", () => {
      expect(typeof runProjectAdd).toBe("function");
    });

    it("exports runProjectRemove as a function", () => {
      expect(typeof runProjectRemove).toBe("function");
    });

    it("exports runProjectInfo as a function", () => {
      expect(typeof runProjectInfo).toBe("function");
    });
  });

  describe("runProjectList", () => {
    it("should handle empty project list", async () => {
      const { getCentralCore } = await import("../project-resolver.js");
      vi.mocked(getCentralCore).mockResolvedValue({
        listProjects: vi.fn().mockResolvedValue([]),
        getProjectHealth: vi.fn().mockResolvedValue(undefined),
      } as unknown as import("@fusion/core").CentralCore);

      const { getProjectManager } = await import("../project-resolver.js");
      vi.mocked(getProjectManager).mockResolvedValue({
        getRuntime: vi.fn().mockReturnValue(undefined),
      } as unknown as import("@fusion/engine").ProjectManager);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      
      await runProjectList();
      
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("No projects registered"));
      consoleSpy.mockRestore();
    });

    it("should output JSON when --json flag is set", async () => {
      const mockProject = {
        id: "proj_123",
        name: "test-project",
        path: "/path/to/project",
        status: "active",
        isolationMode: "in-process",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      };

      const { getCentralCore } = await import("../project-resolver.js");
      vi.mocked(getCentralCore).mockResolvedValue({
        listProjects: vi.fn().mockResolvedValue([mockProject]),
        getProjectHealth: vi.fn().mockResolvedValue({
          lastActivityAt: "2024-01-01T00:00:00.000Z",
          inFlightAgentCount: 0,
        }),
      } as unknown as import("@fusion/core").CentralCore);

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      
      await runProjectList({ json: true });
      
      // Check that JSON was output
      const jsonCall = consoleSpy.mock.calls.find(call => {
        try {
          JSON.parse(call[0] as string);
          return true;
        } catch {
          return false;
        }
      });
      expect(jsonCall).toBeDefined();
      
      const output = JSON.parse(jsonCall![0] as string);
      expect(output).toBeInstanceOf(Array);
      expect(output[0]).toHaveProperty("id", "proj_123");
      expect(output[0]).toHaveProperty("name", "test-project");
      
      consoleSpy.mockRestore();
    });
  });

  describe("runProjectAdd", () => {
    it("should exit if no directory provided in non-interactive mode", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as (code?: number) => never);
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await runProjectAdd(undefined, { interactive: false });

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Usage:"));
      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it("should validate isolation mode", async () => {
      const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as (code?: number) => never);
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await runProjectAdd("/tmp", { isolation: "invalid-mode" as any, interactive: false });

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Invalid isolation mode"));
      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
      errorSpy.mockRestore();
    });
  });

  describe("runProjectRemove", () => {
    it("should exit if project not found", async () => {
      const { getCentralCore } = await import("../project-resolver.js");
      vi.mocked(getCentralCore).mockResolvedValue({
        listProjects: vi.fn().mockResolvedValue([]),
        getProject: vi.fn().mockResolvedValue(undefined),
        getProjectByPath: vi.fn().mockResolvedValue(undefined),
        unregisterProject: vi.fn(),
      } as unknown as import("@fusion/core").CentralCore);

      const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as (code?: number) => never);
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await runProjectRemove("nonexistent", { force: true, interactive: false });

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("not found"));
      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it("should skip confirmation with --force flag", async () => {
      const mockProject = {
        id: "proj_123",
        name: "test-project",
        path: "/path/to/project",
      };

      const { getCentralCore } = await import("../project-resolver.js");
      vi.mocked(getCentralCore).mockResolvedValue({
        listProjects: vi.fn().mockResolvedValue([mockProject]),
        getProject: vi.fn().mockResolvedValue(mockProject),
        getProjectByPath: vi.fn().mockResolvedValue(mockProject),
        unregisterProject: vi.fn().mockResolvedValue(undefined),
      } as unknown as import("@fusion/core").CentralCore);

      const { getProjectManager } = await import("../project-resolver.js");
      vi.mocked(getProjectManager).mockResolvedValue({
        getRuntime: vi.fn().mockReturnValue(undefined),
        removeProject: vi.fn().mockResolvedValue(undefined),
      } as unknown as import("@fusion/engine").ProjectManager);

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await runProjectRemove("test-project", { force: true, interactive: false });

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Unregistered"));
      
      logSpy.mockRestore();
    });
  });

  describe("runProjectInfo", () => {
    it("should auto-detect project from cwd when no name provided", async () => {
      const mockProject = {
        id: "proj_123",
        name: "detected-project",
        path: "/current/dir",
        status: "active",
        isolationMode: "in-process",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      };

      const { getCentralCore, findKbDir } = await import("../project-resolver.js");
      vi.mocked(findKbDir).mockReturnValue("/current/dir");
      vi.mocked(getCentralCore).mockResolvedValue({
        listProjects: vi.fn().mockResolvedValue([mockProject]),
        getProject: vi.fn().mockResolvedValue(mockProject),
        getProjectByPath: vi.fn().mockResolvedValue(mockProject),
        getProjectHealth: vi.fn().mockResolvedValue({
          activeTaskCount: 5,
          inFlightAgentCount: 2,
          totalTasksCompleted: 100,
          totalTasksFailed: 5,
          lastActivityAt: "2024-01-01T00:00:00.000Z",
        }),
      } as unknown as import("@fusion/core").CentralCore);

      const { getProjectManager } = await import("../project-resolver.js");
      vi.mocked(getProjectManager).mockResolvedValue({
        getRuntime: vi.fn().mockReturnValue({ getStatus: () => "active" }),
        removeProject: vi.fn(),
      } as unknown as import("@fusion/engine").ProjectManager);

      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await runProjectInfo(undefined, { interactive: false });

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("detected-project"));
      
      logSpy.mockRestore();
    });

    it("should exit if project not found by name", async () => {
      const { getCentralCore } = await import("../project-resolver.js");
      vi.mocked(getCentralCore).mockResolvedValue({
        listProjects: vi.fn().mockResolvedValue([]),
        getProject: vi.fn().mockResolvedValue(undefined),
      } as unknown as import("@fusion/core").CentralCore);

      const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as (code?: number) => never);
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await runProjectInfo("nonexistent", { interactive: false });

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("not found"));
      expect(exitSpy).toHaveBeenCalledWith(1);

      exitSpy.mockRestore();
      errorSpy.mockRestore();
    });
  });
});

// Helper function for creating mock CentralCore
describe("Project command helpers", () => {
  it("should export all required functions", () => {
    expect(runProjectList).toBeDefined();
    expect(runProjectAdd).toBeDefined();
    expect(runProjectRemove).toBeDefined();
    expect(runProjectInfo).toBeDefined();
  });
});
