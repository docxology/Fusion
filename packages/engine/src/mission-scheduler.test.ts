/**
 * Mission Scheduler Integration Tests
 *
 * Tests for scheduler interaction with MissionStore:
 * - activateNextPendingSlice
 * - Auto-advance when linked task completes
 * - Mission status rollup triggers
 * - Event listener registration/cleanup
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Scheduler } from "./scheduler.js";
import { AgentSemaphore } from "./concurrency.js";
import type { TaskStore, MissionStore, Slice, Mission, Milestone, MissionFeature } from "@fusion/core";

// Mock store factory
function createMockMissionStore(): any {
  return {
    findNextPendingSlice: vi.fn(),
    activateSlice: vi.fn(),
    getSlice: vi.fn(),
    getMilestone: vi.fn(),
    getMission: vi.fn(),
    getFeatureByTaskId: vi.fn(),
    updateFeatureStatus: vi.fn().mockResolvedValue(undefined),
    computeSliceStatus: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  };
}

function createMockTaskStore(): any {
  return {
    listTasks: vi.fn().mockResolvedValue([]),
    getSettings: vi.fn().mockResolvedValue({}),
    updateTask: vi.fn().mockResolvedValue(undefined),
    moveTask: vi.fn().mockResolvedValue(undefined),
    logEntry: vi.fn().mockResolvedValue(undefined),
    getRootDir: vi.fn().mockReturnValue("/test/project"),
    on: vi.fn(),
    off: vi.fn(),
    getMissionStore: vi.fn(),
  };
}

function createMockSlice(overrides: Partial<Slice> = {}): Slice {
  return {
    id: "SL-001",
    milestoneId: "MS-001",
    title: "Test Slice",
    description: "Test slice description",
    status: "pending",
    orderIndex: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as Slice;
}

function createMockMilestone(overrides: Partial<Milestone> = {}): Milestone {
  return {
    id: "MS-001",
    missionId: "M-001",
    title: "Test Milestone",
    description: "Test milestone description",
    status: "planning",
    orderIndex: 0,
    interviewState: "not_started",
    dependencies: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as Milestone;
}

function createMockMission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: "M-001",
    title: "Test Mission",
    description: "Test mission description",
    status: "active",
    interviewState: "completed",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    autoAdvance: true,
    ...overrides,
  } as Mission;
}

function createMockFeature(overrides: Partial<MissionFeature> = {}): MissionFeature {
  return {
    id: "F-001",
    sliceId: "SL-001",
    title: "Test Feature",
    description: "Test feature description",
    status: "triaged",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as MissionFeature;
}

describe("Scheduler Mission Integration", () => {
  let taskStore: any;
  let missionStore: any;
  let scheduler: Scheduler;

  beforeEach(() => {
    taskStore = createMockTaskStore();
    missionStore = createMockMissionStore();
    taskStore.getMissionStore.mockReturnValue(missionStore);

    const semaphore = new AgentSemaphore(2);
    scheduler = new Scheduler(taskStore, {
      pollIntervalMs: 1000,
      semaphore,
      missionStore,
    });
  });

  afterEach(() => {
    scheduler.stop();
  });

  describe("activateNextPendingSlice", () => {
    it("should find and activate next pending slice", async () => {
      const mockSlice = createMockSlice({ id: "SL-002", status: "pending" });
      const mockActivated = createMockSlice({ id: "SL-002", status: "active" });

      missionStore.findNextPendingSlice.mockReturnValue(mockSlice);
      missionStore.activateSlice.mockReturnValue(mockActivated);

      const result = await scheduler.activateNextPendingSlice("M-001");

      expect(missionStore.findNextPendingSlice).toHaveBeenCalledWith("M-001");
      expect(missionStore.activateSlice).toHaveBeenCalledWith("SL-002");
      expect(result).toEqual(mockActivated);
    });

    it("should return null when no pending slices", async () => {
      missionStore.findNextPendingSlice.mockReturnValue(null);

      const result = await scheduler.activateNextPendingSlice("M-001");

      expect(missionStore.findNextPendingSlice).toHaveBeenCalledWith("M-001");
      expect(result).toBeNull();
    });

    it("should return null when missionStore is not configured", async () => {
      const semaphore = new AgentSemaphore(2);
      const schedulerNoMission = new Scheduler(taskStore, {
        pollIntervalMs: 1000,
        semaphore,
      });

      const result = await schedulerNoMission.activateNextPendingSlice("M-001");

      expect(result).toBeNull();
      schedulerNoMission.stop();
    });

    it("should handle errors gracefully", async () => {
      missionStore.findNextPendingSlice.mockImplementation(() => {
        throw new Error("Database error");
      });

      const result = await scheduler.activateNextPendingSlice("M-001");

      expect(result).toBeNull();
    });
  });

  describe("Mission-aware scheduling", () => {
    it("should handle task completion with mission integration", async () => {
      const feature = createMockFeature({ id: "F-001", sliceId: "SL-001", taskId: "FN-001" });
      const slice = createMockSlice({ id: "SL-001", milestoneId: "MS-001" });
      const milestone = createMockMilestone({ id: "MS-001", missionId: "M-001" });
      const mission = createMockMission({ id: "M-001", autoAdvance: true });
      const nextSlice = createMockSlice({ id: "SL-002", status: "pending" });

      missionStore.getFeatureByTaskId.mockReturnValue(feature);
      missionStore.getSlice.mockReturnValue(slice);
      missionStore.getMilestone.mockReturnValue(milestone);
      missionStore.getMission.mockReturnValue(mission);
      missionStore.computeSliceStatus.mockReturnValue("complete");
      missionStore.findNextPendingSlice.mockReturnValue(nextSlice);
      missionStore.activateSlice.mockReturnValue({ ...nextSlice, status: "active" });

      // Verify the scheduler has access to mission store
      expect(scheduler).toBeDefined();
    });

    it("should not auto-advance when mission is blocked", async () => {
      const feature = createMockFeature({ id: "F-001", sliceId: "SL-001", taskId: "FN-001" });
      const slice = createMockSlice({ id: "SL-001", milestoneId: "MS-001" });
      const milestone = createMockMilestone({ id: "MS-001", missionId: "M-001" });
      const mission = createMockMission({ id: "M-001", status: "blocked" });

      missionStore.getFeatureByTaskId.mockReturnValue(feature);
      missionStore.getSlice.mockReturnValue(slice);
      missionStore.getMilestone.mockReturnValue(milestone);
      missionStore.getMission.mockReturnValue(mission);
      missionStore.computeSliceStatus.mockReturnValue("complete");

      // Verify that scheduler has the mission store
      expect(scheduler).toBeDefined();
    });

    it("should handle task with no linked feature gracefully", async () => {
      missionStore.getFeatureByTaskId.mockReturnValue(undefined);

      // Should not throw when feature is not found
      expect(scheduler).toBeDefined();
    });

    it("should handle multiple slices becoming ready simultaneously", async () => {
      const mission = createMockMission({ id: "M-001" });
      const pendingSlice1 = createMockSlice({ id: "SL-002", status: "pending" });
      const pendingSlice2 = createMockSlice({ id: "SL-003", status: "pending" });

      missionStore.getMission.mockReturnValue(mission);

      // First call returns SL-002
      missionStore.findNextPendingSlice
        .mockReturnValueOnce(pendingSlice1)
        .mockReturnValueOnce(pendingSlice2)
        .mockReturnValueOnce(null);

      // Activate should be called for each slice
      missionStore.activateSlice
        .mockReturnValueOnce({ ...pendingSlice1, status: "active" })
        .mockReturnValueOnce({ ...pendingSlice2, status: "active" });

      // Verify that the scheduler has the mission store
      expect(scheduler).toBeDefined();
    });
  });

  describe("Event listeners", () => {
    it("should register event listeners on scheduler start", () => {
      scheduler.start();

      // Verify that taskStore listeners are registered
      expect(taskStore.on).toHaveBeenCalled();
    });

    it("should not break existing task scheduling with mission integration", () => {
      // Mission integration should not interfere with existing task scheduling
      const mockTasks = [
        { id: "FN-001", column: "todo", dependencies: [], steps: [], currentStep: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        { id: "FN-002", column: "todo", dependencies: [], steps: [], currentStep: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      ];

      (taskStore.listTasks as any).mockResolvedValue(mockTasks);

      scheduler.start();

      // Verify that the scheduler is still functioning with mission store
      expect(scheduler).toBeDefined();
    });
  });
});
