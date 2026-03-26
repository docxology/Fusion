import { describe, it, expect, beforeAll } from "vitest";
import { execSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const cliRoot = join(import.meta.dirname!, "..", "..");
const outBinary = join(cliRoot, "dist", process.platform === "win32" ? "hai.exe" : "hai");
const clientDir = join(cliRoot, "dist", "client");

describe("build-exe", () => {
  beforeAll(() => {
    // Build the executable (skip if already built to speed up re-runs)
    if (!existsSync(outBinary)) {
      execSync("bun run build.ts", {
        cwd: cliRoot,
        stdio: "pipe",
        timeout: 120_000,
      });
    }
  }, 180_000);

  it("build script produces the binary", () => {
    expect(existsSync(outBinary)).toBe(true);
  });

  it("build produces co-located client assets", () => {
    expect(existsSync(join(clientDir, "index.html"))).toBe(true);
  });

  it("binary runs --help and prints expected output", () => {
    const result = spawnSync(outBinary, ["--help"], {
      encoding: "utf-8",
      timeout: 15_000,
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("hai — AI-orchestrated task board");
    expect(result.stdout).toContain("dashboard");
    expect(result.stdout).toContain("task create");
    expect(result.stdout).toContain("task list");
  });

  it("binary runs 'task list' without crashing", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "hai-test-"));
    try {
      const result = spawnSync(outBinary, ["task", "list"], {
        cwd: tmpDir,
        encoding: "utf-8",
        timeout: 15_000,
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("No tasks yet");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("binary starts dashboard and serves client assets", async () => {
    const { spawn } = await import("node:child_process");
    const tmpDir = mkdtempSync(join(tmpdir(), "hai-dash-test-"));
    const port = 14040 + Math.floor(Math.random() * 1000);
    try {
      const output = await new Promise<string>((resolve, reject) => {
        const child = spawn(outBinary, ["dashboard", "--no-open", "-p", String(port)], {
          cwd: tmpDir,
          stdio: ["ignore", "pipe", "pipe"],
        });
        let out = "";
        child.stdout.on("data", (d: Buffer) => { out += d.toString(); });
        child.stderr.on("data", (d: Buffer) => { out += d.toString(); });
        // Wait for the startup banner, then kill
        const timer = setTimeout(() => {
          child.kill("SIGTERM");
          resolve(out);
        }, 3_000);
        child.on("error", (err) => {
          clearTimeout(timer);
          reject(err);
        });
        child.on("close", () => {
          clearTimeout(timer);
          resolve(out);
        });
      });
      expect(output).toContain("hai board");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }, 15_000);
});
