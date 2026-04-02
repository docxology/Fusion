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
    
    // Test the mock directly
    mocks.mockStat.mockResolvedValue({
      isDirectory: () => false,
      isFile: () => true,
    });
    
    const result = await mocks.mockStat("/test/some/path");
    console.log("Direct mock result:", result);
    console.log("Direct mock isDirectory():", result.isDirectory());
    
    // Now test writeProjectFile
    try {
      await writeProjectFile(mockStore, filePath, "content");
      console.log("Success!");
    } catch (e: any) {
      console.log("Error:", e.message);
    }
  });
});
