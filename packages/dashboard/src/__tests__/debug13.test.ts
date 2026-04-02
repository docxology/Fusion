import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TaskStore } from "@fusion/core";

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

  it("test - parent is not a directory", async () => {
    const mockGetRootDir = vi.fn();
    const mockStore = {
      getRootDir: mockGetRootDir,
    } as unknown as TaskStore;
    
    mockGetRootDir.mockReturnValue("/test/project");
    
    // First call: file doesn't exist (throw ENOENT)
    // Second call: parent is a file, not a directory (return object with isDirectory: false)
    // Third call: after write, get file stats
    mocks.mockStat
      .mockRejectedValueOnce({ code: "ENOENT" }) // First: file doesn't exist
      .mockResolvedValueOnce({ // Second: parent is a file
        isDirectory: () => false,
        isFile: () => true,
      })
      .mockResolvedValueOnce({ // Third: after write
        isDirectory: () => false,
        isFile: () => true,
        size: 100,
        mtime: new Date(),
      });
    
    try {
      await writeProjectFile(mockStore, "file.txt/sub.txt", "content");
      console.log("Success!");
    } catch (e: any) {
      console.log("Error:", e.message);
      expect(e.message).toContain("Parent is not a directory");
    }
  });
});
