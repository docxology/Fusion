import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  root: "app",
  plugins: [react()],
  resolve: {
    alias: {
      "@fusion/core": resolve(__dirname, "../core/src/types.ts"),
    },
  },
  optimizeDeps: {
    include: [
      "@xterm/xterm",
      "@xterm/addon-fit",
      "@xterm/addon-web-links",
      "@xterm/addon-webgl",
    ],
  },
  build: {
    outDir: "../dist/client",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
