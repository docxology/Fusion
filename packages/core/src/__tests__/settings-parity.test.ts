import { describe, expect, it } from "vitest";
import {
  DEFAULT_GLOBAL_SETTINGS,
  DEFAULT_PROJECT_SETTINGS,
  GLOBAL_SETTINGS_KEYS,
  PROJECT_SETTINGS_KEYS,
  isGlobalSettingsKey,
  isProjectSettingsKey,
} from "../types.js";

function assertExactKeyCoverage(scopeName: string, actual: readonly string[], expected: readonly string[]): void {
  const uniqueActual = [...new Set(actual)];
  const uniqueExpected = [...new Set(expected)];

  const missing = uniqueExpected.filter((key) => !uniqueActual.includes(key));
  const extra = uniqueActual.filter((key) => !uniqueExpected.includes(key));
  const duplicates = actual.filter((key, index) => actual.indexOf(key) !== index);

  if (missing.length > 0 || extra.length > 0 || duplicates.length > 0) {
    throw new Error(
      [
        `${scopeName} parity mismatch`,
        `Missing: ${missing.length ? missing.join(", ") : "(none)"}`,
        `Extra: ${extra.length ? extra.join(", ") : "(none)"}`,
        `Duplicates: ${duplicates.length ? [...new Set(duplicates)].join(", ") : "(none)"}`,
      ].join("\n"),
    );
  }
}

describe("settings key parity", () => {
  it("GLOBAL_SETTINGS_KEYS is derived from the global settings defaults", () => {
    assertExactKeyCoverage(
      "GLOBAL_SETTINGS_KEYS",
      GLOBAL_SETTINGS_KEYS as readonly string[],
      Object.keys(DEFAULT_GLOBAL_SETTINGS),
    );
  });

  it("PROJECT_SETTINGS_KEYS is derived from the project settings defaults", () => {
    assertExactKeyCoverage(
      "PROJECT_SETTINGS_KEYS",
      PROJECT_SETTINGS_KEYS as readonly string[],
      Object.keys(DEFAULT_PROJECT_SETTINGS),
    );
  });

  it("identifies settings scopes", () => {
    expect(isGlobalSettingsKey("themeMode")).toBe(true);
    expect(isGlobalSettingsKey("maxConcurrent")).toBe(false);
    expect(isProjectSettingsKey("maxConcurrent")).toBe(true);
    expect(isProjectSettingsKey("themeMode")).toBe(false);
  });

  it("No key appears in both GLOBAL_SETTINGS_KEYS and PROJECT_SETTINGS_KEYS", () => {
    const projectKeySet = new Set(PROJECT_SETTINGS_KEYS as readonly string[]);
    const overlap = (GLOBAL_SETTINGS_KEYS as readonly string[]).filter((key) => projectKeySet.has(key));
    expect(overlap).toEqual([]);
  });
});
