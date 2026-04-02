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

// Use vi.mock with __mocks__ pattern
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

// Import file-service
import { listProjectFiles } from "../file-service";

describe("debug", () => {
  it("test", async () => {
    const mockGetRootDir = vi.fn();
    const mockStore = {
      getRootDir: mockGetRootDir,
    } as unknown as TaskStore;
    
    mockGetRootDir.mockReturnValue("/project");
    
    mocks.mockStat.mockResolvedValue({
      isDirectory: () => true,
      isFile: () => false,
    });
    mocks.mockReaddir.mockResolvedValue([]);
    
    console.log("Calling listProjectFiles...");
    try {
      const result = await listProjectFiles(mockStore, "./src");
      console.log("Result:", result);
      console.log("mockStat calls:", mocks.mockStat.mock.calls);
      expect(result.path).toBe("src");
      expect(result.entries).toEqual([]);
    } catch (e) {
      console.log("Error:", e);
      console.log("mockStat calls:", mocks.mockStat.mock.calls);
      throw e;
    }
  });
});
