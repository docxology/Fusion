/**
 * MissionExecutionLoop unit tests.
 *
 * Tests the validation cycle orchestration class with mocked TaskStore and MissionStore.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MissionExecutionLoop } from "./mission-execution-loop.js";
import type {
  Mission,
  Milestone,
  Slice,
  MissionFeature,
  MissionContractAssertion,
  MissionValidatorRun,
} from "@fusion/core";

// ── Mock Factories ──────────────────────────────────────────────────────────

function createMockMission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: "M-TEST1",
    title: "Test Mission",
    status: "active",
    interviewState: "not_started",
    autoAdvance: true,
    autopilotEnabled: true,
    autopilotState: "inactive",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createMockMilestone(overrides: Partial<Milestone> = {}): Milestone {
  return {
    id: "MS-001",
    missionId: "M-TEST1",
    title: "Test Milestone",
    status: "active",
    orderIndex: 0,
    interviewState: "not_started",
    dependencies: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createMockSlice(overrides: Partial<Slice> = {}): Slice {
  return {
    id: "SL-001",
    milestoneId: "MS-001",
    title: "Test Slice",
    status: "active",
    planState: "not_started",
    orderIndex: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createMockFeature(overrides: Partial<MissionFeature> = {}): MissionFeature {
  return {
    id: "F-001",
    sliceId: "SL-001",
    title: "Test Feature",
    status: "defined",
    loopState: "idle",
    implementationAttemptCount: 0,
    validatorAttemptCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createMockValidatorRun(overrides: Partial<MissionValidatorRun> = {}): MissionValidatorRun {
  return {
    id: "VR-001",
    featureId: "F-001",
    milestoneId: "MS-001",
    sliceId: "SL-001",
    status: "running",
    triggerType: "task_completion",
    implementationAttempt: 1,
    validatorAttempt: 1,
    startedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createMockMissionStore() {
  const missions = new Map<string, Mission>();
  const features = new Map<string, MissionFeature>();
  const validatorRuns = new Map<string, MissionValidatorRun>();

  const store = {
    // Mission methods
    getMission: vi.fn((id: string) => missions.get(id)),
    listMissions: vi.fn(() => [...missions.values()]),
    updateMission: vi.fn((id: string, updates: Partial<Mission>) => {
      const existing = missions.get(id);
      if (!existing) throw new Error(`Mission ${id} not found`);
      const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
      missions.set(id, updated);
      return updated;
    }),
    getMissionWithHierarchy: vi.fn((id: string) => {
      const mission = missions.get(id);
      if (!mission) return undefined;
      return {
        ...mission,
        milestones: [createMockMilestone({ missionId: id })],
      };
    }),

    // Feature methods
    getFeature: vi.fn((id: string) => features.get(id)),
    getFeatureByTaskId: vi.fn((taskId: string) => {
      for (const feature of features.values()) {
        if (feature.taskId === taskId) return feature;
      }
      return undefined;
    }),
    listFeatures: vi.fn(() => [...features.values()]),
    updateFeatureStatus: vi.fn((id: string, status: MissionFeature["status"]) => {
      const feature = features.get(id);
      if (!feature) throw new Error(`Feature ${id} not found`);
      const updated = { ...feature, status, updatedAt: new Date().toISOString() };
      features.set(id, updated);
      return updated;
    }),
    transitionLoopState: vi.fn((id: string, newState: MissionFeature["loopState"]) => {
      const feature = features.get(id);
      if (!feature) throw new Error(`Feature ${id} not found`);
      const updated = { ...feature, loopState: newState, updatedAt: new Date().toISOString() };
      features.set(id, updated);
      return updated;
    }),
    listAssertionsForFeature: vi.fn(() => []),
    getAssertionsForFeature: vi.fn(() => []),

    // Validator run methods
    startValidatorRun: vi.fn((featureId: string, _triggerType?: string) => {
      const run = createMockValidatorRun({ featureId });
      validatorRuns.set(run.id, run);
      return run;
    }),
    completeValidatorRun: vi.fn((id: string, status: MissionValidatorRun["status"], summary?: string) => {
      const run = validatorRuns.get(id);
      if (!run) throw new Error(`Validator run ${id} not found`);
      const updated = {
        ...run,
        status,
        summary,
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      validatorRuns.set(id, updated);
      return updated;
    }),
    recordValidatorFailures: vi.fn(() => []),
    createGeneratedFixFeature: vi.fn((sourceFeatureId: string, runId: string, _failedAssertionIds: string[]) => {
      const sourceFeature = features.get(sourceFeatureId);
      if (!sourceFeature) throw new Error(`Feature ${sourceFeatureId} not found`);

      const fixFeature = createMockFeature({
        id: `FIX-${sourceFeatureId}`,
        sliceId: sourceFeature.sliceId,
        title: `Fix for ${sourceFeature.title}`,
        taskId: `TASK-FIX-${sourceFeatureId}`,
        generatedFromFeatureId: sourceFeatureId,
        generatedFromRunId: runId,
        loopState: "implementing",
        implementationAttemptCount: 0,
      });
      features.set(fixFeature.id, fixFeature);

      const updatedSource = {
        ...sourceFeature,
        implementationAttemptCount: (sourceFeature.implementationAttemptCount ?? 0) + 1,
        loopState: "needs_fix" as const,
        updatedAt: new Date().toISOString(),
      };
      features.set(sourceFeatureId, updatedSource);

      return fixFeature;
    }),

    // Event emitter
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),

    // Internal setters for test setup
    _setMission: (m: Mission) => missions.set(m.id, m),
    _setFeature: (f: MissionFeature) => features.set(f.id, f),
    _getValidatorRun: (id: string) => validatorRuns.get(id),
    _clear: () => {
      missions.clear();
      features.clear();
      validatorRuns.clear();
    },
  };

  return store;
}

function createMockTaskStore() {
  const tasks = new Map<string, { id: string; column: string }>();

  const store = {
    getTask: vi.fn(async (id: string) => tasks.get(id)),
    moveTask: vi.fn(),
    updateTask: vi.fn(),
    getSettings: vi.fn().mockResolvedValue({
      missionStaleThresholdMs: 600_000,
      missionMaxTaskRetries: 3,
    }),
    on: vi.fn(),
    off: vi.fn(),

    _setTask: (t: { id: string; column: string }) => tasks.set(t.id, t),
    _clear: () => tasks.clear(),
  };

  return store;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("MissionExecutionLoop", () => {
  let loop: MissionExecutionLoop;
  let missionStore: ReturnType<typeof createMockMissionStore>;
  let taskStore: ReturnType<typeof createMockTaskStore>;

  beforeEach(() => {
    vi.useFakeTimers();
    missionStore = createMockMissionStore();
    taskStore = createMockTaskStore();

    const mission = createMockMission();
    missionStore._setMission(mission);
  });

  afterEach(() => {
    loop?.stop();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ── Lifecycle ────────────────────────────────────────────────────────────

  describe("start/stop", () => {
    it("should start and be running", () => {
      loop = new MissionExecutionLoop({
        taskStore: taskStore as any,
        missionStore: missionStore as any,
        rootDir: "/tmp",
      });

      loop.start();
      expect(loop.isRunning()).toBe(true);
    });

    it("should be idempotent on start", () => {
      loop = new MissionExecutionLoop({
        taskStore: taskStore as any,
        missionStore: missionStore as any,
        rootDir: "/tmp",
      });

      loop.start();
      loop.start(); // Should not throw
      expect(loop.isRunning()).toBe(true);
    });

    it("should stop cleanly", () => {
      loop = new MissionExecutionLoop({
        taskStore: taskStore as any,
        missionStore: missionStore as any,
        rootDir: "/tmp",
      });

      loop.start();
      loop.stop();
      expect(loop.isRunning()).toBe(false);
    });

    it("should be idempotent on stop", () => {
      loop = new MissionExecutionLoop({
        taskStore: taskStore as any,
        missionStore: missionStore as any,
        rootDir: "/tmp",
      });

      loop.stop(); // Should not throw
      expect(loop.isRunning()).toBe(false);
    });
  });

  // ── processTaskOutcome ───────────────────────────────────────────────────

  describe("processTaskOutcome", () => {
    it("should skip if loop is not running", async () => {
      const feature = createMockFeature({ loopState: "implementing", taskId: "FN-001" });
      missionStore._setFeature(feature);
      taskStore._setTask({ id: "FN-001", column: "done" });

      loop = new MissionExecutionLoop({
        taskStore: taskStore as any,
        missionStore: missionStore as any,
        rootDir: "/tmp",
      });
      // Don't start - loop is not running

      await loop.processTaskOutcome("FN-001");

      // Should not start validator run
      expect(missionStore.startValidatorRun).not.toHaveBeenCalled();
    });

    it("should skip if task has no linked feature", async () => {
      missionStore.getFeatureByTaskId = vi.fn().mockReturnValue(undefined);

      loop = new MissionExecutionLoop({
        taskStore: taskStore as any,
        missionStore: missionStore as any,
        rootDir: "/tmp",
      });
      loop.start();

      await loop.processTaskOutcome("FN-999");

      expect(missionStore.startValidatorRun).not.toHaveBeenCalled();
    });

    it("should skip if feature is not in implementing state", async () => {
      const feature = createMockFeature({ loopState: "idle", taskId: "FN-001" });
      missionStore._setFeature(feature);
      missionStore.getFeatureByTaskId = vi.fn().mockReturnValue(feature);

      loop = new MissionExecutionLoop({
        taskStore: taskStore as any,
        missionStore: missionStore as any,
        rootDir: "/tmp",
      });
      loop.start();

      await loop.processTaskOutcome("FN-001");

      expect(missionStore.startValidatorRun).not.toHaveBeenCalled();
    });

    it("should auto-pass if feature has no linked assertions", async () => {
      const feature = createMockFeature({ loopState: "implementing", taskId: "FN-001" });
      missionStore._setFeature(feature);
      taskStore._setTask({ id: "FN-001", column: "done" });
      missionStore.getFeatureByTaskId = vi.fn().mockReturnValue(feature);
      missionStore.listAssertionsForFeature = vi.fn().mockReturnValue([]);

      // Spy on loop's emit to verify validation:passed event
      loop = new MissionExecutionLoop({
        taskStore: taskStore as any,
        missionStore: missionStore as any,
        rootDir: "/tmp",
      });
      const emitSpy = vi.spyOn(loop, "emit");
      loop.start();

      await loop.processTaskOutcome("FN-001");

      // When there are no assertions, we skip starting a validator run
      expect(missionStore.startValidatorRun).not.toHaveBeenCalled();
      // But the passed event should be emitted
      expect(emitSpy).toHaveBeenCalledWith("validation:passed", expect.any(Object));
    });
  });

  // ── recoverActiveMissions ────────────────────────────────────────────────

  describe("recoverActiveMissions", () => {
    it("should not crash when called on stopped loop", async () => {
      loop = new MissionExecutionLoop({
        taskStore: taskStore as any,
        missionStore: missionStore as any,
        rootDir: "/tmp",
      });
      // Don't start - loop is not running

      await expect(loop.recoverActiveMissions()).resolves.not.toThrow();
    });

    it("should not crash when getMissionWithHierarchy returns null", async () => {
      const mission = createMockMission({ status: "active" });
      missionStore._setMission(mission);

      missionStore.getMissionWithHierarchy = vi.fn().mockReturnValue(null);

      loop = new MissionExecutionLoop({
        taskStore: taskStore as any,
        missionStore: missionStore as any,
        rootDir: "/tmp",
      });
      loop.start();

      await expect(loop.recoverActiveMissions()).resolves.not.toThrow();
    });

    it("should not crash when getMissionWithHierarchy throws", async () => {
      const mission = createMockMission({ status: "active" });
      missionStore._setMission(mission);

      missionStore.getMissionWithHierarchy = vi.fn().mockImplementation(() => {
        throw new Error("Database error");
      });

      loop = new MissionExecutionLoop({
        taskStore: taskStore as any,
        missionStore: missionStore as any,
        rootDir: "/tmp",
      });
      loop.start();

      await expect(loop.recoverActiveMissions()).resolves.not.toThrow();
    });

    it("should handle empty hierarchy gracefully", async () => {
      const mission = createMockMission({ status: "active" });
      missionStore._setMission(mission);

      missionStore.getMissionWithHierarchy = vi.fn().mockReturnValue({
        ...mission,
        milestones: [],
      });

      loop = new MissionExecutionLoop({
        taskStore: taskStore as any,
        missionStore: missionStore as any,
        rootDir: "/tmp",
      });
      loop.start();

      await loop.recoverActiveMissions();
      expect(missionStore.transitionLoopState).not.toHaveBeenCalled();
    });

    it("should not recover features from archived missions", async () => {
      const mission = createMockMission({ status: "archived" });
      missionStore._setMission(mission);

      missionStore.getMissionWithHierarchy = vi.fn().mockReturnValue({
        ...mission,
        milestones: [],
      });

      loop = new MissionExecutionLoop({
        taskStore: taskStore as any,
        missionStore: missionStore as any,
        rootDir: "/tmp",
      });
      loop.start();

      await loop.recoverActiveMissions();
      expect(missionStore.transitionLoopState).not.toHaveBeenCalled();
    });
  });

  // ── Error handling ────────────────────────────────────────────────────────

  describe("error handling", () => {
    it("should not crash the loop on processTaskOutcome errors", async () => {
      missionStore.getFeatureByTaskId = vi.fn().mockImplementation(() => {
        throw new Error("Database error");
      });

      loop = new MissionExecutionLoop({
        taskStore: taskStore as any,
        missionStore: missionStore as any,
        rootDir: "/tmp",
      });
      loop.start();

      await expect(loop.processTaskOutcome("FN-001")).resolves.not.toThrow();
    });
  });
});
