/**
 * Shared test helpers for creating isolated, disposable workspaces.
 *
 * All tests that touch the filesystem or resolve paths from process.cwd()
 * should use these helpers so they never touch the real user's ~/Projects or
 * the repo's real .fusion/ directory.
 *
 * - `tempWorkspace()` returns a tracked temp dir that is auto-removed in afterEach.
 * - `useIsolatedCwd()` chdirs into a tracked temp dir for the test and restores after.
 * - `assertOutsideRealFusion(path)` throws if path would resolve under the real .fusion.
 */

import { mkdtempSync, rmSync, existsSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { afterEach } from "vitest";

let realFusionRootCache: string | null = null;
function getRealFusionRoot(): string | null {
  if (realFusionRootCache !== null) return realFusionRootCache;
  const fromEnv = process.env.FUSION_TEST_REAL_ROOT;
  if (fromEnv) {
    try {
      realFusionRootCache = realpathSync(fromEnv);
    } catch {
      realFusionRootCache = resolve(fromEnv);
    }
    return realFusionRootCache;
  }
  return null;
}

export function assertOutsideRealFusion(path: string, context = "operation"): void {
  const realRoot = getRealFusionRoot();
  if (!realRoot) return;
  let candidate: string;
  try {
    candidate = realpathSync(path);
  } catch {
    candidate = resolve(path);
  }
  const realFusionDir = join(realRoot, ".fusion");
  if (candidate === realFusionDir || candidate.startsWith(realFusionDir + sep)) {
    throw new Error(
      `[test-safety] ${context} targeted real user .fusion directory: ${candidate}\n` +
      `Tests must operate inside a temp directory. Use tempWorkspace() or useIsolatedCwd().`
    );
  }
}

const activeTempDirs = new Set<string>();

/**
 * Create a temp directory tracked for auto-cleanup at the end of the current test.
 * Returns the absolute path (realpath-resolved).
 */
export function tempWorkspace(prefix = "fusion-test-"): string {
  const raw = mkdtempSync(join(tmpdir(), prefix));
  const dir = realpathSync(raw);
  activeTempDirs.add(dir);
  return dir;
}

const pendingCwdRestorals: Array<() => void> = [];

/**
 * Create a temp workspace and chdir into it for the duration of the current test.
 * Restores original cwd in afterEach.
 */
export function useIsolatedCwd(prefix = "fusion-test-cwd-"): string {
  const dir = tempWorkspace(prefix);
  const original = process.cwd();
  process.chdir(dir);
  pendingCwdRestorals.push(() => {
    try {
      process.chdir(original);
    } catch {
      // Ignore — original may no longer exist.
    }
  });
  return dir;
}

afterEach(() => {
  while (pendingCwdRestorals.length > 0) {
    const restore = pendingCwdRestorals.pop();
    try { restore?.(); } catch { /* ignore */ }
  }
  for (const dir of activeTempDirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Ignore — OS will clean /tmp eventually.
    }
  }
  activeTempDirs.clear();
});

/**
 * Manually register a path for afterEach cleanup.
 */
export function trackForCleanup(path: string): void {
  if (!path) return;
  try {
    const resolved = existsSync(path) ? realpathSync(path) : resolve(path);
    activeTempDirs.add(resolved);
  } catch {
    activeTempDirs.add(resolve(path));
  }
}
