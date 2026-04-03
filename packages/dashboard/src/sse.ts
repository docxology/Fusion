import type { Request, Response } from "express";
import type { TaskStore, MissionStore } from "@fusion/core";

let activeConnections = 0;

/** Returns the current number of active SSE connections. */
export function getActiveSSEConnections(): number {
  return activeConnections;
}

export function createSSE(store: TaskStore, missionStore?: MissionStore) {
  return (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    activeConnections++;

    // Send initial heartbeat
    res.write(": connected\n\n");

    const onCreated = (task: any) => {
      res.write(`event: task:created\ndata: ${JSON.stringify(task)}\n\n`);
    };
    const onMoved = (data: any) => {
      res.write(`event: task:moved\ndata: ${JSON.stringify(data)}\n\n`);
    };
    const onUpdated = (task: any) => {
      res.write(`event: task:updated\ndata: ${JSON.stringify(task)}\n\n`);
    };
    const onDeleted = (task: any) => {
      res.write(`event: task:deleted\ndata: ${JSON.stringify(task)}\n\n`);
    };
    const onMerged = (result: any) => {
      res.write(`event: task:merged\ndata: ${JSON.stringify(result)}\n\n`);
    };

    store.on("task:created", onCreated);
    store.on("task:moved", onMoved);
    store.on("task:updated", onUpdated);
    store.on("task:deleted", onDeleted);
    store.on("task:merged", onMerged);

    // Mission store event listeners (only wired up when missionStore is provided)
    const onMissionCreated = (data: any) => {
      res.write(`event: mission:created\ndata: ${JSON.stringify(data)}\n\n`);
    };
    const onMissionUpdated = (data: any) => {
      res.write(`event: mission:updated\ndata: ${JSON.stringify(data)}\n\n`);
    };
    const onMissionDeleted = (data: any) => {
      res.write(`event: mission:deleted\ndata: ${JSON.stringify(data)}\n\n`);
    };
    const onMilestoneCreated = (data: any) => {
      res.write(`event: milestone:created\ndata: ${JSON.stringify(data)}\n\n`);
    };
    const onMilestoneUpdated = (data: any) => {
      res.write(`event: milestone:updated\ndata: ${JSON.stringify(data)}\n\n`);
    };
    const onMilestoneDeleted = (data: any) => {
      res.write(`event: milestone:deleted\ndata: ${JSON.stringify(data)}\n\n`);
    };
    const onSliceCreated = (data: any) => {
      res.write(`event: slice:created\ndata: ${JSON.stringify(data)}\n\n`);
    };
    const onSliceUpdated = (data: any) => {
      res.write(`event: slice:updated\ndata: ${JSON.stringify(data)}\n\n`);
    };
    const onSliceDeleted = (data: any) => {
      res.write(`event: slice:deleted\ndata: ${JSON.stringify(data)}\n\n`);
    };
    const onSliceActivated = (data: any) => {
      res.write(`event: slice:activated\ndata: ${JSON.stringify(data)}\n\n`);
    };
    const onFeatureCreated = (data: any) => {
      res.write(`event: feature:created\ndata: ${JSON.stringify(data)}\n\n`);
    };
    const onFeatureUpdated = (data: any) => {
      res.write(`event: feature:updated\ndata: ${JSON.stringify(data)}\n\n`);
    };
    const onFeatureDeleted = (data: any) => {
      res.write(`event: feature:deleted\ndata: ${JSON.stringify(data)}\n\n`);
    };
    const onFeatureLinked = (data: any) => {
      res.write(`event: feature:linked\ndata: ${JSON.stringify(data)}\n\n`);
    };

    if (missionStore) {
      missionStore.on("mission:created", onMissionCreated);
      missionStore.on("mission:updated", onMissionUpdated);
      missionStore.on("mission:deleted", onMissionDeleted);
      missionStore.on("milestone:created", onMilestoneCreated);
      missionStore.on("milestone:updated", onMilestoneUpdated);
      missionStore.on("milestone:deleted", onMilestoneDeleted);
      missionStore.on("slice:created", onSliceCreated);
      missionStore.on("slice:updated", onSliceUpdated);
      missionStore.on("slice:deleted", onSliceDeleted);
      missionStore.on("slice:activated", onSliceActivated);
      missionStore.on("feature:created", onFeatureCreated);
      missionStore.on("feature:updated", onFeatureUpdated);
      missionStore.on("feature:deleted", onFeatureDeleted);
      missionStore.on("feature:linked", onFeatureLinked);
    }

    // Heartbeat every 30s to keep connection alive
    const heartbeat = setInterval(() => {
      res.write(": heartbeat\n\n");
    }, 30_000);

    _req.on("close", () => {
      activeConnections--;
      clearInterval(heartbeat);
      store.off("task:created", onCreated);
      store.off("task:moved", onMoved);
      store.off("task:updated", onUpdated);
      store.off("task:deleted", onDeleted);
      store.off("task:merged", onMerged);
      if (missionStore) {
        missionStore.off("mission:created", onMissionCreated);
        missionStore.off("mission:updated", onMissionUpdated);
        missionStore.off("mission:deleted", onMissionDeleted);
        missionStore.off("milestone:created", onMilestoneCreated);
        missionStore.off("milestone:updated", onMilestoneUpdated);
        missionStore.off("milestone:deleted", onMilestoneDeleted);
        missionStore.off("slice:created", onSliceCreated);
        missionStore.off("slice:updated", onSliceUpdated);
        missionStore.off("slice:deleted", onSliceDeleted);
        missionStore.off("slice:activated", onSliceActivated);
        missionStore.off("feature:created", onFeatureCreated);
        missionStore.off("feature:updated", onFeatureUpdated);
        missionStore.off("feature:deleted", onFeatureDeleted);
        missionStore.off("feature:linked", onFeatureLinked);
      }
    });
  };
}
