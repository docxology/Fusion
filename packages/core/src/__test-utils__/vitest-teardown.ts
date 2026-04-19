/**
 * Vitest globalSetup hook. The returned function runs once after the entire
 * test run completes, regardless of whether individual workers exited cleanly.
 * Wipes the shared FUSION_TEST_WORKER_ROOT directory that holds per-worker
 * temp dirs created by vitest-setup.ts.
 */

import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const WORKER_ROOT = join(tmpdir(), "fusion-test-workers");

export default function setup(): () => Promise<void> {
  // Set the env var here too so vitest-setup.ts workers pick it up even if
  // their own mkdir runs after globalSetup.
  process.env.FUSION_TEST_WORKER_ROOT = WORKER_ROOT;

  return async function teardown() {
    try {
      rmSync(WORKER_ROOT, { recursive: true, force: true });
    } catch {
      // Ignore — OS cleans /tmp eventually.
    }
  };
}
