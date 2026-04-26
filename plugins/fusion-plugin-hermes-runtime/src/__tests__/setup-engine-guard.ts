/**
 * Engine import guard for plugin tests.
 *
 * Runtime plugin tests mock the seam module (../pi-module.js) to avoid loading
 * the real @fusion/engine, which pulls in @fusion/core and triggers homedir()-
 * based path resolution. This setup file installs a global vi.mock on
 * @fusion/engine that throws if the real module is ever loaded without an
 * explicit override.
 *
 * If you see the guard error in a test:
 *   1. Add `vi.mock("../pi-module.js", ...)` at the top of the failing test
 *   2. If you genuinely need to import @fusion/engine, you must also add HOME
 *      isolation setup (see setup-test-isolation.ts in packages/core) to this
 *      plugin's vitest config setupFiles before the guard.
 */
import { vi } from "vitest";

vi.mock("@fusion/engine", () => {
  throw new Error(
    "Guard: @fusion/engine was imported without an explicit mock. " +
      "Runtime plugin tests must mock '../pi-module.js' to prevent loading " +
      "the real engine. If you need the real engine, add HOME isolation " +
      "setup (setup-test-isolation.ts) to vitest config setupFiles BEFORE " +
      "this guard, and remove or override this mock.",
  );
});
