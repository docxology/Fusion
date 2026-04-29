import type { NodeStatus, UnavailableNodePolicy } from "@fusion/core";

export interface PolicyResult {
  allowed: boolean;
  fallbackToLocal: boolean;
  reason: string;
}

const UNHEALTHY_STATUSES: ReadonlySet<NodeStatus> = new Set(["offline", "error", "connecting"]);

export function applyUnavailableNodePolicy(
  nodeStatus: NodeStatus | undefined,
  policy: UnavailableNodePolicy | undefined,
  isLocal: boolean,
): PolicyResult {
  if (isLocal) {
    return { allowed: true, fallbackToLocal: false, reason: "local-execution" };
  }

  if (nodeStatus === undefined) {
    return { allowed: true, fallbackToLocal: false, reason: "unknown-health" };
  }

  if (nodeStatus === "online") {
    return { allowed: true, fallbackToLocal: false, reason: "healthy" };
  }

  if (!UNHEALTHY_STATUSES.has(nodeStatus)) {
    return { allowed: true, fallbackToLocal: false, reason: "healthy" };
  }

  if (policy === "fallback-local") {
    return {
      allowed: true,
      fallbackToLocal: true,
      reason: `fallback-local:${nodeStatus}`,
    };
  }

  return {
    allowed: false,
    fallbackToLocal: false,
    reason: `blocked:${nodeStatus}`,
  };
}
