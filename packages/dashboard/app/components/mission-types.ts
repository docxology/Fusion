// Mission types for MissionManager - local copy to avoid module resolution issues

import type {
  MissionEvent as CoreMissionEvent,
  MissionEventType as CoreMissionEventType,
  MissionHealth as CoreMissionHealth,
} from "@fusion/core";

export type MissionStatus = "planning" | "active" | "blocked" | "complete" | "archived";
export type MilestoneStatus = "planning" | "active" | "blocked" | "complete";
export type SliceStatus = "pending" | "active" | "complete";
export type SlicePlanState = "not_started" | "planned" | "needs_update";
export type FeatureStatus = "defined" | "triaged" | "in-progress" | "done";

/** Autopilot state values for mission autonomous progression */
export type AutopilotState = "inactive" | "watching" | "activating" | "completing";

/** Autopilot status returned by API */
export interface AutopilotStatus {
  enabled: boolean;
  state: AutopilotState;
  watched: boolean;
  lastActivityAt?: string;
  nextScheduledCheck?: string;
}

export interface Mission {
  id: string;
  title: string;
  description?: string;
  status: MissionStatus;
  interviewState: "not_started" | "in_progress" | "completed" | "needs_update";
  autoAdvance?: boolean;
  autopilotEnabled?: boolean;
  autopilotState?: AutopilotState;
  lastAutopilotActivityAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MissionFeature {
  id: string;
  sliceId: string;
  taskId?: string;
  title: string;
  description?: string;
  acceptanceCriteria?: string;
  status: FeatureStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Slice {
  id: string;
  milestoneId: string;
  title: string;
  description?: string;
  status: SliceStatus;
  orderIndex: number;
  activatedAt?: string;
  planState?: SlicePlanState;
  interviewState?: "not_started" | "in_progress" | "completed" | "needs_update";
  planningNotes?: string;
  verification?: string;
  createdAt: string;
  updatedAt: string;
  features: MissionFeature[];
}

export type SliceWithFeatures = Slice;

export interface Milestone {
  id: string;
  missionId: string;
  title: string;
  description?: string;
  status: MilestoneStatus;
  orderIndex: number;
  interviewState: "not_started" | "in_progress" | "completed" | "needs_update";
  dependencies: string[];
  planningNotes?: string;
  verification?: string;
  createdAt: string;
  updatedAt: string;
  slices: Slice[];
}

export type MilestoneWithSlices = Milestone;

/** Status summary for a mission card, computed from hierarchy */
export interface MissionSummary {
  totalMilestones: number;
  completedMilestones: number;
  totalFeatures: number;
  completedFeatures: number;
  progressPercent: number;
}

/** Mission with optional status summary (returned by list endpoint) */
export type MissionWithSummary = Mission & { summary?: MissionSummary };

export interface MissionWithHierarchy extends Mission {
  milestones: Milestone[];
}

/** Mission event categories emitted by mission observability APIs. */
export type MissionEventType = CoreMissionEventType;

/** Mission lifecycle event persisted in the mission event log. */
export interface MissionEvent extends CoreMissionEvent {}

/** Computed mission health snapshot returned by observability APIs. */
export interface MissionHealth extends CoreMissionHealth {}

