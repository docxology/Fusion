/**
 * MissionAutopilot — Background monitoring for autonomous mission progression.
 *
 * Watches missions with `autopilotEnabled: true` and automatically:
 * - Activates slices when previous ones complete
 * - Tracks overall mission health and state
 * - Detects and recovers from failures
 *
 * **Integration pattern:** The Scheduler handles low-level task scheduling
 * and calls `missionAutopilot.handleTaskCompletion()` after updating feature
 * status. MissionAutopilot does NOT register its own event listeners.
 *
 * **State machine:**
 * - `inactive` → `watching`: User enables autopilot
 * - `watching` → `activating`: Task completes, autopilot progresses
 * - `activating` → `watching`: Slice activated successfully
 * - `watching/activating` → `inactive`: User disables or engine stops
 * - `activating` → `completing`: All slices done, mission wrapping up
 * - `completing` → `inactive`: Mission complete
 */

import type { TaskStore, MissionStore, Mission, AutopilotState, AutopilotStatus, Slice } from "@fusion/core";
import { autopilotLog } from "./logger.js";

/** Maximum retry attempts for slice activation failures. */
const MAX_RETRY_ATTEMPTS = 3;

/** Base delay for exponential backoff between retries (ms). */
const RETRY_BASE_DELAY_MS = 1000;

/** Background poll interval for checking mission health (ms). */
const POLL_INTERVAL_MS = 60_000;

/** Time after which a mission is considered stale (5 minutes). */
const STALE_THRESHOLD_MS = 5 * 60 * 1000;

/** Per-mission tracking state. */
interface WatchedMissionState {
  missionId: string;
  retryCount: number;
}

export interface MissionAutopilotOptions {
  /** Optional Scheduler instance for slice activation. Can also be set via setScheduler(). */
  scheduler?: {
    activateNextPendingSlice(missionId: string): Promise<Slice | null>;
  };
}

/**
 * MissionAutopilot monitors missions with `autopilotEnabled: true` and
 * autonomously progresses through slices as tasks complete.
 *
 * It does NOT register event listeners on TaskStore or MissionStore.
 * Instead, the Scheduler calls `handleTaskCompletion()` after performing
 * its own feature status updates. This avoids duplicate event handling.
 */
export class MissionAutopilot {
  private watchedMissions = new Map<string, WatchedMissionState>();
  private running = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private scheduler: MissionAutopilotOptions["scheduler"];

  constructor(
    private taskStore: TaskStore,
    private missionStore: MissionStore,
    options: MissionAutopilotOptions = {},
  ) {
    this.scheduler = options.scheduler;
  }

  /**
   * Set the scheduler instance after construction.
   * Used to break circular dependency: Scheduler is constructed with
   * MissionAutopilot, then calls setScheduler(this) after both are created.
   */
  setScheduler(scheduler: MissionAutopilotOptions["scheduler"]): void {
    this.scheduler = scheduler;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────

  /**
   * Start the autopilot background service.
   * Begins periodic polling for mission health checks.
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.pollTimer = setInterval(() => this.poll(), POLL_INTERVAL_MS);
    autopilotLog.log("Started");
  }

  /**
   * Stop the autopilot background service.
   * Unwatches all missions and clears state.
   */
  stop(): void {
    if (!this.running) return;
    this.running = false;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    // Unwatch all missions
    for (const [missionId] of this.watchedMissions) {
      try {
        this.setAutopilotState(missionId, "inactive");
      } catch {
        // Best effort — mission may have been deleted
      }
    }
    this.watchedMissions.clear();
    autopilotLog.log("Stopped");
  }

  // ── Mission Watching ───────────────────────────────────────────────

  /**
   * Start watching a mission.
   * Sets `autopilotState` to `watching` and adds to watched set.
   *
   * @param missionId - Mission ID to watch
   */
  watchMission(missionId: string): void {
    if (this.watchedMissions.has(missionId)) {
      autopilotLog.log(`Already watching mission ${missionId}`);
      return;
    }

    const mission = this.missionStore.getMission(missionId);
    if (!mission) {
      autopilotLog.warn(`Mission ${missionId} not found — cannot watch`);
      return;
    }

    if (!mission.autopilotEnabled) {
      autopilotLog.warn(`Mission ${missionId} does not have autopilot enabled — skipping`);
      return;
    }

    this.watchedMissions.set(missionId, { missionId, retryCount: 0 });
    this.setAutopilotState(missionId, "watching");
    autopilotLog.log(`Watching mission ${missionId} (${mission.title})`);
  }

  /**
   * Stop watching a mission.
   * Sets `autopilotState` to `inactive` and removes from watched set.
   *
   * @param missionId - Mission ID to unwatch
   */
  unwatchMission(missionId: string): void {
    if (!this.watchedMissions.has(missionId)) {
      return;
    }

    this.watchedMissions.delete(missionId);
    try {
      this.setAutopilotState(missionId, "inactive");
    } catch {
      // Mission may have been deleted
    }
    autopilotLog.log(`Unwatched mission ${missionId}`);
  }

  /**
   * Check if a mission is currently being watched.
   */
  isWatching(missionId: string): boolean {
    return this.watchedMissions.has(missionId);
  }

  /**
   * Get all currently watched mission IDs.
   */
  getWatchedMissionIds(): string[] {
    return [...this.watchedMissions.keys()];
  }

  /**
   * Get the current autopilot status for a mission.
   */
  getAutopilotStatus(missionId: string): AutopilotStatus {
    const mission = this.missionStore.getMission(missionId);
    const watched = this.watchedMissions.has(missionId);

    return {
      enabled: mission?.autopilotEnabled ?? false,
      state: mission?.autopilotState ?? "inactive",
      watched,
      lastActivityAt: mission?.lastAutopilotActivityAt,
    };
  }

  // ── Progression Logic ──────────────────────────────────────────────

  /**
   * Called by the Scheduler after a task with a sliceId completes.
   *
   * 1. Finds the feature linked to the task
   * 2. Checks if the slice is now complete (all features done)
   * 3. If so, advances to the next slice
   *
   * @param taskId - The completed task ID
   */
  async handleTaskCompletion(taskId: string): Promise<void> {
    try {
      const feature = this.missionStore.getFeatureByTaskId(taskId);
      if (!feature) {
        // Task is not linked to any feature — not a mission task
        return;
      }

      const slice = this.missionStore.getSlice(feature.sliceId);
      if (!slice) {
        autopilotLog.warn(`Slice ${feature.sliceId} not found for feature ${feature.id}`);
        return;
      }

      // Resolve mission ID for this slice
      const milestone = this.missionStore.getMilestone(slice.milestoneId);
      if (!milestone) return;
      const missionId = milestone.missionId;

      // Only proceed if we're watching this mission
      if (!this.isWatching(missionId)) return;

      // Check if all features in the slice are done
      const features = this.missionStore.listFeatures(slice.id);
      const allDone = features.length > 0 && features.every((f) => f.status === "done");

      if (allDone) {
        autopilotLog.log(`Slice ${slice.id} is complete — advancing mission ${missionId}`);
        await this.advanceToNextSlice(missionId);
      }
    } catch (err) {
      autopilotLog.error(`Error handling task completion for ${taskId}:`, err);
    }
  }

  /**
   * Activate the next pending slice in a mission.
   * Uses the scheduler's `activateNextPendingSlice()` method.
   *
   * @param missionId - Mission ID to advance
   */
  async advanceToNextSlice(missionId: string): Promise<void> {
    const state = this.watchedMissions.get(missionId);
    if (!state) return;

    // Respect the mission's autoAdvance setting — if the user opted for
    // manual slice activation, autopilot should NOT auto-advance even when
    // it is watching and enabled.
    const mission = this.missionStore.getMission(missionId);
    if (!mission?.autoAdvance) {
      autopilotLog.log(`Mission ${missionId} has autoAdvance disabled — skipping slice activation`);
      return;
    }

    try {
      this.setAutopilotState(missionId, "activating");

      if (this.scheduler) {
        const activated = await this.scheduler.activateNextPendingSlice(missionId);
        if (activated) {
          autopilotLog.log(`Activated slice ${activated.id} for mission ${missionId}`);
          this.updateActivity(missionId);
          // Reset retry count on success
          state.retryCount = 0;
        } else {
          // No pending slice — check for mission completion
          const complete = await this.checkMissionCompletion(missionId);
          if (complete) {
            return; // already transitions state
          }
        }
      }

      this.setAutopilotState(missionId, "watching");
    } catch (err) {
      autopilotLog.error(`Error advancing slice for mission ${missionId}:`, err);

      // Retry with exponential backoff
      state.retryCount++;
      if (state.retryCount <= MAX_RETRY_ATTEMPTS) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(3, state.retryCount - 1);
        autopilotLog.log(`Retrying slice activation for mission ${missionId} (attempt ${state.retryCount}/${MAX_RETRY_ATTEMPTS}, delay ${delay}ms)`);
        setTimeout(() => {
          if (this.isWatching(missionId)) {
            void this.advanceToNextSlice(missionId);
          }
        }, delay);
      } else {
        autopilotLog.error(`Max retries exceeded for mission ${missionId} — pausing autopilot`);
        this.setAutopilotState(missionId, "watching");
        state.retryCount = 0;
      }
    }
  }

  /**
   * Check if a mission is in planning and should be started.
   * If mission is `planning` and `autopilotEnabled: true`, transitions to `active`
   * and activates the first pending slice.
   *
   * @param missionId - Mission ID to check and start
   */
  async checkAndStartMission(missionId: string): Promise<void> {
    const mission = this.missionStore.getMission(missionId);
    if (!mission) return;

    if (mission.status === "planning" && mission.autopilotEnabled) {
      autopilotLog.log(`Starting mission ${missionId} (transitioning from planning to active)`);

      this.missionStore.updateMission(missionId, { status: "active" });
      this.updateActivity(missionId);

      // Activate first pending slice
      if (this.scheduler) {
        const activated = await this.scheduler.activateNextPendingSlice(missionId);
        if (activated) {
          autopilotLog.log(`Activated first slice ${activated.id} for mission ${missionId}`);
        }
      }
    }
  }

  /**
   * Check if all milestones in a mission are complete.
   * If so, set the mission to complete and return true.
   *
   * @param missionId - Mission ID to check
   * @returns true if mission is complete, false otherwise
   */
  async checkMissionCompletion(missionId: string): Promise<boolean> {
    const mission = this.missionStore.getMission(missionId);
    if (!mission) return false;

    const milestones = this.missionStore.listMilestones(missionId);
    if (milestones.length === 0) return false;

    const allComplete = milestones.every((m) => m.status === "complete");
    if (allComplete) {
      autopilotLog.log(`Mission ${missionId} is complete!`);
      this.setAutopilotState(missionId, "completing");
      this.missionStore.updateMission(missionId, { status: "complete" });
      this.updateActivity(missionId);
      this.setAutopilotState(missionId, "inactive");
      this.watchedMissions.delete(missionId);
      return true;
    }

    return false;
  }

  // ── Background Poll ────────────────────────────────────────────────

  /**
   * Periodic health check for watched missions.
   * - Re-watches missions with `autopilotEnabled: true` that aren't being tracked
   * - Starts missions in `planning` with autopilot enabled
   * - Flags stale missions
   */
  private poll(): void {
    if (!this.running) return;

    try {
      const missions = this.missionStore.listMissions();

      for (const mission of missions) {
        // Auto-watch missions with autopilot enabled that aren't being watched
        if (mission.autopilotEnabled && !this.isWatching(mission.id) && mission.status !== "complete" && mission.status !== "archived") {
          autopilotLog.log(`Poll: auto-watching mission ${mission.id}`);
          this.watchMission(mission.id);
        }

        // Start planning missions with autopilot
        if (mission.autopilotEnabled && mission.status === "planning" && this.isWatching(mission.id)) {
          void this.checkAndStartMission(mission.id);
        }
      }

      // Check for stale missions
      const now = Date.now();
      for (const [missionId, state] of this.watchedMissions) {
        const mission = this.missionStore.getMission(missionId);
        if (!mission) {
          // Mission deleted — unwatch
          this.watchedMissions.delete(missionId);
          continue;
        }

        if (mission.lastAutopilotActivityAt) {
          const lastActivity = new Date(mission.lastAutopilotActivityAt).getTime();
          if (now - lastActivity > STALE_THRESHOLD_MS) {
            autopilotLog.warn(`Mission ${missionId} is stale (no activity for ${Math.round((now - lastActivity) / 60_000)} minutes)`);
          }
        }
      }
    } catch (err) {
      autopilotLog.error("Error during autopilot poll:", err);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────

  /**
   * Update the `autopilotState` on a mission in the store.
   */
  private setAutopilotState(missionId: string, state: AutopilotState): void {
    try {
      const mission = this.missionStore.getMission(missionId);
      if (mission && mission.autopilotState !== state) {
        this.missionStore.updateMission(missionId, { autopilotState: state });
      }
    } catch (err) {
      autopilotLog.error(`Error setting autopilot state for mission ${missionId}:`, err);
    }
  }

  /**
   * Update the `lastAutopilotActivityAt` timestamp on a mission.
   */
  private updateActivity(missionId: string): void {
    try {
      this.missionStore.updateMission(missionId, {
        lastAutopilotActivityAt: new Date().toISOString(),
      });
    } catch (err) {
      autopilotLog.error(`Error updating activity for mission ${missionId}:`, err);
    }
  }
}
