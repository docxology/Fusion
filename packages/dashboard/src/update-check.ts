import { readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const CACHE_FILENAME = "update-check.json";
const CHECK_TTL_MS = 24 * 60 * 60 * 1000;
const REGISTRY_URL = "https://registry.npmjs.org/@runfusion%2Ffusion";

export type UpdateCheckResult = {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  lastChecked: number;
  error?: string;
};

function getCachePath(fusionDir: string): string {
  return join(fusionDir, CACHE_FILENAME);
}

function parseVersion(version: string): number[] {
  return version
    .split(".")
    .slice(0, 3)
    .map((part) => Number.parseInt(part, 10))
    .map((value) => (Number.isFinite(value) ? value : 0));
}

function isRemoteNewer(remoteVersion: string, currentVersion: string): boolean {
  const remote = parseVersion(remoteVersion);
  const current = parseVersion(currentVersion);
  const maxLength = Math.max(remote.length, current.length, 3);

  for (let i = 0; i < maxLength; i += 1) {
    const remotePart = remote[i] ?? 0;
    const currentPart = current[i] ?? 0;
    if (remotePart > currentPart) return true;
    if (remotePart < currentPart) return false;
  }

  return false;
}

function isValidResult(value: unknown): value is UpdateCheckResult {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.currentVersion === "string" &&
    (typeof candidate.latestVersion === "string" || candidate.latestVersion === null) &&
    typeof candidate.updateAvailable === "boolean" &&
    typeof candidate.lastChecked === "number" &&
    (candidate.error === undefined || typeof candidate.error === "string")
  );
}

export function readCachedUpdateCheck(fusionDir: string): UpdateCheckResult | null {
  try {
    const raw = readFileSync(getCachePath(fusionDir), "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    return isValidResult(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function clearUpdateCheckCache(fusionDir: string): Promise<void> {
  await rm(getCachePath(fusionDir), { force: true });
}

export async function performUpdateCheck(fusionDir: string, currentVersion: string): Promise<UpdateCheckResult> {
  const now = Date.now();
  const cached = readCachedUpdateCheck(fusionDir);

  if (cached && now - cached.lastChecked < CHECK_TTL_MS) {
    return cached;
  }

  try {
    const response = await fetch(REGISTRY_URL);
    const payload = (await response.json()) as {
      "dist-tags"?: {
        latest?: string;
      };
    };

    const latestVersion = typeof payload?.["dist-tags"]?.latest === "string" ? payload["dist-tags"].latest : null;
    const updateAvailable = latestVersion ? isRemoteNewer(latestVersion, currentVersion) : false;

    const result: UpdateCheckResult = {
      currentVersion,
      latestVersion,
      updateAvailable,
      lastChecked: now,
    };

    await mkdir(fusionDir, { recursive: true });
    await writeFile(getCachePath(fusionDir), JSON.stringify(result, null, 2), "utf-8");

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      currentVersion,
      latestVersion: null,
      updateAvailable: false,
      lastChecked: now,
      error: message,
    };
  }
}
