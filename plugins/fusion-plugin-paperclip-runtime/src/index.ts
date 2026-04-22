/**
 * Paperclip Runtime Plugin
 *
 * Provides the Paperclip web access runtime for Fusion AI agents.
 * This is a placeholder implementation — full runtime behavior is deferred to FN-2261.
 */

import { definePlugin } from "@fusion/plugin-sdk";
import type {
  FusionPlugin,
  PluginRuntimeRegistration,
} from "@fusion/plugin-sdk";

// ── Runtime Placeholder ────────────────────────────────────────────────────────

/**
 * Deferred implementation error message for Paperclip runtime.
 * This message is thrown when the runtime factory is invoked before
 * full implementation is complete (FN-2261).
 */
const DEFERRED_ERROR_MESSAGE =
  "Paperclip runtime implementation is deferred to FN-2261. " +
  "This is a placeholder plugin — runtime creation is not yet available.";

/**
 * Paperclip runtime factory placeholder.
 *
 * Throws a deterministic error indicating that the full Paperclip runtime
 * implementation has not been completed yet.
 *
 * @throws Error with DEFERRED_ERROR_MESSAGE when invoked
 */
async function paperclipRuntimeFactory(): Promise<never> {
  throw new Error(DEFERRED_ERROR_MESSAGE);
}

/**
 * Paperclip runtime registration for Fusion's plugin runtime system.
 * Uses the PluginRuntimeRegistration contract from FN-2256.
 */
const paperclipRuntime: PluginRuntimeRegistration = {
  metadata: {
    runtimeId: "paperclip",
    name: "Paperclip Runtime",
    description:
      "Web access runtime for AI agents — browse pages and extract content using headless browser automation",
    version: "0.1.0",
  },
  factory: paperclipRuntimeFactory,
};

// ── Plugin Definition ─────────────────────────────────────────────────────────

const plugin: FusionPlugin = definePlugin({
  manifest: {
    id: "fusion-plugin-paperclip-runtime",
    name: "Paperclip Runtime Plugin",
    version: "0.1.0",
    description: "Provides Paperclip web access runtime for Fusion AI agents",
    author: "Fusion Team",
    homepage: "https://github.com/gsxdsm/fusion",
    fusionVersion: ">=0.1.0",
    runtime: {
      runtimeId: "paperclip",
      name: "Paperclip Runtime",
      description:
        "Web access runtime for AI agents — browse pages and extract content",
      version: "0.1.0",
    },
  },
  state: "installed",
  runtime: paperclipRuntime,
  hooks: {
    onLoad: (ctx) => {
      ctx.logger.info(
        "Paperclip Runtime Plugin loaded (placeholder — implementation deferred to FN-2261)",
      );
    },
  },
});

export default plugin;
