---
"@gsxdsm/fusion": patch
---

Add mission observability plumbing for lifecycle event logs and health snapshots.

- persist mission lifecycle/autopilot events in the new `mission_events` table
- expose MissionStore `logMissionEvent`, `getMissionEvents`, and `getMissionHealth`
- add `GET /api/missions/:missionId/events` and `GET /api/missions/:missionId/health`
- log autopilot state transitions/retries/completion events for mission auditability
