# @fusion/desktop

Electron desktop shell for Fusion.

This package provides a native Electron wrapper around the existing Fusion dashboard web UI. The desktop shell currently connects to a running dashboard server and displays it inside a desktop window with tray integration.

## Prerequisites

Start the Fusion dashboard server first:

```bash
fn dashboard
```

Then, in another terminal, start the desktop app:

```bash
pnpm --filter @fusion/desktop dev
```

## Scripts

- `pnpm --filter @fusion/desktop dev` — run the Electron main process in development
- `pnpm --filter @fusion/desktop build` — compile TypeScript sources
- `pnpm --filter @fusion/desktop test` — run Vitest suite
- `pnpm --filter @fusion/desktop typecheck` — run TypeScript checks without emitting files
- `pnpm --filter @fusion/desktop pack` — build distributable package via electron-builder
- `pnpm --filter @fusion/desktop dist` — build distribution artifacts without publishing

## Environment

- `FUSION_DASHBOARD_URL` — override the default dashboard URL used by the desktop shell (`http://localhost:4040`)
