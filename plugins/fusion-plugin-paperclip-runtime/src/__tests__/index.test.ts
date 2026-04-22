import { describe, it, expect } from "vitest";
import plugin from "../index.js";

// ── Test Suite ─────────────────────────────────────────────────────────────────

describe("paperclip-runtime plugin", () => {
  describe("plugin manifest identity", () => {
    it("should export a valid FusionPlugin with correct manifest fields", () => {
      expect(plugin.manifest.id).toBe("fusion-plugin-paperclip-runtime");
      expect(plugin.manifest.name).toBe("Paperclip Runtime Plugin");
      expect(plugin.manifest.version).toBe("0.1.0");
      expect(plugin.manifest.description).toBe(
        "Provides Paperclip web access runtime for Fusion AI agents",
      );
      expect(plugin.manifest.author).toBe("Fusion Team");
      expect(plugin.state).toBe("installed");
    });

    it("should have runtime manifest metadata matching manifest.json", () => {
      expect(plugin.manifest.runtime).toBeDefined();
      expect(plugin.manifest.runtime!.runtimeId).toBe("paperclip");
      expect(plugin.manifest.runtime!.name).toBe("Paperclip Runtime");
      expect(plugin.manifest.runtime!.version).toBe("0.1.0");
    });

    it("should have fusionVersion requirement", () => {
      expect(plugin.manifest.fusionVersion).toBe(">=0.1.0");
    });
  });

  describe("runtime placeholder registration", () => {
    it("should have runtime registration", () => {
      expect(plugin.runtime).toBeDefined();
    });

    it("should have correct runtime metadata", () => {
      const runtime = plugin.runtime!;
      expect(runtime.metadata.runtimeId).toBe("paperclip");
      expect(runtime.metadata.name).toBe("Paperclip Runtime");
      expect(runtime.metadata.version).toBe("0.1.0");
    });

    it("should have a factory function", () => {
      expect(plugin.runtime!.factory).toBeDefined();
      expect(typeof plugin.runtime!.factory).toBe("function");
    });
  });

  describe("runtime placeholder invocation", () => {
    it("should throw deterministic error with FN-2261 reference when factory is invoked", async () => {
      const factory = plugin.runtime!.factory;

      await expect(factory({} as any)).rejects.toThrow(
        "Paperclip runtime implementation is deferred to FN-2261",
      );
    });

    it("should throw error with placeholder message in the error text", async () => {
      const factory = plugin.runtime!.factory;

      try {
        await factory({} as any);
        expect.fail("Expected factory to throw an error");
      } catch (error) {
        expect((error as Error).message).toContain("placeholder");
        expect((error as Error).message).toContain("FN-2261");
      }
    });
  });

  describe("hooks", () => {
    it("should have onLoad hook", () => {
      expect(plugin.hooks.onLoad).toBeDefined();
      expect(typeof plugin.hooks.onLoad).toBe("function");
    });

    it("onLoad should not throw when called with valid context", () => {
      const mockLogger = {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
      };
      const mockCtx = {
        pluginId: "fusion-plugin-paperclip-runtime",
        settings: {},
        logger: mockLogger,
        emitEvent: () => {},
        taskStore: {},
      };

      expect(() => plugin.hooks.onLoad!(mockCtx as any)).not.toThrow();
    });
  });
});
