import { contextBridge, ipcRenderer } from "electron";

export interface FusionDesktopAPI {
  getAppVersion(): Promise<string>;
  quit(): void;
  onDashboardReady(callback: () => void): () => void;
}

const api: FusionDesktopAPI = {
  getAppVersion(): Promise<string> {
    return ipcRenderer.invoke("app:get-version");
  },
  quit(): void {
    ipcRenderer.send("app:quit");
  },
  onDashboardReady(callback: () => void): () => void {
    const listener = () => callback();
    ipcRenderer.on("dashboard:ready", listener);
    return () => {
      ipcRenderer.removeListener("dashboard:ready", listener);
    };
  },
};

contextBridge.exposeInMainWorld("fusionDesktop", api);
