import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, renameSync } from "node:fs";
import { join } from "node:path";
import vitestConfig from "../../vitest.config";

const cliRoot = join(__dirname, "..", "..");
const workspaceRoot = join(cliRoot, "..", "..");

const internalPackages = ["core", "engine", "dashboard"] as const;
const movedDistDirs: Array<{ from: string; to: string }> = [];

function hideInternalPackageDistDirs() {
  for (const pkg of internalPackages) {
    const distPath = join(workspaceRoot, "packages", pkg, "dist");
    if (!existsSync(distPath)) {
      continue;
    }

    const hiddenPath = `${distPath}.__fn2360-hidden-${process.pid}`;
    renameSync(distPath, hiddenPath);
    movedDistDirs.push({ from: distPath, to: hiddenPath });
  }
}

function restoreInternalPackageDistDirs() {
  for (let i = movedDistDirs.length - 1; i >= 0; i--) {
    const { from, to } = movedDistDirs[i];
    if (existsSync(to)) {
      renameSync(to, from);
    }
  }
  movedDistDirs.length = 0;
}

describe("CLI Vitest workspace resolution", () => {
  beforeAll(() => {
    hideInternalPackageDistDirs();
  });

  afterAll(() => {
    restoreInternalPackageDistDirs();
  });

  it("uses exact source-entry aliases for internal workspace packages", () => {
    const aliases = vitestConfig.resolve?.alias;
    expect(Array.isArray(aliases)).toBe(true);

    const normalized = (aliases ?? []).map((entry) => ({
      find: String(entry.find),
      replacement: String(entry.replacement),
    }));

    expect(normalized).toEqual(
      expect.arrayContaining([
        {
          find: String(/^@fusion\/core\/gh-cli$/),
          replacement: join(workspaceRoot, "packages", "core", "src", "gh-cli.ts"),
        },
        {
          find: String(/^@fusion\/core$/),
          replacement: join(workspaceRoot, "packages", "core", "src", "index.ts"),
        },
        {
          find: String(/^@fusion\/engine$/),
          replacement: join(workspaceRoot, "packages", "engine", "src", "index.ts"),
        },
        {
          find: String(/^@fusion\/dashboard$/),
          replacement: join(workspaceRoot, "packages", "dashboard", "src", "index.ts"),
        },
        {
          find: String(/^@fusion\/dashboard\/planning$/),
          replacement: join(workspaceRoot, "packages", "dashboard", "src", "planning.ts"),
        },
      ]),
    );

    const coreGhCliIndex = normalized.findIndex((entry) => entry.find === String(/^@fusion\/core\/gh-cli$/));
    const coreIndex = normalized.findIndex((entry) => entry.find === String(/^@fusion\/core$/));
    const planningIndex = normalized.findIndex((entry) => entry.find === String(/^@fusion\/dashboard\/planning$/));
    const dashboardIndex = normalized.findIndex((entry) => entry.find === String(/^@fusion\/dashboard$/));

    expect(coreGhCliIndex).toBeGreaterThanOrEqual(0);
    expect(coreIndex).toBeGreaterThan(coreGhCliIndex);
    expect(planningIndex).toBeGreaterThanOrEqual(0);
    expect(dashboardIndex).toBeGreaterThan(planningIndex);
  });

  it("resolves internal workspace imports during CLI tests when dist outputs are absent", async () => {
    await expect(import("@fusion/core")).resolves.toBeTruthy();
    await expect(import("@fusion/core/gh-cli")).resolves.toBeTruthy();
    await expect(import("@fusion/engine")).resolves.toBeTruthy();
    await expect(import("@fusion/dashboard")).resolves.toBeTruthy();
    await expect(import("@fusion/dashboard/planning")).resolves.toBeTruthy();
  }, 30_000);
});
