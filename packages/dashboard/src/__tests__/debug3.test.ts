import { describe, it, expect, vi } from "vitest";
import { writeProjectFile } from "../file-service";
import type { TaskStore } from "@fusion/core";

// Create mock functions that can be configured in tests
const mocks = vi.hoisted(() => ({
  mockReaddir: vi.fn(),
  mockReadFile: vi.fn(),
  mockWriteFile: vi.fn(),
  mockStat: vi.fn(),
  mockExistsSync: vi.fn(),
}));

vi.mock("node:fs/promises", () => {
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

vi.mock("node:fs", () => {
  return {
    default: {
      existsSync: mocks.mockExistsSync,
    },
    existsSync: mocks.mockExistsSync,
  };
});

describe("debug", () => {
  it("test", async () => {
    const mockGetRootDir = vi.fn();
    const mockStore = {
      getRootDir: mockGetRootDir,
    } as unknown as TaskStore;
    
    mockGetRootDir.mockReturnValue("/test/project");
    
    // Setup mock to return specific values for each call
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
    
    try {
      await writeProjectFile(mockStore, "file.txt/sub.txt", "content");
    } catch (e) {
      console.log("Error:", e);
    }
  });
});
