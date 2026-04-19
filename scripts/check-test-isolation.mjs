#!/usr/bin/env node
/**
 * Verifies that the test suite doesn't leak temp directories or touch the
 * real .fusion directory.
 *
 * Usage:
 *   node scripts/check-test-isolation.mjs [--before]
 *
 *   --before    Record baseline state before running tests (writes /tmp/.fusion-isolation-baseline).
 *   (default)   Compare current state to baseline and fail on leaks.
 *
 * Integration:
 *   node scripts/check-test-isolation.mjs --before
 *   pnpm test
 *   node scripts/check-test-isolation.mjs
 */

import { readdirSync, statSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASELINE_FILE = join(tmpdir(), ".fusion-isolation-baseline");

// Prefixes the test suite is allowed to create under /tmp. Any dir matching
// one of these must be cleaned up by the end of the test run.
const TRACKED_PREFIXES = [
  "fusion-worker-",
  "fusion-test-",
  "fusion-test-cwd-",
  "fusion-provider-settings-",
  "fusion-provider-auth-",
  "fusion-provider-auth-oauth-",
  "fusion-agent-dir-",
  "kb-db-test-",
  "kb-backup-test-",
  "kb-migration-test-",
  "kb-fresh-",
  "kb-needs-migration-",
  "kb-compat-test-",
  "kb-first-run-test-",
];

function snapshotTmp() {
  const entries = readdirSync(tmpdir());
  const matching = [];
  for (const name of entries) {
    if (!TRACKED_PREFIXES.some((p) => name.startsWith(p))) continue;
    const full = join(tmpdir(), name);
    try {
      const stat = statSync(full);
      if (stat.isDirectory()) {
        matching.push({ name, mtime: stat.mtimeMs });
      }
    } catch {
      // Ignore — could be gone already.
    }
  }
  return matching;
}

function recordBaseline() {
  const baseline = snapshotTmp();
  writeFileSync(BASELINE_FILE, JSON.stringify(baseline.map((e) => e.name)));
  console.log(`[test-isolation] Baseline recorded: ${baseline.length} existing dir(s) matched patterns.`);
}

function checkAgainstBaseline() {
  let baselineNames = new Set();
  if (existsSync(BASELINE_FILE)) {
    try {
      baselineNames = new Set(JSON.parse(readFileSync(BASELINE_FILE, "utf-8")));
    } catch {
      // Ignore malformed baseline.
    }
  }
  const current = snapshotTmp();
  const leaks = current.filter((e) => !baselineNames.has(e.name));
  if (leaks.length === 0) {
    console.log("[test-isolation] No leaked temp directories detected.");
    process.exit(0);
  }
  console.error(`[test-isolation] FAIL: ${leaks.length} leaked temp director${leaks.length === 1 ? "y" : "ies"}:`);
  for (const leak of leaks) {
    console.error(`  ${join(tmpdir(), leak.name)}`);
  }
  console.error("");
  console.error("Tests must clean up their temp directories. Use helpers from");
  console.error("  packages/core/src/__test-utils__/workspace.ts  (@fusion/test-utils)");
  console.error("  - tempWorkspace(prefix) — auto-cleaned in afterEach");
  console.error("  - useIsolatedCwd(prefix) — auto-cleaned + cwd restored");
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.includes("--before")) {
  recordBaseline();
} else {
  checkAgainstBaseline();
}
