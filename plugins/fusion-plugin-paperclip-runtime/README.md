# Paperclip Runtime Plugin

A Fusion plugin that provides the Paperclip runtime for AI agents. Paperclip enables AI agents to browse web pages and extract content through a headless browser interface.

## Status

> **Note:** This plugin is currently a scaffold with a placeholder runtime. Full Paperclip runtime implementation is deferred to FN-2261.

## Installation

This plugin is installed as a local plugin:

```bash
fn plugin add ./plugins/fusion-plugin-paperclip-runtime
```

## Runtime Capabilities

When fully implemented, this runtime will provide:

- **Web Page Browsing**: Navigate to URLs and retrieve page content
- **Content Extraction**: Extract specific information from web pages using CSS selectors or XPath
- **Form Interaction**: Fill and submit web forms
- **JavaScript Rendering**: Execute JavaScript to render dynamic content

## Development

### Build

```bash
pnpm --filter ./plugins/fusion-plugin-paperclip-runtime build
```

### Test

```bash
pnpm --filter ./plugins/fusion-plugin-paperclip-runtime test
```

## Architecture

This plugin follows the Fusion plugin runtime contract defined in FN-2256. It registers a runtime factory that creates Paperclip runtime instances on demand.

### Runtime Contract

- **Runtime ID**: `paperclip`
- **Factory**: `PluginRuntimeFactory` from `@fusion/plugin-sdk`

## Deferred Work

Full runtime implementation including:
- Browser automation setup
- Content extraction logic
- Session management
- Error handling and retry logic

These are tracked in [FN-2261](https://github.com/gsxdsm/fusion/issues/FN-2261).
