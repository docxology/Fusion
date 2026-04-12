import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const workspaceRoot = join(__dirname, "..", "..", "..", "..");

function listSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(dir, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      if (entry === "__tests__" || entry === "dist" || entry === "node_modules") {
        continue;
      }
      files.push(...listSourceFiles(path));
      continue;
    }

    if (!/\.(ts|tsx)$/.test(entry) || /\.test\.(ts|tsx)$/.test(entry)) {
      continue;
    }

    files.push(path);
  }

  return files;
}

describe("architecture hot-path contracts", () => {
  it("keeps production listTasks() callers explicit about payload shape", () => {
    const sourceRoots = [
      "packages/cli/src",
      "packages/dashboard/app",
      "packages/dashboard/src",
      "packages/engine/src",
    ];
    const bareListTaskCalls: string[] = [];

    for (const root of sourceRoots) {
      for (const file of listSourceFiles(join(workspaceRoot, root))) {
        const content = readFileSync(file, "utf-8");
        const lines = content.split("\n");

        lines.forEach((line, index) => {
          if (/\.\s*listTasks\(\)/.test(line)) {
            bareListTaskCalls.push(`${relative(workspaceRoot, file)}:${index + 1}`);
          }
        });
      }
    }

    expect(bareListTaskCalls).toEqual([]);
  });
});
