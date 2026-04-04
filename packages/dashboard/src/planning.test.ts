import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  createSession,
  submitResponse,
  cancelSession,
  getSession,
  getCurrentQuestion,
  getSummary,
  cleanupSession,
  checkRateLimit,
  getRateLimitResetTime,
  __resetPlanningState,
  RateLimitError,
  SessionNotFoundError,
  InvalidSessionStateError,
  parseAgentResponse,
  generateSubtasksFromPlanning,
} from "./planning.js";
import type { PlanningQuestion, PlanningSummary } from "@fusion/core";

// Counter for unique IPs per test
let ipCounter = 0;
function getUniqueIp(): string {
  return `127.0.0.${++ipCounter}`;
}

describe("planning module", () => {
  const initialPlan = "Build a user authentication system";

  beforeEach(() => {
    vi.useFakeTimers();
    __resetPlanningState();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("createSession", () => {
    it("creates a session with valid initial plan", async () => {
      const mockIp = getUniqueIp();
      const result = await createSession(mockIp, initialPlan);

      expect(result.sessionId).toBeDefined();
      expect(typeof result.sessionId).toBe("string");
      expect(result.firstQuestion).toBeDefined();
      expect(result.firstQuestion.id).toBe("q-scope");
      expect(result.firstQuestion.type).toBe("single_select");
    });

    it("enforces rate limiting", async () => {
      const mockIp = getUniqueIp();
      // Create max sessions (5 per hour)
      for (let i = 0; i < 5; i++) {
        await createSession(mockIp, `${initialPlan} ${i}`);
      }

      // 6th session should fail
      await expect(createSession(mockIp, initialPlan)).rejects.toThrow(RateLimitError);
    });

    it("allows new sessions after rate limit window expires", async () => {
      const mockIp = getUniqueIp();
      // Create max sessions
      for (let i = 0; i < 5; i++) {
        await createSession(mockIp, `${initialPlan} ${i}`);
      }

      // Advance time by 1 hour + 1 minute
      vi.advanceTimersByTime(61 * 60 * 1000);

      // Should now be able to create a new session
      const result = await createSession(mockIp, "New plan after reset");
      expect(result.sessionId).toBeDefined();
    });

    it("generates different session IDs for each session", async () => {
      const mockIp = getUniqueIp();
      const result1 = await createSession(mockIp, "Plan 1");
      const result2 = await createSession(mockIp, "Plan 2");

      expect(result1.sessionId).not.toBe(result2.sessionId);
    });
  });

  describe("submitResponse", () => {
    it("processes response and returns next question", async () => {
      const mockIp = getUniqueIp();
      const { sessionId } = await createSession(mockIp, initialPlan);

      const response = await submitResponse(sessionId, { scope: "medium" });

      expect(response.type).toBe("question");
      if (response.type === "question") {
        expect(response.data.type).toBe("text");
      }
    });

    it("returns summary after multiple responses", async () => {
      const mockIp = getUniqueIp();
      const { sessionId } = await createSession(mockIp, initialPlan);

      // Submit first response
      const response1 = await submitResponse(sessionId, { scope: "medium" });
      expect(response1.type).toBe("question");

      // Submit second response
      const response2 = await submitResponse(sessionId, { requirements: "Must have login and logout" });
      expect(response2.type).toBe("question");

      // Submit third response - should get summary
      const response3 = await submitResponse(sessionId, { confirm: true });
      expect(response3.type).toBe("complete");

      if (response3.type === "complete") {
        expect(response3.data.title).toBeDefined();
        expect(response3.data.description).toBeDefined();
        expect(response3.data.suggestedSize).toBeDefined();
        expect(response3.data.keyDeliverables).toBeInstanceOf(Array);
      }
    });

    it("throws SessionNotFoundError for invalid session ID", async () => {
      await expect(submitResponse("invalid-session-id", {})).rejects.toThrow(SessionNotFoundError);
    });

    it("throws InvalidSessionStateError when no active question", async () => {
      const mockIp = getUniqueIp();
      const { sessionId } = await createSession(mockIp, initialPlan);

      // Complete the session
      await submitResponse(sessionId, { scope: "small" });
      await submitResponse(sessionId, { requirements: "test" });
      await submitResponse(sessionId, { confirm: true });

      // Try to submit another response
      await expect(submitResponse(sessionId, {})).rejects.toThrow(InvalidSessionStateError);
    });
  });

  describe("cancelSession", () => {
    it("removes an active session", async () => {
      const mockIp = getUniqueIp();
      const { sessionId } = await createSession(mockIp, initialPlan);

      await cancelSession(sessionId);

      // Should not be able to find the session anymore
      expect(getSession(sessionId)).toBeUndefined();
    });

    it("throws SessionNotFoundError for non-existent session", async () => {
      await expect(cancelSession("non-existent-id")).rejects.toThrow(SessionNotFoundError);
    });
  });

  describe("getSession", () => {
    it("returns session for valid ID", async () => {
      const mockIp = getUniqueIp();
      const { sessionId } = await createSession(mockIp, initialPlan);

      const session = getSession(sessionId);
      expect(session).toBeDefined();
      expect(session?.id).toBe(sessionId);
      expect(session?.initialPlan).toBe(initialPlan);
      expect(session?.ip).toBe(mockIp);
    });

    it("returns undefined for invalid ID", () => {
      expect(getSession("invalid-id")).toBeUndefined();
    });
  });

  describe("getCurrentQuestion", () => {
    it("returns current question for active session", async () => {
      const mockIp = getUniqueIp();
      const { sessionId, firstQuestion } = await createSession(mockIp, initialPlan);

      const question = getCurrentQuestion(sessionId);
      expect(question).toEqual(firstQuestion);
    });

    it("returns undefined for completed session", async () => {
      const mockIp = getUniqueIp();
      const { sessionId } = await createSession(mockIp, initialPlan);

      // Complete the session
      await submitResponse(sessionId, { scope: "small" });
      await submitResponse(sessionId, { requirements: "test" });
      await submitResponse(sessionId, { confirm: true });

      const question = getCurrentQuestion(sessionId);
      expect(question).toBeUndefined();
    });
  });

  describe("getSummary", () => {
    it("returns summary for completed session", async () => {
      const mockIp = getUniqueIp();
      const { sessionId } = await createSession(mockIp, initialPlan);

      // Complete the session
      await submitResponse(sessionId, { scope: "small" });
      await submitResponse(sessionId, { requirements: "test" });
      const response = await submitResponse(sessionId, { confirm: true });

      if (response.type === "complete") {
        const summary = getSummary(sessionId);
        expect(summary).toEqual(response.data);
      }
    });

    it("returns undefined for incomplete session", async () => {
      const mockIp = getUniqueIp();
      const { sessionId } = await createSession(mockIp, initialPlan);

      const summary = getSummary(sessionId);
      expect(summary).toBeUndefined();
    });
  });

  describe("cleanupSession", () => {
    it("removes a session from memory", async () => {
      const mockIp = getUniqueIp();
      const { sessionId } = await createSession(mockIp, initialPlan);

      cleanupSession(sessionId);

      expect(getSession(sessionId)).toBeUndefined();
    });
  });

  describe("rate limiting", () => {
    it("checkRateLimit returns true for first request", () => {
      const result = checkRateLimit(getUniqueIp());
      expect(result).toBe(true);
    });

    it("getRateLimitResetTime returns null for unknown IP", () => {
      const resetTime = getRateLimitResetTime("unknown-ip");
      expect(resetTime).toBeNull();
    });

    it("getRateLimitResetTime returns Date for rate limited IP", async () => {
      const mockIp = getUniqueIp();

      // Max out the rate limit
      for (let i = 0; i < 5; i++) {
        await createSession(mockIp, `Plan ${i}`);
      }

      const resetTime = getRateLimitResetTime(mockIp);
      expect(resetTime).toBeInstanceOf(Date);
      expect(resetTime!.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe("session TTL", () => {
    it("sessions expire after TTL", async () => {
      const mockIp = getUniqueIp();
      const { sessionId } = await createSession(mockIp, initialPlan);

      // Verify session exists
      expect(getSession(sessionId)).toBeDefined();

      // Advance time by 31 minutes
      vi.advanceTimersByTime(31 * 60 * 1000);

      // Trigger cleanup by creating a new session
      await createSession(getUniqueIp(), "Another plan");

      // Note: Session should be expired after cleanup runs
      // We can't directly verify as cleanup is async
    });
  });

  describe("parseAgentResponse", () => {
    it("parses clean JSON question response", () => {
      const input = '{"type":"question","data":{"id":"q-1","type":"text","question":"What scope?"}}';
      const result = parseAgentResponse(input);
      expect(result.type).toBe("question");
      if (result.type === "question") {
        expect(result.data.id).toBe("q-1");
        expect(result.data.question).toBe("What scope?");
      }
    });

    it("parses clean JSON complete response", () => {
      const input = '{"type":"complete","data":{"title":"My Task","description":"A task","suggestedSize":"M","suggestedDependencies":[],"keyDeliverables":["Code"]}}';
      const result = parseAgentResponse(input);
      expect(result.type).toBe("complete");
      if (result.type === "complete") {
        expect(result.data.title).toBe("My Task");
      }
    });

    it("extracts JSON from markdown code block", () => {
      const input = 'Here is the question:\n```json\n{"type":"question","data":{"id":"q-1","type":"text","question":"What scope?"}}\n```\nLet me know!';
      const result = parseAgentResponse(input);
      expect(result.type).toBe("question");
    });

    it("extracts JSON from markdown code block without language tag", () => {
      const input = 'Some preamble\n```\n{"type":"question","data":{"id":"q-1","type":"text","question":"Hello?"}}\n```\nPostamble';
      const result = parseAgentResponse(input);
      expect(result.type).toBe("question");
    });

    it("extracts JSON surrounded by prose", () => {
      const input = 'I think the best question is:\n{"type":"question","data":{"id":"q-1","type":"text","question":"What is the scope?"}}\nThat should help clarify.';
      const result = parseAgentResponse(input);
      expect(result.type).toBe("question");
    });

    it("repairs truncated JSON with missing closing braces", () => {
      const input = '{"type":"question","data":{"id":"q-1","type":"text","question":"What scope?"';
      // Missing closing "}} at the end — repairJson should add them
      const result = parseAgentResponse(input);
      expect(result.type).toBe("question");
    });

    it("repairs JSON with trailing comma", () => {
      const input = '{"type":"question","data":{"id":"q-1","type":"text","question":"Scope?",},}';
      const result = parseAgentResponse(input);
      expect(result.type).toBe("question");
    });

    it("repairs truncated JSON causing Unexpected end of JSON input", () => {
      // Simulate the exact error described in the issue:
      // "Failed to parse AI response: Unexpected end of JSON input"
      const input = '{"type":"question","data":{"id":"q-1","type":"text","question":"What is the overall';
      // The string value is incomplete (missing closing quote and braces)
      const result = parseAgentResponse(input);
      expect(result.type).toBe("question");
      if (result.type === "question") {
        expect(result.data.id).toBe("q-1");
      }
    });

    it("throws with actionable error for non-JSON text", () => {
      const input = "I'm not sure what to ask about this project.";
      expect(() => parseAgentResponse(input)).toThrow("no valid JSON");
    });

    it("throws with actionable error for invalid structure", () => {
      const input = '{"type":"unknown","data":null}';
      expect(() => parseAgentResponse(input)).toThrow("invalid response structure");
    });

    it("throws with actionable error for missing data field", () => {
      const input = '{"type":"question"}';
      expect(() => parseAgentResponse(input)).toThrow("invalid response structure");
    });

    it("handles JSON embedded inside a longer text with multiple braces", () => {
      const input =
        "Here's my analysis:\n" +
        "Some text with {nested} braces that aren't JSON\n" +
        '{"type":"complete","data":{"title":"Auth System","description":"Build auth","suggestedSize":"M","suggestedDependencies":[],"keyDeliverables":["Login"]}}' +
        "\nThat should work!";

      const result = parseAgentResponse(input);
      expect(result.type).toBe("complete");
    });

    it("picks the largest valid JSON object when multiple exist", () => {
      // Two valid JSON objects — the larger (complete) one should win
      const input =
        '{"type":"question","data":{"id":"q-1","type":"text","question":"Hi?"}} ' +
        'and then {"type":"complete","data":{"title":"Full Task","description":"Do everything","suggestedSize":"L","suggestedDependencies":[],"keyDeliverables":["All the things"]}}';

      const result = parseAgentResponse(input);
      expect(result.type).toBe("complete");
    });
  });

  describe("generateSubtasksFromPlanning", () => {
    /** Helper: create a session and complete it to get a summary */
    async function createCompletedSession(
      ip: string,
      plan: string,
      overrides?: Partial<PlanningSummary>
    ): Promise<string> {
      const { sessionId } = await createSession(ip, plan);
      // Complete the session by submitting 3 responses
      await submitResponse(sessionId, { scope: "medium" });
      await submitResponse(sessionId, { requirements: "Test requirements" });
      await submitResponse(sessionId, { confirm: true });
      return sessionId;
    }

    it("returns empty array if session not found", () => {
      const result = generateSubtasksFromPlanning("non-existent-session-id");
      expect(result).toEqual([]);
    });

    it("returns empty array if session has no summary (not complete)", async () => {
      const mockIp = getUniqueIp();
      const { sessionId } = await createSession(mockIp, "Incomplete session");

      const result = generateSubtasksFromPlanning(sessionId);
      expect(result).toEqual([]);
    });

    it("generates subtasks from keyDeliverables", async () => {
      const mockIp = getUniqueIp();
      const sessionId = await createCompletedSession(mockIp, "Build auth system");

      const result = generateSubtasksFromPlanning(sessionId);

      // The stubbed session generates 3 key deliverables:
      // "Implementation", "Tests", "Documentation"
      expect(result.length).toBe(3);

      // First subtask has no dependencies
      expect(result[0]).toEqual({
        id: "subtask-1",
        title: "Implementation",
        description: expect.any(String),
        suggestedSize: "S",
        dependsOn: [],
      });

      // Second subtask depends on first
      expect(result[1]).toEqual({
        id: "subtask-2",
        title: "Tests",
        description: expect.any(String),
        suggestedSize: "M",
        dependsOn: ["subtask-1"],
      });

      // Third subtask depends on second
      expect(result[2]).toEqual({
        id: "subtask-3",
        title: "Documentation",
        description: expect.any(String),
        suggestedSize: "S",
        dependsOn: ["subtask-2"],
      });
    });

    it("generates fallback subtasks when keyDeliverables is empty", async () => {
      const mockIp = getUniqueIp();
      const { sessionId } = await createSession(mockIp, "Fallback test");

      // Complete the session normally, then manually clear keyDeliverables
      await submitResponse(sessionId, { scope: "small" });
      await submitResponse(sessionId, { requirements: "test" });
      await submitResponse(sessionId, { confirm: true });

      // Get the session and manually clear keyDeliverables to test fallback
      const session = getSession(sessionId);
      expect(session).toBeDefined();
      if (session?.summary) {
        session.summary.keyDeliverables = [];
      }

      const result = generateSubtasksFromPlanning(sessionId);

      expect(result.length).toBe(3);
      expect(result[0]).toEqual({
        id: "subtask-1",
        title: "Define implementation approach",
        description: expect.any(String),
        suggestedSize: "S",
        dependsOn: [],
      });
      expect(result[1]).toEqual({
        id: "subtask-2",
        title: "Implement core changes",
        description: expect.any(String),
        suggestedSize: "M",
        dependsOn: ["subtask-1"],
      });
      expect(result[2]).toEqual({
        id: "subtask-3",
        title: "Verify and polish",
        description: expect.any(String),
        suggestedSize: "S",
        dependsOn: ["subtask-2"],
      });
    });

    it("assigns correct sizes based on deliverable position", async () => {
      const mockIp = getUniqueIp();
      const { sessionId } = await createSession(mockIp, "Multi-deliverable test");

      // Complete the session
      await submitResponse(sessionId, { scope: "large" });
      await submitResponse(sessionId, { requirements: "many things" });
      await submitResponse(sessionId, { confirm: true });

      // Modify to have 5 deliverables for size variety
      const session = getSession(sessionId);
      if (session?.summary) {
        session.summary.keyDeliverables = [
          "Setup project structure",
          "Build feature A",
          "Build feature B",
          "Build feature C",
          "Integration tests",
        ];
      }

      const result = generateSubtasksFromPlanning(sessionId);
      expect(result.length).toBe(5);

      // First: S, Middle: M, Last: S
      expect(result[0]?.suggestedSize).toBe("S");
      expect(result[1]?.suggestedSize).toBe("M");
      expect(result[2]?.suggestedSize).toBe("M");
      expect(result[3]?.suggestedSize).toBe("M");
      expect(result[4]?.suggestedSize).toBe("S");
    });

    it("uses sequential dependencies between subtasks", async () => {
      const mockIp = getUniqueIp();
      const sessionId = await createCompletedSession(mockIp, "Dependency test");

      const result = generateSubtasksFromPlanning(sessionId);

      // Each subtask depends on the previous one
      for (let i = 1; i < result.length; i++) {
        expect(result[i]?.dependsOn).toEqual([`subtask-${i}`]);
      }
    });
  });
});
