import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TaskStore } from "@fusion/core";
import { dirname, resolve } from "path";

// Create mock functions that can be configured in tests
const mocks = vi.hoisted(() => ({
  mockReaddir: vi.fn(),
  mockReadFile: vi.fn(),
  mockWriteFile: vi.fn(),
  mockStat: vi.fn(),
  mockExistsSync: vi.fn(),
}));

// Hoist mocks alongside vi.mock
vi.mock("node:fs/promises", async () => {
  const actual = await import("node:fs/promises");
  return {
    default: {
      readdir: mocks.mockReaddir,
      readFile: mocks.mockReadFile,
      writeFile: mocks.mockWriteFile,
      stat: mocks.mockStat,
    },
    readdir: mocks.mockReaddir,
    readFile: mocks.mockReadFile,
    writeFile: mocks.mockWriteFile,
    stat: mocks.mockStat,
  };
});

vi.mock("node:fs", async () => {
  const actual = await import("node:fs");
  return {
    default: {
      existsSync: mocks.mockExistsSync,
    },
    existsSync: mocks.mockExistsSync,
  };
});

// Import AFTER mocks are set up
import { writeProjectFile } from "../file-service";

describe("debug", () => {
  beforeEach(() => {
    mocks.mockStat.mockReset();
  });

  it("test", async () => {
    const mockGetRootDir = vi.fn();
    const mockStore = {
      getRootDir: mockGetRootDir,
    } as unknown as TaskStore;
    
    mockGetRootDir.mockReturnValue("/test/project");
    
    const basePath = resolve("/test/project");
    const filePath = "file.txt/sub.txt";
    const resolvedPath = resolve(basePath, filePath);
    const parentDir = dirname(resolvedPath);
    
    // Create a proper stats object
    const fileNotDirStats = {
      isDirectory: () => false,
      isFile: () => true,
      size: 100,
      mtime: new Date(),
    };
    
    // Setup mock - note: use .mockResolvedValue for promises
    mocks.mockStat.mockImplementation(async (path: string) => {
      console.log("stat called:", path);
      if (path === resolvedPath) {
        console.log("File path - throwing ENOENT");
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      }
      if (path === parentDir) {
        console.log("Parent dir - returning file stats");
        console.log("Returning:", fileNotDirStats);
        console.log("isDirectory():", fileNotDirStats.isDirectory());
        return fileNotDirStats;
      }
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
    
    try {
      await writeProjectFile(mockStore, filePath, "content");
      console.log("Success!");
    } catch (e: any) {
      console.log("Error:", e.message);
    }
  });
});
