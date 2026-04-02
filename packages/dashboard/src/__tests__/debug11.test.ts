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
    
    // Track all stat calls
    let callCount = 0;
    mocks.mockStat.mockImplementation(async (path: string) => {
      callCount++;
      console.log(`stat call #${callCount}:`, path);
      
      if (callCount === 1) {
        // First call - file doesn't exist
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      }
      if (callCount === 2) {
        // Second call - parent is a file
        return {
          isDirectory: () => false,
          isFile: () => true,
        };
      }
      if (callCount === 3) {
        // Third call - after write
        return {
          isDirectory: () => false,
          isFile: () => true,
          size: 100,
          mtime: new Date(),
        };
      }
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
    
    try {
      await writeProjectFile(mockStore, "file.txt/sub.txt", "content");
      console.log("Success!");
    } catch (e: any) {
      console.log("Error:", e.message);
    }
  });
});
