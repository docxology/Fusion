/**
 * Shared agent tool factory functions.
 *
 * Extracted from TaskExecutor so they can be reused by other subsystems
 * (e.g., HeartbeatMonitor execution) without pulling in the full executor.
 *
 * The parameter schemas are canonical here — executor.ts imports and reuses them.
 */

import type { TaskStore } from "@fusion/core";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { Type, type Static } from "@mariozechner/pi-ai";
import type { AgentReflectionService } from "./agent-reflection.js";

// ── Tool parameter schemas (canonical definitions) ────────────────────────

export const taskCreateParams = Type.Object({
  description: Type.String({ description: "What needs to be done" }),
  dependencies: Type.Optional(
    Type.Array(Type.String(), { description: "Task IDs this new task depends on (e.g. [\"KB-001\"])" }),
  ),
});

export const taskLogParams = Type.Object({
  message: Type.String({ description: "What happened" }),
  outcome: Type.Optional(Type.String({ description: "Result or consequence (optional)" })),
});

export const reflectOnPerformanceParams = Type.Object({
  focus_area: Type.Optional(
    Type.String({ description: "Optional focus area for reflection (e.g., 'code quality', 'speed', 'testing')" }),
  ),
});

// ── Tool factory functions ────────────────────────────────────────────────

/**
 * Create a `task_create` tool that creates a new task in triage.
 *
 * @param store - TaskStore for task persistence
 * @returns ToolDefinition for the `task_create` tool
 */
export function createTaskCreateTool(store: TaskStore): ToolDefinition {
  return {
    name: "task_create",
    label: "Create Task",
    description:
      "Create a new task for out-of-scope work discovered during execution. " +
      "The task goes into triage where it will be specified by the AI. " +
      "Optionally set dependencies (e.g., the new task depends on the current one, " +
      "or the current task should wait for the new one).",
    parameters: taskCreateParams,
    execute: async (_id: string, params: Static<typeof taskCreateParams>) => {
      const task = await store.createTask({
        description: params.description,
        dependencies: params.dependencies,
        column: "triage",
      });
      const deps = task.dependencies.length ? ` (depends on: ${task.dependencies.join(", ")})` : "";
      return {
        content: [{
          type: "text" as const,
          text: `Created ${task.id}: ${params.description}${deps}`,
        }],
        details: {},
      };
    },
  };
}

/**
 * Create a `task_log` tool that logs an entry for a specific task.
 *
 * @param store - TaskStore for task persistence
 * @param taskId - The task ID to log entries against
 * @returns ToolDefinition for the `task_log` tool
 */
export function createTaskLogTool(store: TaskStore, taskId: string): ToolDefinition {
  return {
    name: "task_log",
    label: "Log Entry",
    description:
      "Log an important action, decision, or issue for this task. " +
      "Use for significant events — not every small step.",
    parameters: taskLogParams,
    execute: async (_id: string, params: Static<typeof taskLogParams>) => {
      await store.logEntry(taskId, params.message, params.outcome);
      return {
        content: [{ type: "text" as const, text: `Logged: ${params.message}` }],
        details: {},
      };
    },
  };
}

/**
 * Create a `reflect_on_performance` tool that asks the reflection service to
 * analyze recent agent performance and return actionable insights.
 */
export function createReflectOnPerformanceTool(
  reflectionService: AgentReflectionService,
  agentId: string,
): ToolDefinition {
  return {
    name: "reflect_on_performance",
    label: "Reflect on Performance",
    description:
      'Review your past task performance and generate insights for improvement. Optionally focus on a specific area like "code quality", "speed", or "testing".',
    parameters: reflectOnPerformanceParams,
    execute: async (_id: string, params: Static<typeof reflectOnPerformanceParams>) => {
      const triggerDetail = params.focus_area
        ? `Agent-initiated reflection focused on: ${params.focus_area}`
        : "Agent-initiated reflection";

      const reflection = await reflectionService.generateReflection(agentId, "manual", {
        triggerDetail,
      });

      if (!reflection) {
        return {
          content: [{ type: "text" as const, text: "No reflection data available — not enough history yet." }],
          details: {},
        };
      }

      const formattedText = [
        `Summary: ${reflection.summary}`,
        "",
        "Insights:",
        ...reflection.insights.map((insight, index) => `${index + 1}. ${insight}`),
        "",
        "Suggested Improvements:",
        ...reflection.suggestedImprovements.map((improvement, index) => `${index + 1}. ${improvement}`),
      ].join("\n");

      return {
        content: [{ type: "text" as const, text: formattedText }],
        details: {},
      };
    },
  };
}
