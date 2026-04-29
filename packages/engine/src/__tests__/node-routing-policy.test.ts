import { describe, expect, it } from "vitest";
import type { NodeStatus, UnavailableNodePolicy } from "@fusion/core";
import { applyUnavailableNodePolicy } from "../node-routing-policy.js";

describe("applyUnavailableNodePolicy", () => {
  it.each<[UnavailableNodePolicy | undefined, NodeStatus | undefined]>([
    ["block", "online"],
    ["block", "offline"],
    ["block", "error"],
    ["block", "connecting"],
    ["block", undefined],
    ["fallback-local", "online"],
    ["fallback-local", "offline"],
    ["fallback-local", "error"],
    ["fallback-local", "connecting"],
    ["fallback-local", undefined],
    [undefined, "online"],
    [undefined, "offline"],
    [undefined, "error"],
    [undefined, "connecting"],
    [undefined, undefined],
  ])("always allows local execution (policy=%s, status=%s)", (policy, status) => {
    const result = applyUnavailableNodePolicy(status, policy, true);

    expect(result).toEqual({
      allowed: true,
      fallbackToLocal: false,
      reason: "local-execution",
    });
  });

  it.each<[
    NodeStatus | undefined,
    { allowed: boolean; fallbackToLocal: boolean },
  ]>([
    ["online", { allowed: true, fallbackToLocal: false }],
    ["offline", { allowed: false, fallbackToLocal: false }],
    ["error", { allowed: false, fallbackToLocal: false }],
    ["connecting", { allowed: false, fallbackToLocal: false }],
    [undefined, { allowed: true, fallbackToLocal: false }],
  ])("applies block policy for status=%s", (status, expected) => {
    const result = applyUnavailableNodePolicy(status, "block", false);

    expect(result.allowed).toBe(expected.allowed);
    expect(result.fallbackToLocal).toBe(expected.fallbackToLocal);
  });

  it.each<[
    NodeStatus | undefined,
    { allowed: boolean; fallbackToLocal: boolean },
  ]>([
    ["online", { allowed: true, fallbackToLocal: false }],
    ["offline", { allowed: true, fallbackToLocal: true }],
    ["error", { allowed: true, fallbackToLocal: true }],
    ["connecting", { allowed: true, fallbackToLocal: true }],
    [undefined, { allowed: true, fallbackToLocal: false }],
  ])("applies fallback-local policy for status=%s", (status, expected) => {
    const result = applyUnavailableNodePolicy(status, "fallback-local", false);

    expect(result.allowed).toBe(expected.allowed);
    expect(result.fallbackToLocal).toBe(expected.fallbackToLocal);
  });

  it("defaults undefined policy to block behavior", () => {
    const result = applyUnavailableNodePolicy("offline", undefined, false);

    expect(result).toEqual({
      allowed: false,
      fallbackToLocal: false,
      reason: "blocked:offline",
    });
  });

  it("includes status in blocked and fallback reason strings", () => {
    expect(applyUnavailableNodePolicy("offline", "block", false).reason).toBe("blocked:offline");
    expect(applyUnavailableNodePolicy("error", "fallback-local", false).reason).toBe("fallback-local:error");
  });
});
