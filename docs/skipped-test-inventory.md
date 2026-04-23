# Skipped Test Inventory

_Last audited: 2026-04-23 (FN-2321)_

This document tracks intentional skip usage in test suites so stale follow-up backlog items can be retired quickly.

## Current Inventory

Audit commands:

```bash
rg -n "\b(it|test|describe)\.skip\b|\bskipIf\b|createLoopbackIntegrationTest\(" packages --glob "**/*.{test,spec}.{ts,tsx}"
rg -n "\?\s*it\s*:\s*it\.skip|detectLoopbackBinding" packages/dashboard/src --glob "**/*.{test,spec}.{ts,tsx}"
```

Current results:

1. **Intentional cross-coverage alias**
   - `packages/engine/src/executor.test.ts`
   - `it.skip("step-session skill selection covered in step-session-executor.test.ts", ...)`
   - Rationale: dedicated coverage exists in `step-session-executor.test.ts`; this marker documents ownership.

2. **Environment-gated integration aliases (loopback gated)**
   - Canonical helper: `packages/dashboard/src/__tests__/loopback-integration-test.ts`
   - Helper consumers:
     - `packages/dashboard/src/server-static-assets.test.ts`
     - `packages/dashboard/src/__tests__/websocket.test.ts`
     - `packages/dashboard/src/__tests__/server-webhook.test.ts`
   - Pattern: suites call `createLoopbackIntegrationTest(scope)` and register integration cases through the returned test function.
   - Rationale: these suites require real loopback binding support (`127.0.0.1`) and are intentionally environment-gated.
   - Auditability: when loopback binding is unavailable, skipped test names include a standardized reason and the suite scope label (`...; scope: <suite scope>`), making coverage gaps explicit in CI/test output.

3. **Build-output-gated checks**
   - `packages/cli/src/__tests__/bundle-output.test.ts`
   - `packages/dashboard/app/__tests__/build-output.test.ts`
   - Pattern: `it.skipIf(...)` / `test.skipIf(...)`
   - Rationale: assertions are valid only when build artifacts are present.

## Older Follow-up Reconciliation

Previously tracked actionable skip follow-ups are now resolved and should not be treated as open backlog:

- **FN-2085**: wildcard proxy POST body forwarding coverage is active.
- **FN-2076 / FN-2106 / FN-2109**: NewAgentDialog and MissionInterviewModal rollback favorite-toggle regressions are active interaction tests.

Searches for those IDs in repository test code and docs now return no active TODO/skip markers tied to unresolved work.

## Policy

When adding a new skip marker, include one of the following:

- a clear environment/build gate explanation, or
- a direct reference to the active test that owns equivalent coverage.

Avoid opening follow-up tasks for intentional gate/alias skips unless behavior coverage is actually missing.
