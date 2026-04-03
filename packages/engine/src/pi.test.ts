import { describe, it, expect } from "vitest";
import { describeModel } from "./pi.js";
import type { AgentSession } from "@mariozechner/pi-coding-agent";

describe("describeModel", () => {
  it('returns "provider/modelId" when session has a model', () => {
    const fakeSession = {
      model: {
        provider: "anthropic",
        id: "claude-sonnet-4-5",
        name: "Claude Sonnet",
      },
    } as unknown as AgentSession;

    expect(describeModel(fakeSession)).toBe("anthropic/claude-sonnet-4-5");
  });

  it('returns "unknown model" when session model is undefined', () => {
    const fakeSession = {
      model: undefined,
    } as unknown as AgentSession;

    expect(describeModel(fakeSession)).toBe("unknown model");
  });

  it("handles different providers", () => {
    const fakeSession = {
      model: {
        provider: "openai",
        id: "gpt-4o",
        name: "GPT-4o",
      },
    } as unknown as AgentSession;

    expect(describeModel(fakeSession)).toBe("openai/gpt-4o");
  });
});
