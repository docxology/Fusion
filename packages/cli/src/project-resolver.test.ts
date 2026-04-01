import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getCentralCore,
  getProjectManager,
  findKbDir,
  resolveProject,
  ProjectResolutionError,
  isKbProject,
  suggestProjectName,
  resolveAbsolutePath,
  formatLastActivity,
  resetProjectResolution,
} from "./project-resolver.js";
import { existsSync, statSync } from "node:fs";
import { resolve, dirname, normalize } from "node:path";

// Mock fs and path modules
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  statSync: vi.fn(),
}));

vi.mock("node:path", async () => {
  const actual = await vi.importActual<typeof import("node:path")>("node:path");
  return {
    ...actual,
    resolve: vi.fn((...args: string[]) => args.join("/").replace(/\/+/g, "/")),
    normalize: vi.fn((p: string) => p),
    dirname: vi.fn((p: string) => p.split("/").slice(0, -1).join("/") || "/"),
  };
});

// Mock @fusion/core
vi.mock("@fusion/core", () => {
  const mockInit = vi.fn().mockResolvedValue(undefined);
  const mockClose = vi.fn().mockResolvedValue(undefined);
  const mockListProjects = vi.fn();
  const mockGetProject = vi.fn();
  const mockGetProjectByPath = vi.fn();
  const mockRegisterProject = vi.fn();
  const mockUnregisterProject = vi.fn();
  const mockGetProjectHealth = vi.fn();

  const CentralCoreMock = vi.fn().mockImplementation(() => ({
    init: mockInit,
    close: mockClose,
    listProjects: mockListProjects,
    getProject: mockGetProject,
    getProjectByPath: mockGetProjectByPath,
    registerProject: mockRegisterProject,
    unregisterProject: mockUnregisterProject,
    getProjectHealth: mockGetProjectHealth,
    isInitialized: vi.fn().mockReturnValue(true),
  }));

  // Store references on the mock constructor for tests to access
  (CentralCoreMock as any).mockFunctions = {
    mockInit,
    mockClose,
    mockListProjects,
    mockGetProject,
    mockGetProjectByPath,
    mockRegisterProject,
    mockUnregisterProject,
    mockGetProjectHealth,
  };

  return {
    CentralCore: CentralCoreMock,
    TaskStore: vi.fn().mockImplementation(() => ({
      init: vi.fn().mockResolvedValue(undefined),
      listTasks: vi.fn().mockResolvedValue([]),
    })),
  };
});

// Import CentralCore to access mock functions
import { CentralCore } from "@fusion/core";
const getMockFunctions = () => (CentralCore as any).mockFunctions;

vi.mock("@fusion/engine", () => ({
  ProjectManager: vi.fn().mockImplementation(() => ({
    getRuntime: vi.fn().mockReturnValue(undefined),
    removeProject: vi.fn().mockResolvedValue(undefined),
    stopAll: vi.fn().mockResolvedValue(undefined),
  })),
}));

describe("Project Resolver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetProjectResolution();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("findKbDir", () => {
    it("should find .kb directory in current path", () => {
      vi.mocked(existsSync)
        .mockReturnValueOnce(true) // First call for /project/.kb
        .mockReturnValue(false);

      vi.mocked(statSync).mockReturnValue({ isDirectory: () => true } as any);

      const result = findKbDir("/project");
      expect(result).toBe("/project");
    });

    it("should walk up parent directories to find .kb", async () => {
      // First call: /a/b/c - no .kb
      // Second call: /a/b - has .kb
      vi.mocked(existsSync)
        .mockReturnValueOnce(false) // /a/b/c/.kb - not found
        .mockReturnValueOnce(true)   // /a/b/.kb - found
        .mockReturnValue(false);

      vi.mocked(statSync).mockReturnValue({ isDirectory: () => true } as any);

      // Mock dirname to return parent directory
      const { dirname } = await import("node:path");
      vi.mocked(dirname)
        .mockReturnValueOnce("/a/b")
        .mockReturnValueOnce("/a")
        .mockReturnValue("/a"); // Stop at root

      const result = findKbDir("/a/b/c");
      expect(result).toBe("/a/b");
    });

    it("should return null if no .kb found", async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const { dirname } = await import("node:path");
      vi.mocked(dirname).mockReturnValue("/");

      const result = findKbDir("/some/path");
      expect(result).toBeNull();
    });

    it("should return null if .kb is not a directory", () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(statSync).mockReturnValue({ isDirectory: () => false } as any);

      const result = findKbDir("/project");
      expect(result).toBeNull();
    });
  });

  describe("isKbProject", () => {
    it("should return true if .kb directory exists", () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(statSync).mockReturnValue({ isDirectory: () => true } as any);

      expect(isKbProject("/project")).toBe(true);
    });

    it("should return false if .kb directory does not exist", () => {
      vi.mocked(existsSync).mockReturnValue(false);

      expect(isKbProject("/project")).toBe(false);
    });
  });

  describe("suggestProjectName", () => {
    it("should return last path segment as project name", () => {
      expect(suggestProjectName("/path/to/my-project")).toBe("my-project");
    });

    it("should handle paths without separators", () => {
      expect(suggestProjectName("project")).toBe("project");
    });

    it("should return 'unnamed' for empty path", () => {
      expect(suggestProjectName("")).toBe("unnamed");
    });
  });

  describe("resolveAbsolutePath", () => {
    it("should resolve and validate existing directory", () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(statSync).mockReturnValue({ isDirectory: () => true } as any);

      const result = resolveAbsolutePath("/existing/path");
      expect(result).toBeDefined();
    });

    it("should throw ProjectResolutionError for non-existent path", () => {
      vi.mocked(existsSync).mockReturnValue(false);

      expect(() => resolveAbsolutePath("/nonexistent")).toThrow(ProjectResolutionError);
    });

    it("should throw ProjectResolutionError for non-directory path", () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(statSync).mockReturnValue({ isDirectory: () => false } as any);

      expect(() => resolveAbsolutePath("/file.txt")).toThrow(ProjectResolutionError);
    });
  });

  describe("resolveProject", () => {
    it("should resolve by explicit --project flag", async () => {
      const mockProject = {
        id: "proj_123",
        name: "my-project",
        path: "/path/to/project",
        status: "active",
        isolationMode: "in-process",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      };

      getMockFunctions().mockListProjects.mockResolvedValue([mockProject]);
      vi.mocked(existsSync).mockReturnValue(true);

      const result = await resolveProject({ project: "my-project", interactive: false });

      expect(result.name).toBe("my-project");
      expect(result.projectId).toBe("proj_123");
    });

    it("should throw NOT_FOUND if --project project not found", async () => {
      getMockFunctions().mockListProjects.mockResolvedValue([]);

      await expect(resolveProject({ project: "nonexistent", interactive: false })).rejects.toThrow(
        ProjectResolutionError
      );
    });

    it("should auto-detect from cwd with matching registered project", async () => {
      const mockProject = {
        id: "proj_123",
        name: "detected-project",
        path: "/detected/path",
        status: "active",
        isolationMode: "in-process",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      };

      getMockFunctions().mockListProjects.mockResolvedValue([mockProject]);
      getMockFunctions().mockGetProjectByPath.mockResolvedValue(mockProject);
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(statSync).mockReturnValue({ isDirectory: () => true } as any);

      const result = await resolveProject({ cwd: "/detected/path", interactive: false });

      expect(result.name).toBe("detected-project");
    });

    it("should throw NOT_REGISTERED if .kb exists but project not registered", async () => {
      getMockFunctions().mockListProjects.mockResolvedValue([]);
      getMockFunctions().mockGetProjectByPath.mockResolvedValue(undefined);
      vi.mocked(existsSync)
        .mockReturnValueOnce(true) // .kb exists
        .mockReturnValue(true);
      vi.mocked(statSync).mockReturnValue({ isDirectory: () => true } as any);

      await expect(resolveProject({ cwd: "/unregistered", interactive: false })).rejects.toThrow(
        ProjectResolutionError
      );
    });

    it("should use default project when no .kb found and only one project", async () => {
      const mockProject = {
        id: "proj_123",
        name: "only-project",
        path: "/only/path",
        status: "active",
        isolationMode: "in-process",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      };

      getMockFunctions().mockListProjects.mockResolvedValue([mockProject]);
      vi.mocked(existsSync).mockReturnValue(false); // No .kb found

      const result = await resolveProject({ interactive: false });

      expect(result.name).toBe("only-project");
    });

    it("should throw NO_PROJECTS when no projects registered and no .kb found", async () => {
      getMockFunctions().mockListProjects.mockResolvedValue([]);
      vi.mocked(existsSync).mockReturnValue(false);

      await expect(resolveProject({ interactive: false })).rejects.toThrow(
        ProjectResolutionError
      );
    });

    it("should throw MULTIPLE_MATCHES when multiple projects and no match", async () => {
      const projects = [
        { id: "proj_1", name: "project1", path: "/path1", status: "active", isolationMode: "in-process", createdAt: "", updatedAt: "" },
        { id: "proj_2", name: "project2", path: "/path2", status: "active", isolationMode: "in-process", createdAt: "", updatedAt: "" },
      ];

      getMockFunctions().mockListProjects.mockResolvedValue(projects);
      vi.mocked(existsSync).mockReturnValue(false);

      await expect(resolveProject({ interactive: false })).rejects.toThrow(
        ProjectResolutionError
      );
    });

    it("should throw PATH_MISMATCH if registered project directory moved", async () => {
      const mockProject = {
        id: "proj_123",
        name: "moved-project",
        path: "/old/path",
        status: "active",
        isolationMode: "in-process",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      };

      getMockFunctions().mockListProjects.mockResolvedValue([mockProject]);
      vi.mocked(existsSync).mockReturnValue(false); // Path doesn't exist

      await expect(resolveProject({ project: "moved-project", interactive: false })).rejects.toThrow(
        ProjectResolutionError
      );
    });
  });

  describe("ProjectResolutionError", () => {
    it("should create error with code and context", () => {
      const error = new ProjectResolutionError("Test error", "NOT_FOUND", { id: "123" });

      expect(error.message).toBe("Test error");
      expect(error.code).toBe("NOT_FOUND");
      expect(error.context).toEqual({ id: "123" });
      expect(error.name).toBe("ProjectResolutionError");
    });

    it("should include all error codes", () => {
      const codes = [
        "NOT_FOUND",
        "NOT_REGISTERED",
        "MULTIPLE_MATCHES",
        "NO_PROJECTS",
        "PATH_MISMATCH",
        "NOT_INITIALIZED",
        "CANCELLED",
      ];

      for (const code of codes) {
        const error = new ProjectResolutionError("test", code as any);
        expect(error.code).toBe(code);
      }
    });
  });

  describe("formatLastActivity", () => {
    it("should format 'just now' for recent timestamps", () => {
      const now = new Date().toISOString();
      expect(formatLastActivity(now)).toBe("just now");
    });

    it("should format minutes ago", () => {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60000).toISOString();
      expect(formatLastActivity(fiveMinutesAgo)).toBe("5m ago");
    });

    it("should format hours ago", () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 3600000).toISOString();
      expect(formatLastActivity(twoHoursAgo)).toBe("2h ago");
    });

    it("should format days ago", () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString();
      expect(formatLastActivity(threeDaysAgo)).toBe("3d ago");
    });

    it("should return 'never' for undefined timestamp", () => {
      expect(formatLastActivity(undefined)).toBe("never");
    });
  });

  describe("resetProjectResolution", () => {
    it("should reset singleton instances", async () => {
      // First call to initialize
      await getCentralCore();
      
      // Reset
      resetProjectResolution();
      
      // After reset, getCentralCore should create a new instance
      const core = await getCentralCore();
      expect(getMockFunctions().mockInit).toHaveBeenCalled();
    });
  });
});

describe("getCentralCore singleton", () => {
  it("should return same instance on multiple calls", async () => {
    const core1 = await getCentralCore();
    const core2 = await getCentralCore();
    
    // Both should be the same object
    expect(core1).toBe(core2);
  });
});

describe("getProjectManager singleton", () => {
  it("should return same instance on multiple calls", async () => {
    const pm1 = await getProjectManager();
    const pm2 = await getProjectManager();
    
    // Both should be the same object
    expect(pm1).toBe(pm2);
  });
});
