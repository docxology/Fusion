/**
 * Remote Node API functions for fetching data from remote nodes via the proxy.
 * All functions route through /api/proxy/:nodeId/... when a remote node is targeted.
 */

import type { ProjectInfo } from "./api";
import type { ProjectHealth, Task } from "@fusion/core";
import { proxyApi } from "./api";

/** Health information for a remote node */
export interface RemoteNodeHealth {
  status: string;
  version: string;
  nodeId: string;
}

/** Fetch health information from a remote node */
export async function fetchRemoteNodeHealth(nodeId: string): Promise<RemoteNodeHealth> {
  return proxyApi<RemoteNodeHealth>("/health", { nodeId });
}

/** Fetch all projects from a remote node */
export async function fetchRemoteNodeProjects(nodeId: string): Promise<ProjectInfo[]> {
  return proxyApi<ProjectInfo[]>("/projects", { nodeId });
}

/** Fetch tasks from a specific project on a remote node */
export async function fetchRemoteNodeTasks(nodeId: string, projectId: string): Promise<Task[]> {
  return proxyApi<Task[]>(`/tasks?projectId=${encodeURIComponent(projectId)}`, { nodeId });
}

/** Fetch project health from a remote node */
export async function fetchRemoteNodeProjectHealth(
  nodeId: string,
  projectId: string,
): Promise<ProjectHealth> {
  return proxyApi<ProjectHealth>(`/project-health?projectId=${encodeURIComponent(projectId)}`, {
    nodeId,
  });
}
