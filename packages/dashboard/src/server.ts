import express from "express";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { TaskStore, MergeResult } from "@hai/core";
import { createApiRoutes } from "./routes.js";
import { createSSE } from "./sse.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface ServerOptions {
  /** Custom merge handler — when provided, used instead of store.mergeTask */
  onMerge?: (taskId: string) => Promise<MergeResult>;
  /** Maximum concurrent worktrees / execution slots (default 2) */
  maxConcurrent?: number;
  /** Enable Vite dev server with HMR (default: false) */
  dev?: boolean;
}

export async function createServer(store: TaskStore, options?: ServerOptions) {
  const app = express();
  app.use(express.json());

  // SSE endpoint (before Vite middleware so it's not intercepted)
  app.get("/api/events", createSSE(store));

  // REST API
  app.use("/api", createApiRoutes(store, options));

  if (options?.dev) {
    // Dev mode: Vite middleware with HMR
    const { createServer: createViteServer } = await import("vite");
    const appDir = join(__dirname, "..", "app");
    const vite = await createViteServer({
      root: appDir,
      server: { middlewareMode: true },
      appType: "custom",
    });
    app.use(vite.middlewares);

    // SPA fallback — serve index.html through Vite's transform pipeline
    app.use(async (_req, res) => {
      const htmlPath = join(appDir, "index.html");
      let html = await readFile(htmlPath, "utf-8");
      html = await vite.transformIndexHtml(_req.originalUrl, html);
      res.status(200).set({ "Content-Type": "text/html" }).end(html);
    });
  } else {
    // Production: serve pre-built static files
    const clientDir = existsSync(join(__dirname, "..", "dist", "client"))
      ? join(__dirname, "..", "dist", "client")
      : existsSync(join(__dirname, "..", "client"))
        ? join(__dirname, "..", "client")
        : join(__dirname, "..", "public");

    app.use(express.static(clientDir));
    app.get("/{*splat}", (_req, res) => {
      res.sendFile(join(clientDir, "index.html"));
    });
  }

  return app;
}
