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
    mocks.mockStat.mockImplementation((path: string) => {
      console.log("stat called with:", path);
      if (path === "/test/project/file.txt/sub.txt") {
        return Promise.reject({ code: "ENOENT" });
      }
      if (path === "/test/project/file.txt") {
        return Promise.resolve({
          isDirectory: () => false,
          isFile: () => true,
        });
      }
      return Promise.reject({ code: "ENOENT" });
    });
  });

  it("test", async () => {
    const mockGetRootDir = vi.fn();
    const mockStore = {
      getRootDir: mockGetRootDir,
    } as unknown as TaskStore;
    
    mockGetRootDir.mockReturnValue("/test/project");
    
    try {
      await writeProjectFile(mockStore, "file.txt/sub.txt", "content");
      console.log("Success!");
    } catch (e: any) {
      console.log("Error:", e.message);
      expect(e.message).toContain("Parent is not a directory");
    }
  });
});
