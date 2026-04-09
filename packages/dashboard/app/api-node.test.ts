import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchRemoteNodeHealth,
  fetchRemoteNodeProjects,
  fetchRemoteNodeTasks,
  fetchRemoteNodeProjectHealth,
} from "./api-node";
import * as apiModule from "./api";

vi.mock("./api", () => ({
  proxyApi: vi.fn(),
}));

const mockProxyApi = vi.mocked(apiModule.proxyApi);

describe("api-node", () => {
  beforeEach(() => {
    mockProxyApi.mockReset();
  });

  describe("fetchRemoteNodeHealth", () => {
    it("calls proxyApi with correct path and nodeId", async () => {
      const mockHealth = { status: "online", version: "1.0.0", nodeId: "node_abc" };
      mockProxyApi.mockResolvedValueOnce(mockHealth);

      const result = await fetchRemoteNodeHealth("node_abc");

      expect(mockProxyApi).toHaveBeenCalledTimes(1);
      expect(mockProxyApi).toHaveBeenCalledWith("/health", { nodeId: "node_abc" });
      expect(result).toEqual(mockHealth);
    });

    it("returns remote node health data", async () => {
      const mockHealth = { status: "offline", version: "2.0.0", nodeId: "node_xyz" };
      mockProxyApi.mockResolvedValueOnce(mockHealth);

      const result = await fetchRemoteNodeHealth("node_xyz");

      expect(result.status).toBe("offline");
      expect(result.version).toBe("2.0.0");
      expect(result.nodeId).toBe("node_xyz");
    });
  });

  describe("fetchRemoteNodeProjects", () => {
    it("calls proxyApi with correct path and nodeId", async () => {
      const mockProjects = [
        {
          id: "proj_001",
          name: "Test Project",
          path: "/test/path",
          status: "active",
          isolationMode: "in-process" as const,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ];
      mockProxyApi.mockResolvedValueOnce(mockProjects);

      const result = await fetchRemoteNodeProjects("node_abc");

      expect(mockProxyApi).toHaveBeenCalledTimes(1);
      expect(mockProxyApi).toHaveBeenCalledWith("/projects", { nodeId: "node_abc" });
      expect(result).toEqual(mockProjects);
    });

    it("returns empty array when no projects exist", async () => {
      mockProxyApi.mockResolvedValueOnce([]);

      const result = await fetchRemoteNodeProjects("node_abc");

      expect(result).toEqual([]);
    });
  });

  describe("fetchRemoteNodeTasks", () => {
    it("calls proxyApi with tasks path including projectId query param", async () => {
      const mockTasks = [
        {
          id: "FN-001",
          title: "Test Task",
          description: "Test description",
          column: "todo" as const,
          dependencies: [],
          steps: [],
          currentStep: 0,
          size: "M" as const,
          reviewLevel: 1,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          columnMovedAt: "2026-01-01T00:00:00.000Z",
        },
      ];
      mockProxyApi.mockResolvedValueOnce(mockTasks);

      const result = await fetchRemoteNodeTasks("node_abc", "proj_001");

      expect(mockProxyApi).toHaveBeenCalledTimes(1);
      expect(mockProxyApi).toHaveBeenCalledWith(
        "/tasks?projectId=proj_001",
        { nodeId: "node_abc" },
      );
      expect(result).toEqual(mockTasks);
    });

    it("properly encodes projectId with special characters", async () => {
      mockProxyApi.mockResolvedValueOnce([]);

      await fetchRemoteNodeTasks("node_abc", "proj/test+special");

      expect(mockProxyApi).toHaveBeenCalledWith(
        "/tasks?projectId=proj%2Ftest%2Bspecial",
        { nodeId: "node_abc" },
      );
    });
  });

  describe("fetchRemoteNodeProjectHealth", () => {
    it("calls proxyApi with project-health path including projectId query param", async () => {
      const mockHealth = {
        activeTaskCount: 5,
        inFlightAgentCount: 2,
        status: "active" as const,
      };
      mockProxyApi.mockResolvedValueOnce(mockHealth);

      const result = await fetchRemoteNodeProjectHealth("node_abc", "proj_001");

      expect(mockProxyApi).toHaveBeenCalledTimes(1);
      expect(mockProxyApi).toHaveBeenCalledWith(
        "/project-health?projectId=proj_001",
        { nodeId: "node_abc" },
      );
      expect(result).toEqual(mockHealth);
    });

    it("properly encodes projectId with special characters", async () => {
      mockProxyApi.mockResolvedValueOnce({
        activeTaskCount: 0,
        inFlightAgentCount: 0,
        status: "active" as const,
      });

      await fetchRemoteNodeProjectHealth("node_abc", "proj/test+special");

      expect(mockProxyApi).toHaveBeenCalledWith(
        "/project-health?projectId=proj%2Ftest%2Bspecial",
        { nodeId: "node_abc" },
      );
    });
  });

  describe("error handling", () => {
    it("propagates errors from proxyApi", async () => {
      mockProxyApi.mockRejectedValueOnce(new Error("Network error"));

      await expect(fetchRemoteNodeHealth("node_abc")).rejects.toThrow("Network error");
    });

    it("propagates API error responses", async () => {
      mockProxyApi.mockRejectedValueOnce(new Error("404 Not Found"));

      await expect(fetchRemoteNodeProjects("node_abc")).rejects.toThrow("404 Not Found");
    });
  });
});
