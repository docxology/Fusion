import express from "express";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { TaskStore } from "@hai/core";
import { createApiRoutes } from "./routes.js";
import { createSSE } from "./sse.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createServer(store: TaskStore): ReturnType<typeof express> {
  const app = express();

  app.use(express.json());
  // Serve built React app — check both possible locations
  const clientDir = existsSync(join(__dirname, "..", "dist", "client"))
    ? join(__dirname, "..", "dist", "client")
    : existsSync(join(__dirname, "..", "client"))
      ? join(__dirname, "..", "client")
      : join(__dirname, "..", "public"); // fallback to old public dir

  app.use(express.static(clientDir));

  // SSE endpoint
  app.get("/api/events", createSSE(store));

  // REST API
  app.use("/api", createApiRoutes(store));

  // SPA fallback
  app.get("/{*splat}", (_req, res) => {
    res.sendFile(join(clientDir, "index.html"));
  });

  return app;
}
