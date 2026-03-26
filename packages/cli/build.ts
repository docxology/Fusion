#!/usr/bin/env bun
/**
 * Bun compile build script for the `hai` CLI.
 *
 * Produces a single self-contained executable at packages/cli/dist/hai
 * with the dashboard client assets co-located at packages/cli/dist/client/.
 *
 * Usage:
 *   bun run build.ts
 *
 * Prerequisites:
 *   - `pnpm build` must have been run first (dashboard client + tsc)
 *   - Bun >= 1.0
 */

import { join, dirname } from "node:path";
import { cpSync, mkdirSync, existsSync, rmSync } from "node:fs";

const cliRoot = dirname(new URL(import.meta.url).pathname);
const workspaceRoot = join(cliRoot, "..", "..");
const outDir = join(cliRoot, "dist");
const outBinary = join(outDir, process.platform === "win32" ? "hai.exe" : "hai");
const dashboardClientSrc = join(workspaceRoot, "packages", "dashboard", "dist", "client");
const dashboardClientDest = join(outDir, "client");

// ── Validate prerequisites ────────────────────────────────────────────
if (!existsSync(dashboardClientSrc)) {
  console.error(
    `ERROR: Dashboard client not built. Expected: ${dashboardClientSrc}\n` +
    `Run 'pnpm build' first to build all packages.`,
  );
  process.exit(1);
}

// ── Clean previous output ─────────────────────────────────────────────
if (existsSync(outBinary)) rmSync(outBinary);
if (existsSync(dashboardClientDest)) rmSync(dashboardClientDest, { recursive: true });

// ── Copy dashboard client assets alongside output ─────────────────────
// Express.static requires a real filesystem directory, so we co-locate
// the pre-built SPA next to the binary rather than embedding blobs.
console.log("Copying dashboard client assets...");
mkdirSync(dashboardClientDest, { recursive: true });
cpSync(dashboardClientSrc, dashboardClientDest, { recursive: true });
console.log(`  → ${dashboardClientDest}`);

// ── Compile the CLI binary ────────────────────────────────────────────
console.log("Compiling hai executable...");

const entryPoint = join(cliRoot, "src", "bin.ts");

const proc = Bun.spawnSync({
  cmd: [
    "bun", "build",
    "--compile",
    entryPoint,
    "--outfile", outBinary,
    "--target", "bun",
    // Minify for smaller binary
    "--minify",
  ],
  cwd: workspaceRoot,
  stdout: "inherit",
  stderr: "inherit",
  env: {
    ...process.env,
    // Ensure workspace resolution works
    NODE_PATH: join(workspaceRoot, "node_modules"),
  },
});

if (proc.exitCode !== 0) {
  console.error(`\nBun compile failed with exit code ${proc.exitCode}`);
  process.exit(proc.exitCode ?? 1);
}

// ── Write a minimal package.json next to the binary ───────────────────
// Some bundled dependencies (e.g. express) probe for package.json at
// runtime. Provide a minimal one so the binary can self-resolve.
import { writeFileSync } from "node:fs";
writeFileSync(
  join(outDir, "package.json"),
  JSON.stringify({ name: "hai", version: "0.1.0", type: "module" }, null, 2) + "\n",
);

console.log(`\n✓ Built: ${outBinary}`);
console.log(`  Assets: ${dashboardClientDest}`);
console.log(`\nRun with: ${outBinary} --help`);
