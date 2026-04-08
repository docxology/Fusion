import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockInit = vi.fn().mockResolvedValue(undefined);
const mockClose = vi.fn().mockResolvedValue(undefined);
const mockListNodes = vi.fn();
const mockRegisterNode = vi.fn();
const mockGetNode = vi.fn();
const mockGetNodeByName = vi.fn();
const mockUnregisterNode = vi.fn();
const mockCheckNodeHealth = vi.fn();
const mockQuestion = vi.fn();
const mockRlClose = vi.fn();

vi.mock("@fusion/core", () => ({
  CentralCore: vi.fn().mockImplementation(() => ({
    init: mockInit,
    close: mockClose,
    listNodes: mockListNodes,
    registerNode: mockRegisterNode,
    getNode: mockGetNode,
    getNodeByName: mockGetNodeByName,
    unregisterNode: mockUnregisterNode,
    checkNodeHealth: mockCheckNodeHealth,
  })),
}));

vi.mock("node:readline/promises", () => ({
  createInterface: vi.fn().mockImplementation(() => ({
    question: mockQuestion,
    close: mockRlClose,
  })),
}));

import {
  runNodeList,
  runNodeAdd,
  runNodeRemove,
  runNodeShow,
  runNodeHealth,
} from "../node.js";

function makeNode(overrides: Record<string, unknown> = {}) {
  return {
    id: "node_123",
    name: "local-node",
    type: "local",
    status: "offline",
    maxConcurrent: 2,
    capabilities: ["executor"],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("node commands", () => {
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
    throw new Error("process.exit");
  }) as never);

  beforeEach(() => {
    vi.clearAllMocks();
    mockListNodes.mockResolvedValue([]);
    mockRegisterNode.mockResolvedValue(makeNode());
    mockGetNode.mockResolvedValue(undefined);
    mockGetNodeByName.mockResolvedValue(undefined);
    mockUnregisterNode.mockResolvedValue(undefined);
    mockCheckNodeHealth.mockResolvedValue("online");
    mockQuestion.mockResolvedValue("y");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("runNodeList prints table output with nodes", async () => {
    mockListNodes.mockResolvedValue([
      makeNode({ name: "b-node" }),
      makeNode({ name: "a-node" }),
    ]);

    await runNodeList();

    const output = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain("Registered Nodes");
    expect(output).toContain("a-node");
    expect(output).toContain("b-node");
  });

  it("runNodeList supports JSON output", async () => {
    const nodes = [makeNode({ name: "json-node" })];
    mockListNodes.mockResolvedValue(nodes);

    await runNodeList({ json: true });

    expect(logSpy).toHaveBeenCalledWith(JSON.stringify(nodes, null, 2));
  });

  it("runNodeList prints empty message when no nodes", async () => {
    mockListNodes.mockResolvedValue([]);

    await runNodeList();

    const output = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain("No nodes registered");
  });

  it("runNodeAdd registers local node", async () => {
    mockRegisterNode.mockResolvedValue(makeNode({ id: "node_local", name: "local-node", type: "local" }));

    await runNodeAdd("local-node", {});

    expect(mockRegisterNode).toHaveBeenCalledWith({
      name: "local-node",
      type: "local",
      url: undefined,
      apiKey: undefined,
      maxConcurrent: undefined,
    });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Registered node 'local-node'"));
  });

  it("runNodeAdd registers remote node with url and apiKey", async () => {
    mockRegisterNode.mockResolvedValue(
      makeNode({
        id: "node_remote",
        name: "remote-node",
        type: "remote",
        url: "https://node.example.com",
      }),
    );

    await runNodeAdd("remote-node", {
      url: "https://node.example.com",
      apiKey: "secret",
      maxConcurrent: 4,
    });

    expect(mockRegisterNode).toHaveBeenCalledWith({
      name: "remote-node",
      type: "remote",
      url: "https://node.example.com",
      apiKey: "secret",
      maxConcurrent: 4,
    });
  });

  it("runNodeAdd validates name format", async () => {
    await expect(runNodeAdd("invalid name", {})).rejects.toThrow("process.exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("runNodeAdd rejects missing name", async () => {
    await expect(runNodeAdd(undefined as any, {})).rejects.toThrow("process.exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("runNodeRemove removes with --force", async () => {
    mockGetNode.mockResolvedValue(makeNode({ id: "node_123", name: "to-remove" }));

    await runNodeRemove("node_123", { force: true });

    expect(mockUnregisterNode).toHaveBeenCalledWith("node_123");
  });

  it("runNodeRemove prompts without --force", async () => {
    mockGetNodeByName.mockResolvedValue(makeNode({ id: "node_222", name: "prompt-node" }));
    mockQuestion.mockResolvedValue("y");

    await runNodeRemove("prompt-node", { force: false });

    expect(mockQuestion).toHaveBeenCalled();
    expect(mockUnregisterNode).toHaveBeenCalledWith("node_222");
  });

  it("runNodeRemove rejects unknown node", async () => {
    mockGetNode.mockResolvedValue(undefined);
    mockGetNodeByName.mockResolvedValue(undefined);

    await expect(runNodeRemove("missing", { force: true })).rejects.toThrow("process.exit");
    expect(errorSpy).toHaveBeenCalledWith("Error: Node 'missing' not found.");
  });

  it("runNodeShow displays named node details", async () => {
    mockGetNodeByName.mockResolvedValue(
      makeNode({
        id: "node_remote",
        name: "remote-node",
        type: "remote",
        url: "https://node.example.com",
      }),
    );

    await runNodeShow("remote-node");

    const output = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain("Node: remote-node");
    expect(output).toContain("URL: https://node.example.com");
  });

  it("runNodeShow picks local node when no name provided", async () => {
    mockListNodes.mockResolvedValue([
      makeNode({ id: "node_remote", name: "remote", type: "remote", url: "https://remote" }),
      makeNode({ id: "node_local", name: "local", type: "local" }),
    ]);

    await runNodeShow();

    const output = logSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain("Node: local");
  });

  it("runNodeShow rejects unknown node", async () => {
    mockGetNode.mockResolvedValue(undefined);
    mockGetNodeByName.mockResolvedValue(undefined);

    await expect(runNodeShow("missing")).rejects.toThrow("process.exit");
    expect(errorSpy).toHaveBeenCalledWith("Error: Node 'missing' not found.");
  });

  it("runNodeHealth reports node health status", async () => {
    mockGetNodeByName.mockResolvedValue(makeNode({ id: "node_1", name: "health-node" }));
    mockCheckNodeHealth.mockResolvedValue("online");

    await runNodeHealth("health-node");

    expect(mockCheckNodeHealth).toHaveBeenCalledWith("node_1");
    expect(logSpy).toHaveBeenCalledWith("  Node 'health-node' health: online");
  });

  it("runNodeHealth handles unknown node", async () => {
    mockGetNode.mockResolvedValue(undefined);
    mockGetNodeByName.mockResolvedValue(undefined);

    await expect(runNodeHealth("missing")).rejects.toThrow("process.exit");
    expect(errorSpy).toHaveBeenCalledWith("Error: Node 'missing' not found.");
  });
});
