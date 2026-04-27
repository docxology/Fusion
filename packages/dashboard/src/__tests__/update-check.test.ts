import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearUpdateCheckCache,
  performUpdateCheck,
  readCachedUpdateCheck,
  type UpdateCheckResult,
} from "../update-check.js";

describe("update-check", () => {
  let fusionDir: string;

  beforeEach(async () => {
    fusionDir = await mkdtemp(join(tmpdir(), "fn-update-check-"));
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    await clearUpdateCheckCache(fusionDir);
    vi.restoreAllMocks();
  });

  it("returns cached result when cache is still fresh", async () => {
    const cached: UpdateCheckResult = {
      currentVersion: "0.6.0",
      latestVersion: "0.7.0",
      updateAvailable: true,
      lastChecked: Date.now(),
    };

    await writeFile(join(fusionDir, "update-check.json"), JSON.stringify(cached), "utf-8");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await performUpdateCheck(fusionDir, "0.6.0");

    expect(result).toEqual(cached);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fetches latest version when cache is expired", async () => {
    const stale: UpdateCheckResult = {
      currentVersion: "0.6.0",
      latestVersion: "0.6.0",
      updateAvailable: false,
      lastChecked: Date.now() - 25 * 60 * 60 * 1000,
    };

    await writeFile(join(fusionDir, "update-check.json"), JSON.stringify(stale), "utf-8");

    const fetchSpy = vi.fn().mockResolvedValue({
      json: async () => ({
        "dist-tags": {
          latest: "0.8.0",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const result = await performUpdateCheck(fusionDir, "0.6.0");

    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(result.latestVersion).toBe("0.8.0");
    expect(result.updateAvailable).toBe(true);
  });

  it("handles semver comparisons for equal, newer, and older registry versions", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    fetchSpy.mockResolvedValueOnce({
      json: async () => ({ "dist-tags": { latest: "1.2.3" } }),
    });
    const equalResult = await performUpdateCheck(fusionDir, "1.2.3");
    expect(equalResult.updateAvailable).toBe(false);

    await clearUpdateCheckCache(fusionDir);
    fetchSpy.mockResolvedValueOnce({
      json: async () => ({ "dist-tags": { latest: "1.2.4" } }),
    });
    const newerResult = await performUpdateCheck(fusionDir, "1.2.3");
    expect(newerResult.updateAvailable).toBe(true);

    await clearUpdateCheckCache(fusionDir);
    fetchSpy.mockResolvedValueOnce({
      json: async () => ({ "dist-tags": { latest: "1.2.2" } }),
    });
    const olderResult = await performUpdateCheck(fusionDir, "1.2.3");
    expect(olderResult.updateAvailable).toBe(false);
  });

  it("returns a non-throwing error result when network fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    await expect(performUpdateCheck(fusionDir, "0.6.0")).resolves.toEqual(
      expect.objectContaining({
        currentVersion: "0.6.0",
        latestVersion: null,
        updateAvailable: false,
        error: "network down",
      }),
    );
  });

  it("clearUpdateCheckCache removes the cache file", async () => {
    const cachePath = join(fusionDir, "update-check.json");
    await writeFile(cachePath, JSON.stringify({ ok: true }), "utf-8");

    await clearUpdateCheckCache(fusionDir);

    expect(existsSync(cachePath)).toBe(false);
  });

  it("readCachedUpdateCheck returns null for missing file and parsed result when present", async () => {
    expect(readCachedUpdateCheck(fusionDir)).toBeNull();

    const value: UpdateCheckResult = {
      currentVersion: "0.6.0",
      latestVersion: "0.7.0",
      updateAvailable: true,
      lastChecked: 123,
    };

    await writeFile(join(fusionDir, "update-check.json"), JSON.stringify(value), "utf-8");

    expect(readCachedUpdateCheck(fusionDir)).toEqual(value);
  });

  it("persists fetched results to the cache file", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({ "dist-tags": { latest: "0.7.0" } }),
      }),
    );

    const result = await performUpdateCheck(fusionDir, "0.6.0");
    const cachedRaw = await readFile(join(fusionDir, "update-check.json"), "utf-8");

    expect(JSON.parse(cachedRaw)).toEqual(result);
  });
});
