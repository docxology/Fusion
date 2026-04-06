/**
 * MissionAutopilot unit tests.
 *
 * Tests the autopilot monitoring class with mocked TaskStore and MissionStore.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MissionAutopilot } from "./mission-autopilot.js";
import type { Mission, Milestone, Slice, MissionFeature } from "@fusion/core";

// ── Mock Factories ──────────────────────────────────────────────────

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
    status: "pending",
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
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createMockMissionStore(missions: Mission[] = []) {
  const missionMap = new Map(missions.map((m) => [m.id, m]));

  return {
    getMission: vi.fn((id: string) => missionMap.get(id)),
    listMissions: vi.fn(() => [...missionMap.values()]),
    updateMission: vi.fn((id: string, updates: Partial<Mission>) => {
      const existing = missionMap.get(id);
      if (!existing) throw new Error(`Mission ${id} not found`);
      const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
      missionMap.set(id, updated);
      return updated;
    }),
    getMilestone: vi.fn(),
    listMilestones: vi.fn(),
    getSlice: vi.fn(),
    listSlices: vi.fn(),
    getFeatureByTaskId: vi.fn(),
    listFeatures: vi.fn(),
    getMissionWithHierarchy: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  };
}

function createMockTaskStore() {
  return {
    on: vi.fn(),
    off: vi.fn(),
  };
}

function createMockScheduler() {
  return {
    activateNextPendingSlice: vi.fn().mockResolvedValue(null),
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe("MissionAutopilot", () => {
  let autopilot: MissionAutopilot;
  let missionStore: ReturnType<typeof createMockMissionStore>;
  let taskStore: ReturnType<typeof createMockTaskStore>;
  let scheduler: ReturnType<typeof createMockScheduler>;

  beforeEach(() => {
    vi.useFakeTimers();
    const mission = createMockMission();
    missionStore = createMockMissionStore([mission]);
    taskStore = createMockTaskStore();
    scheduler = createMockScheduler();

    autopilot = new MissionAutopilot(
      taskStore as any,
      missionStore as any,
      { scheduler },
    );
  });

  afterEach(() => {
    autopilot.stop();
    vi.useRealTimers();
  });

  // ── Lifecycle ────────────────────────────────────────────────────

  describe("start/stop", () => {
    it("should start and be running", () => {
      autopilot.start();
      // No error means success
    });

    it("should be idempotent on start", () => {
      autopilot.start();
      autopilot.start();
      // Should not throw
    });

    it("should stop cleanly", () => {
      autopilot.start();
      autopilot.stop();
      // Should not throw
    });

    it("should be idempotent on stop", () => {
      autopilot.stop();
      // Should not throw
    });
  });

  // ── Watching ─────────────────────────────────────────────────────

  describe("watchMission", () => {
    it("should watch a mission with autopilot enabled", () => {
      autopilot.watchMission("M-TEST1");

      expect(autopilot.isWatching("M-TEST1")).toBe(true);
      expect(missionStore.updateMission).toHaveBeenCalledWith(
        "M-TEST1",
        expect.objectContaining({ autopilotState: "watching" }),
      );
    });

    it("should not watch a mission without autopilot enabled", () => {
      const mission = createMockMission({ autopilotEnabled: false });
      const store = createMockMissionStore([mission]);
      const ap = new MissionAutopilot(taskStore as any, store as any, { scheduler });

      ap.watchMission("M-TEST1");
      expect(ap.isWatching("M-TEST1")).toBe(false);
    });

    it("should not watch a non-existent mission", () => {
      autopilot.watchMission("M-NONEXISTENT");
      expect(autopilot.isWatching("M-NONEXISTENT")).toBe(false);
    });

    it("should be idempotent — watching same mission twice", () => {
      autopilot.watchMission("M-TEST1");
      autopilot.watchMission("M-TEST1");
      expect(autopilot.getWatchedMissionIds()).toEqual(["M-TEST1"]);
    });
  });

  describe("unwatchMission", () => {
    it("should unwatch a mission", () => {
      autopilot.watchMission("M-TEST1");
      autopilot.unwatchMission("M-TEST1");

      expect(autopilot.isWatching("M-TEST1")).toBe(false);
      expect(missionStore.updateMission).toHaveBeenCalledWith(
        "M-TEST1",
        expect.objectContaining({ autopilotState: "inactive" }),
      );
    });

    it("should be a no-op for non-watched mission", () => {
      autopilot.unwatchMission("M-OTHER");
      // No updateMission call for state change
      expect(missionStore.updateMission).not.toHaveBeenCalledWith(
        "M-OTHER",
        expect.anything(),
      );
    });
  });

  describe("getWatchedMissionIds", () => {
    it("should return empty array when nothing is watched", () => {
      expect(autopilot.getWatchedMissionIds()).toEqual([]);
    });

    it("should return all watched mission IDs", () => {
      const m2 = createMockMission({ id: "M-TEST2", autopilotEnabled: true });
      const store = createMockMissionStore([
        createMockMission(),
        m2,
      ]);
      const ap = new MissionAutopilot(taskStore as any, store as any, { scheduler });

      ap.watchMission("M-TEST1");
      ap.watchMission("M-TEST2");

      expect(ap.getWatchedMissionIds()).toEqual(["M-TEST1", "M-TEST2"]);
    });
  });

  describe("getAutopilotStatus", () => {
    it("should return status for a watched mission", () => {
      autopilot.watchMission("M-TEST1");

      const status = autopilot.getAutopilotStatus("M-TEST1");
      expect(status).toEqual({
        enabled: true,
        state: "watching",
        watched: true,
        lastActivityAt: undefined,
      });
    });

    it("should return status for a non-watched mission", () => {
      const status = autopilot.getAutopilotStatus("M-NONEXISTENT");
      expect(status).toEqual({
        enabled: false,
        state: "inactive",
        watched: false,
        lastActivityAt: undefined,
      });
    });
  });

  // ── Task Completion ──────────────────────────────────────────────

  describe("handleTaskCompletion", () => {
    it("should do nothing if task has no linked feature", async () => {
      missionStore.getFeatureByTaskId.mockReturnValue(undefined);

      await autopilot.handleTaskCompletion("FN-001");
      // Should not attempt to advance
      expect(scheduler.activateNextPendingSlice).not.toHaveBeenCalled();
    });

    it("should do nothing if mission is not being watched", async () => {
      const feature = createMockFeature({ taskId: "FN-001", status: "done" });
      const slice = createMockSlice({ id: "SL-001" });
      const milestone = createMockMilestone();

      missionStore.getFeatureByTaskId.mockReturnValue(feature);
      missionStore.getSlice.mockReturnValue(slice);
      missionStore.getMilestone.mockReturnValue(milestone);
      // Not watching this mission

      await autopilot.handleTaskCompletion("FN-001");
      expect(scheduler.activateNextPendingSlice).not.toHaveBeenCalled();
    });

    it("should advance to next slice when all features are done", async () => {
      const feature = createMockFeature({ taskId: "FN-001", status: "done" });
      const slice = createMockSlice({ id: "SL-001" });
      const milestone = createMockMilestone();

      missionStore.getFeatureByTaskId.mockReturnValue(feature);
      missionStore.getSlice.mockReturnValue(slice);
      missionStore.getMilestone.mockReturnValue(milestone);
      missionStore.listFeatures.mockReturnValue([feature]);

      // Return an activated slice so advanceToNextSlice succeeds
      const activatedSlice = createMockSlice({ id: "SL-002", status: "active" });
      scheduler.activateNextPendingSlice.mockResolvedValue(activatedSlice);

      // Watch the mission first
      autopilot.watchMission("M-TEST1");

      await autopilot.handleTaskCompletion("FN-001");
      expect(scheduler.activateNextPendingSlice).toHaveBeenCalledWith("M-TEST1");
    });

    it("should not advance when not all features are done", async () => {
      const feature1 = createMockFeature({ id: "F-001", taskId: "FN-001", status: "done" });
      const feature2 = createMockFeature({ id: "F-002", status: "in-progress" });
      const slice = createMockSlice({ id: "SL-001" });
      const milestone = createMockMilestone();

      missionStore.getFeatureByTaskId.mockReturnValue(feature1);
      missionStore.getSlice.mockReturnValue(slice);
      missionStore.getMilestone.mockReturnValue(milestone);
      missionStore.listFeatures.mockReturnValue([feature1, feature2]);

      autopilot.watchMission("M-TEST1");

      await autopilot.handleTaskCompletion("FN-001");
      expect(scheduler.activateNextPendingSlice).not.toHaveBeenCalled();
    });

    it("should handle errors gracefully", async () => {
      missionStore.getFeatureByTaskId.mockImplementation(() => {
        throw new Error("DB error");
      });

      // Should not throw
      await autopilot.handleTaskCompletion("FN-001");
    });
  });

  // ── Advance to Next Slice ────────────────────────────────────────

  describe("advanceToNextSlice", () => {
    it("should update state to activating then watching", async () => {
      const activatedSlice = createMockSlice({ id: "SL-002", status: "active" });
      scheduler.activateNextPendingSlice.mockResolvedValue(activatedSlice);

      autopilot.watchMission("M-TEST1");
      await autopilot.advanceToNextSlice("M-TEST1");

      // Should have been called with activating then watching
      const calls = missionStore.updateMission.mock.calls.filter(
        (call: any[]) => call[1]?.autopilotState !== undefined,
      );
      const states = calls.map((call: any[]) => call[1].autopilotState);
      expect(states).toContain("activating");
      expect(states).toContain("watching");
    });

    it("should update lastAutopilotActivityAt on success", async () => {
      const activatedSlice = createMockSlice({ id: "SL-002", status: "active" });
      scheduler.activateNextPendingSlice.mockResolvedValue(activatedSlice);

      autopilot.watchMission("M-TEST1");
      await autopilot.advanceToNextSlice("M-TEST1");

      expect(missionStore.updateMission).toHaveBeenCalledWith(
        "M-TEST1",
        expect.objectContaining({ lastAutopilotActivityAt: expect.any(String) }),
      );
    });

    it("should do nothing if mission is not being watched", async () => {
      await autopilot.advanceToNextSlice("M-TEST1");
      expect(scheduler.activateNextPendingSlice).not.toHaveBeenCalled();
    });
  });

  // ── Check and Start Mission ──────────────────────────────────────

  describe("checkAndStartMission", () => {
    it("should transition planning mission to active", async () => {
      const mission = createMockMission({ status: "planning" });
      const store = createMockMissionStore([mission]);
      const ap = new MissionAutopilot(taskStore as any, store as any, { scheduler });

      const activatedSlice = createMockSlice({ id: "SL-001", status: "active" });
      scheduler.activateNextPendingSlice.mockResolvedValue(activatedSlice);

      await ap.checkAndStartMission("M-TEST1");

      expect(store.updateMission).toHaveBeenCalledWith(
        "M-TEST1",
        expect.objectContaining({ status: "active" }),
      );
    });

    it("should not transition active mission", async () => {
      // Mission is already active
      await autopilot.checkAndStartMission("M-TEST1");

      // Should not change status
      const statusCalls = missionStore.updateMission.mock.calls.filter(
        (call: any[]) => call[1]?.status !== undefined,
      );
      expect(statusCalls.length).toBe(0);
    });

    it("should not transition mission without autopilot enabled", async () => {
      const mission = createMockMission({ status: "planning", autopilotEnabled: false });
      const store = createMockMissionStore([mission]);
      const ap = new MissionAutopilot(taskStore as any, store as any, { scheduler });

      await ap.checkAndStartMission("M-TEST1");
      // No status update should happen
      expect(scheduler.activateNextPendingSlice).not.toHaveBeenCalled();
    });
  });

  // ── Check Mission Completion ─────────────────────────────────────

  describe("checkMissionCompletion", () => {
    it("should detect when all milestones are complete", async () => {
      const m1 = createMockMilestone({ status: "complete" });
      missionStore.listMilestones.mockReturnValue([m1]);

      autopilot.watchMission("M-TEST1");
      const result = await autopilot.checkMissionCompletion("M-TEST1");

      expect(result).toBe(true);
      expect(missionStore.updateMission).toHaveBeenCalledWith(
        "M-TEST1",
        expect.objectContaining({ status: "complete" }),
      );
      expect(autopilot.isWatching("M-TEST1")).toBe(false);
    });

    it("should return false when milestones are not all complete", async () => {
      const m1 = createMockMilestone({ status: "active" });
      missionStore.listMilestones.mockReturnValue([m1]);

      const result = await autopilot.checkMissionCompletion("M-TEST1");
      expect(result).toBe(false);
    });

    it("should return false when there are no milestones", async () => {
      missionStore.listMilestones.mockReturnValue([]);

      const result = await autopilot.checkMissionCompletion("M-TEST1");
      expect(result).toBe(false);
    });

    it("should return false for non-existent mission", async () => {
      const result = await autopilot.checkMissionCompletion("M-NONEXISTENT");
      expect(result).toBe(false);
    });
  });

  // ── Stop cleanup ─────────────────────────────────────────────────

  describe("stop cleanup", () => {
    it("should unwatch all missions on stop", () => {
      const m2 = createMockMission({ id: "M-TEST2", autopilotEnabled: true });
      const store = createMockMissionStore([
        createMockMission(),
        m2,
      ]);
      const ap = new MissionAutopilot(taskStore as any, store as any, { scheduler });

      ap.start();
      ap.watchMission("M-TEST1");
      ap.watchMission("M-TEST2");
      expect(ap.getWatchedMissionIds()).toHaveLength(2);

      ap.stop();
      expect(ap.getWatchedMissionIds()).toHaveLength(0);
    });
  });

  // ── setScheduler ─────────────────────────────────────────────────

  describe("setScheduler", () => {
    it("should allow setting scheduler after construction", async () => {
      // Create autopilot without scheduler
      const ap = new MissionAutopilot(taskStore as any, missionStore as any);
      ap.start();
      ap.watchMission("M-TEST1");

      // advanceToNextSlice should be a no-op without scheduler
      await ap.advanceToNextSlice("M-TEST1");

      const newScheduler = createMockScheduler();
      ap.setScheduler(newScheduler);

      // Now advanceToNextSlice should use the new scheduler
      // (but will be blocked by autoAdvance guard since default mission has autoAdvance: true)
      newScheduler.activateNextPendingSlice.mockResolvedValue(
        createMockSlice({ id: "SL-002", status: "active" }),
      );
      await ap.advanceToNextSlice("M-TEST1");
      expect(newScheduler.activateNextPendingSlice).toHaveBeenCalledWith("M-TEST1");

      ap.stop();
    });
  });

  // ── autoAdvance guard ────────────────────────────────────────────

  describe("autoAdvance guard", () => {
    it("should not advance slice when autoAdvance is false", async () => {
      const mission = createMockMission({ autoAdvance: false });
      const store = createMockMissionStore([mission]);
      const ap = new MissionAutopilot(taskStore as any, store as any, { scheduler });

      ap.start();
      ap.watchMission("M-TEST1");

      await ap.advanceToNextSlice("M-TEST1");

      // Should NOT call scheduler to activate next slice
      expect(scheduler.activateNextPendingSlice).not.toHaveBeenCalled();

      ap.stop();
    });

    it("should not advance slice when autoAdvance is undefined", async () => {
      const mission = createMockMission({ autoAdvance: undefined });
      const store = createMockMissionStore([mission]);
      const ap = new MissionAutopilot(taskStore as any, store as any, { scheduler });

      ap.start();
      ap.watchMission("M-TEST1");

      await ap.advanceToNextSlice("M-TEST1");

      // Should NOT call scheduler to activate next slice
      expect(scheduler.activateNextPendingSlice).not.toHaveBeenCalled();

      ap.stop();
    });

    it("should advance slice when autoAdvance is true", async () => {
      autopilot.watchMission("M-TEST1");
      const activatedSlice = createMockSlice({ id: "SL-002", status: "active" });
      scheduler.activateNextPendingSlice.mockResolvedValue(activatedSlice);

      await autopilot.advanceToNextSlice("M-TEST1");

      expect(scheduler.activateNextPendingSlice).toHaveBeenCalledWith("M-TEST1");
    });
  });
});
