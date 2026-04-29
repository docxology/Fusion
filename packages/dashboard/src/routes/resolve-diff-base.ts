import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Execute a git command and return stdout as text.
 */
export async function runGitCommand(args: string[], cwd?: string, timeout = 10000): Promise<string> {
  const result = await execFileAsync("git", args, {
    cwd,
    timeout,
    maxBuffer: 10 * 1024 * 1024,
    encoding: "utf-8",
  });

  if (typeof result === "string") {
    return result;
  }

  if (Array.isArray(result)) {
    return String(result[0] ?? "");
  }

  if (result && typeof result === "object" && "stdout" in result) {
    return String((result as { stdout?: unknown }).stdout ?? "");
  }

  return "";
}

export interface ResolveDiffBaseTaskInput {
  baseCommitSha?: string;
  baseBranch?: string;
}

export interface ResolveDiffBaseOptions {
  /**
   * Display-only recovery: when the normal resolution would fall through to
   * `headRef~1` (because `baseBranch` is missing AND `baseCommitSha` is no
   * longer an ancestor of HEAD — e.g., the worktree was rebased onto
   * `origin/main` after `baseCommitSha` was recorded), attempt one final
   * `merge-base(headRef, "main")` (then `origin/main`) before giving up to
   * `headRef~1`.
   *
   * This is for the dashboard "files changed" UI only. The merger never opts
   * in — its scope checks must stay tied to the recorded task base, not a
   * widened display range.
   *
   * Default: false.
   */
  enableDisplayRecovery?: boolean;
}

/**
 * Resolve the diff base ref for a task worktree.
 *
 * IMPORTANT: `packages/engine/src/merger.ts` mirrors this exact ordering for
 * merge-time scope warnings. Keep both implementations in sync so dashboard
 * changed-files views and merger scope enforcement evaluate the same range.
 * The `enableDisplayRecovery` option is *display-only* and intentionally not
 * mirrored in the merger.
 *
 * Strategy (in priority order):
 * 1. **Branch merge-base** — Prefer the live merge-base between `headRef` and
 *    local `{baseBranch}` (fallback: `origin/{baseBranch}`).
 * 2. **Task-scoped baseCommitSha** — If merge-base is unavailable or equals
 *    `headRef`, use `baseCommitSha` when still an ancestor of `headRef`.
 * 3. **Display recovery (opt-in)** — `merge-base(headRef, "main")` /
 *    `origin/main` when steps 1 and 2 yielded nothing.
 * 4. **headRef~1** — Last-resort fallback.
 *
 * Note: callers must validate the worktree still belongs to the task (e.g.
 * compare `git rev-parse --abbrev-ref HEAD` to `task.branch`) before invoking
 * this. After worktree-pool reassignment the same path may host a foreign
 * branch, in which case `baseCommitSha..HEAD` would surface other tasks'
 * commits and this function has no way to detect that.
 */
export async function resolveDiffBase(
  task: ResolveDiffBaseTaskInput,
  cwd: string,
  headRef = "HEAD",
  runGit: (args: string[], cwd?: string, timeout?: number) => Promise<string> = runGitCommand,
  options: ResolveDiffBaseOptions = {},
): Promise<string | undefined> {
  // When baseBranch was nulled (e.g., upstream dep merged and its branch was
  // deleted) but a task-scoped baseCommitSha is still recorded, skip the
  // merge-base step so we don't widen the diff range to merge-base(HEAD, main)
  // and surface unrelated history. Only fall back to "main" when neither hint
  // is available (legacy tasks).
  const baseBranch = task.baseBranch?.trim() || (task.baseCommitSha ? undefined : "main");
  let mergeBase: string | undefined;

  if (baseBranch) {
    try {
      try {
        mergeBase = (await runGit(["merge-base", headRef, baseBranch], cwd, 5000)).trim() || undefined;
      } catch {
        mergeBase = (await runGit(["merge-base", headRef, `origin/${baseBranch}`], cwd, 5000)).trim() || undefined;
      }
    } catch {
      // base branch may no longer exist locally/remotely
    }
  }

  // If merge-base equals headRef, the live merge-base would produce an empty
  // diff. Prefer task.baseCommitSha when still valid.
  if (mergeBase) {
    try {
      const head = (await runGit(["rev-parse", headRef], cwd, 5000)).trim();
      if (head && head !== mergeBase) return mergeBase;
    } catch {
      return mergeBase;
    }
  }

  if (task.baseCommitSha) {
    try {
      await runGit(["merge-base", "--is-ancestor", task.baseCommitSha, headRef], cwd, 5000);
      return task.baseCommitSha;
    } catch {
      // stale or unreachable — fall through
    }
  }

  // Display-only recovery before the HEAD~1 fallback. Only kicks in when the
  // caller explicitly opted in AND the original resolution skipped the
  // merge-base step (no baseBranch was recorded). This catches the case where
  // a worktree got rebased onto origin/main after baseCommitSha was
  // recorded, leaving the SHA as a non-ancestor of HEAD.
  if (options.enableDisplayRecovery && !task.baseBranch?.trim()) {
    try {
      const out = (await runGit(["merge-base", headRef, "main"], cwd, 5000)).trim();
      if (out) return out;
    } catch {
      try {
        const out = (await runGit(["merge-base", headRef, "origin/main"], cwd, 5000)).trim();
        if (out) return out;
      } catch {
        // no recovery possible — fall through to HEAD~1
      }
    }
  }

  try {
    return (await runGit(["rev-parse", `${headRef}~1`], cwd, 5000)).trim() || undefined;
  } catch {
    return undefined;
  }
}
