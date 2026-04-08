import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const contextBridge = {
    exposeInMainWorld: vi.fn(),
  };

  const ipcRenderer = {
    invoke: vi.fn(),
    send: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  };

  return { contextBridge, ipcRenderer };
});

vi.mock("electron", () => ({
  contextBridge: mocks.contextBridge,
  ipcRenderer: mocks.ipcRenderer,
}));

async function importPreloadModule() {
  await import("../preload.ts");
}

function getExposedApi() {
  const call = mocks.contextBridge.exposeInMainWorld.mock.calls[0] as
    | [string, {
      getAppVersion: () => Promise<string>;
      quit: () => void;
      onDashboardReady: (callback: () => void) => () => void;
    }]
    | undefined;

  return call?.[1];
}

describe("preload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("contextBridge.exposeInMainWorld called with fusionDesktop", async () => {
    await importPreloadModule();

    expect(mocks.contextBridge.exposeInMainWorld).toHaveBeenCalledWith(
      "fusionDesktop",
      expect.any(Object),
    );
  });

  it("getAppVersion calls ipcRenderer.invoke", async () => {
    mocks.ipcRenderer.invoke.mockResolvedValue("0.1.0");
    await importPreloadModule();

    const api = getExposedApi();
    const version = await api?.getAppVersion();

    expect(version).toBe("0.1.0");
    expect(mocks.ipcRenderer.invoke).toHaveBeenCalledWith("app:get-version");
  });

  it("quit calls ipcRenderer.send", async () => {
    await importPreloadModule();

    const api = getExposedApi();
    api?.quit();

    expect(mocks.ipcRenderer.send).toHaveBeenCalledWith("app:quit");
  });

  it("onDashboardReady returns unsubscribe function", async () => {
    await importPreloadModule();

    const api = getExposedApi();
    const callback = vi.fn();
    const unsubscribe = api?.onDashboardReady(callback);

    expect(mocks.ipcRenderer.on).toHaveBeenCalledWith(
      "dashboard:ready",
      expect.any(Function),
    );
    expect(typeof unsubscribe).toBe("function");

    unsubscribe?.();

    expect(mocks.ipcRenderer.removeListener).toHaveBeenCalledWith(
      "dashboard:ready",
      expect.any(Function),
    );
  });
});
