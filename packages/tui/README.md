# @fusion/tui

Terminal UI components for fn, built with [Ink](https://github.com/vadimdemedes/ink) (React for the command line).

## Status

This package is under active development and not yet published.

## Terminal Compatibility

This package is designed for terminals with a minimum size of **80×24** characters:
- **Minimum width**: 80 columns
- **Minimum height**: 24 rows

When the terminal is smaller than these minimums, the UI enforces these bounds for layout calculations, ensuring consistent rendering across different terminal sizes.

## Responsive Layout

The TUI provides responsive layout utilities that adapt to terminal dimensions:

- **Minimum bounds**: Layouts always respect the 80×24 minimum, ensuring readability
- **Dynamic column widths**: Tables and lists compute column widths based on available space
- **Truncation with ellipsis**: Long content is automatically truncated with `…` (U+2026) when it exceeds the available width

## Installation

This package is part of the fn workspace and is not installed separately. It is available as a private workspace package.

## API Reference

### FusionProvider

The `FusionProvider` component initializes a `TaskStore` and provides it via React context.

```tsx
import { FusionProvider } from "@fusion/tui";

function App() {
  return (
    <FusionProvider>
      <MyComponent />
    </FusionProvider>
  );
}
```

#### Props

| Prop | Type | Description |
|------|------|-------------|
| `projectDir` | `string` (optional) | Explicit project directory override. When provided, skips auto-detection. |
| `children` | `React.ReactNode` | Child components that will have access to the Fusion context. |

#### Behavior

- On mount, auto-detects the Fusion project by walking up from `process.cwd()` looking for `.fusion/fusion.db`
- If no project is found, renders a red error message
- On unmount, calls `store.close()` to cleanly shut down the SQLite connection

### useFusion

Hook to access the Fusion context. Must be used within a `FusionProvider`.

```tsx
import { useFusion } from "@fusion/tui";

function TaskList() {
  const { store, projectPath } = useFusion();

  useEffect(() => {
    store.listTasks().then((tasks) => {
      // Render tasks...
    });
  }, [store]);

  return <Text>Project: {projectPath}</Text>;
}
```

#### Returns

| Property | Type | Description |
|----------|------|-------------|
| `store` | `TaskStore` | The initialized TaskStore instance |
| `projectPath` | `string` | Absolute path to the project directory |

#### Throws

`Error` if used outside of a `FusionProvider`.

### detectProjectDir

Detect the Fusion project root directory by walking up from a starting path.

```typescript
import { detectProjectDir } from "@fusion/tui";

// Find project from current directory
const projectPath = detectProjectDir();

// Find project from a specific directory
const projectPath = detectProjectDir("/Users/me/code/my-project/src");
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `startPath` | `string` (optional) | Starting directory for the search (defaults to `process.cwd()`) |

#### Returns

The absolute path to the project root, or `null` if no project directory is detected.

### ScreenRouter

The `ScreenRouter` component provides a keyboard-navigable tab bar for switching between application screens.

```tsx
import { ScreenRouter } from "@fusion/tui";

function App() {
  return (
    <ScreenRouter>
      {({ activeScreen }) => (
        <>
          {activeScreen === "board" && <BoardScreen />}
          {activeScreen === "detail" && <DetailScreen />}
          {activeScreen === "activity" && <ActivityScreen />}
          {activeScreen === "agents" && <AgentsScreen />}
          {activeScreen === "settings" && <SettingsScreen />}
        </>
      )}
    </ScreenRouter>
  );
}
```

#### Available Screens

The router manages five screens in this order:

| Index | Screen ID | Label | Shortcut |
|-------|-----------|-------|----------|
| 1 | `board` | Board | `1` |
| 2 | `detail` | Detail | `2` |
| 3 | `activity` | Activity | `3` |
| 4 | `agents` | Agents | `4` |
| 5 | `settings` | Settings | `5` |

#### Keyboard Navigation

| Key | Action |
|-----|--------|
| `1` - `5` | Jump directly to the corresponding tab |
| `Tab` | Cycle forward through tabs (wraps from end to start) |
| `Shift+Tab` | Cycle backward through tabs (wraps from start to end) |

#### Tab Bar Rendering

The tab bar displays all five tabs horizontally with:
- Active tab highlighted with bold text, cyan background, and black text
- Inactive tabs shown in white text
- A border line below the tab bar

#### Props

| Prop | Type | Description |
|------|------|-------------|
| `initialScreen` | `ScreenId` (optional) | Initial screen to display on mount (default: `"board"`) |
| `onScreenChange` | `(screenId: ScreenId) => void` (optional) | Callback when user navigates to a different screen |
| `activeScreen` | `ScreenId` (optional) | Externally controlled active screen |
| `children` | `(props: ScreenComponentProps) => React.ReactNode` | Render function that receives `activeScreen` and returns the screen content |

#### ScreenComponentProps

| Property | Type | Description |
|----------|------|-------------|
| `activeScreen` | `ScreenId` | The currently active screen ID (`"board"` \| `"detail"` \| `"activity"` \| `"agents"` \| `"settings"`) |

#### Exports

The following are exported from `@fusion/tui`:
- `ScreenRouter` — The main router component
- `SCREENS` — Array of screen definitions with `id`, `label`, and `shortcut`
- `getScreenById(id)` — Get screen definition by ID
- `getScreenIndex(id)` — Get screen index by ID
- `type ScreenId` — Type for screen identifiers

### Global Keyboard Shortcuts

The TUI provides centralized global keyboard shortcuts via the `useGlobalShortcuts` hook. Place this hook at the app root level to enable consistent shortcut handling across all screens.

```tsx
import { useGlobalShortcuts, HelpOverlay } from "@fusion/tui";

function App() {
  const { helpVisible, toggleHelp } = useGlobalShortcuts({
    onScreenChange: setActiveScreen,
  });

  return (
    <>
      {helpVisible && <HelpOverlay onClose={toggleHelp} />}
      <ScreenRouter ... />
    </>
  );
}
```

#### Available Shortcuts

| Key | Action | Focus Guard |
|-----|--------|-------------|
| `Ctrl+C` | Quit (emergency exit) | Always works |
| `q` | Quit | Only when no text input focused |
| `?` | Toggle help overlay | Only when no text input focused |
| `h` | Toggle help overlay (alternate) | Only when no text input focused |
| `1` - `5` | Switch screens | Only when no text input focused |

#### Focus Guard

Global shortcuts (except `Ctrl+C`) are suppressed when text input is focused. This prevents accidental navigation while typing.

To enable focus guarding for text inputs, import `FocusGuardRef` and set `isFocused` on focus/blur events:

```tsx
import { FocusGuardRef } from "@fusion/tui";

function TextInput() {
  return (
    <Input
      onFocus={() => { FocusGuardRef.isFocused = true; }}
      onBlur={() => { FocusGuardRef.isFocused = false; }}
    />
  );
}
```

#### useGlobalShortcuts Hook

```tsx
const result = useGlobalShortcuts({
  onScreenChange: (screenId) => {
    // Handle screen switch triggered by number keys
  },
});
```

##### Options

| Property | Type | Description |
|----------|------|-------------|
| `onScreenChange` | `(screenId: ScreenId) => void` (optional) | Callback when user presses 1-5 to switch screens |

##### Returns

| Property | Type | Description |
|----------|------|-------------|
| `helpVisible` | `boolean` | Whether the help overlay is currently visible |
| `toggleHelp` | `() => void` | Toggle the help overlay visibility |
| `hideHelp` | `() => void` | Hide the help overlay |

#### HelpOverlay Component

The `HelpOverlay` component displays available keyboard shortcuts. It handles `Escape` and `q` to close.

```tsx
<HelpOverlay onClose={toggleHelp} />
```

##### Props

| Property | Type | Description |
|----------|------|-------------|
| `onClose` | `() => void` | Callback to close the overlay |

#### Exports

The following are exported from `@fusion/tui`:
- `useGlobalShortcuts` — Hook for handling global keyboard shortcuts
- `HelpOverlay` — Component for displaying keyboard shortcuts
- `FocusGuardRef` — Shared ref for tracking text input focus state

## Example

```tsx
import React, { useState } from "react";
import { render, Box } from "ink";
import { FusionProvider, useFusion, ScreenRouter, useGlobalShortcuts, HelpOverlay, ResponsiveHeader, ResponsiveTable, ResponsiveStatusBar } from "@fusion/tui";

function App() {
  const { projectPath } = useFusion();
  const [activeScreen, setActiveScreen] = useState("board");

  // Global keyboard shortcuts
  const { helpVisible, toggleHelp } = useGlobalShortcuts({
    onScreenChange: setActiveScreen,
  });

  return (
    <Box flexDirection="column">
      {/* Help overlay */}
      {helpVisible && (
        <Box marginBottom={1}>
          <HelpOverlay onClose={toggleHelp} />
        </Box>
      )}

      {/* Responsive header */}
      <ResponsiveHeader title={`Fusion TUI | Project: ${projectPath}`} />

      {/* Screen router */}
      <ScreenRouter
        activeScreen={activeScreen}
        onScreenChange={setActiveScreen}
      >
        {({ activeScreen }) => (
          <Box flexDirection="column">
            {activeScreen === "board" && (
              <ResponsiveTable
                columns={[
                  { header: "ID", minWidth: 10 },
                  { header: "Description", minWidth: 30, canGrow: true },
                  { header: "Status", minWidth: 12 },
                ]}
                rows={[
                  ["FN-001", "Implement feature", "todo"],
                  ["FN-002", "Fix bug in auth", "done"],
                ]}
              />
            )}
            {activeScreen === "detail" && (
              <Box>
                <Text>Detail Screen</Text>
              </Box>
            )}
          </Box>
        )}
      </ScreenRouter>

      {/* Responsive status bar */}
      <ResponsiveStatusBar />
    </Box>
  );
}

render(
  <FusionProvider>
    <App />
  </FusionProvider>
);
```

## Responsive Layout Utilities

The TUI provides utilities for building responsive layouts that adapt to terminal dimensions.

### useTerminalDimensions

Hook to read live terminal dimensions from Ink's `useStdout()` with minimum bounds applied.

```tsx
import { useTerminalDimensions } from "@fusion/tui";

function MyComponent() {
  const { columns, rows, isMinimumSize, extraColumns } = useTerminalDimensions();

  return (
    <Box>
      <Text>Terminal: {columns}x{rows}</Text>
      {!isMinimumSize && <Text dimColor> (wider than minimum)</Text>}
    </Box>
  );
}
```

#### Returns

| Property | Type | Description |
|----------|------|-------------|
| `columns` | `number` | Effective column count (minimum 80) |
| `rows` | `number` | Effective row count (minimum 24) |
| `isMinimumSize` | `boolean` | Whether terminal meets minimum size |
| `extraColumns` | `number` | Extra columns beyond the 80-column minimum |

### computeColumnLayout

Calculate column widths based on terminal dimensions and column definitions.

```tsx
import { computeColumnLayout } from "@fusion/tui";

const layout = computeColumnLayout(120, [
  { minWidth: 10, canGrow: false },                    // Fixed-width ID column
  { minWidth: 30, canGrow: true, growWeight: 2 },     // Description (grows 2x)
  { minWidth: 15, canGrow: true },                     // Status (grows 1x)
]);

console.log(layout.widths); // e.g., [10, 63, 47]
console.log(layout.totalWidth); // 120
```

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `columns` | `number` | Available terminal columns |
| `definitions` | `ColumnDefinition[]` | Column definitions with minWidth, preferredWidth, canGrow, growWeight |
| `strategy` | `ColumnStrategy` | Allocation strategy: `"equal"`, `"fixed"`, `"proportional"`, `"content-heavy"` |

#### Returns

| Property | Type | Description |
|----------|------|-------------|
| `widths` | `number[]` | Calculated width for each column |
| `totalWidth` | `number` | Total width used by all columns |
| `remainingColumns` | `number` | Leftover columns after minimum allocations |

### truncateText

Truncate text to a maximum width with ellipsis.

```tsx
import { truncateText } from "@fusion/tui";

truncateText("Hello World", 8);     // "Hello W…"
truncateText("Hi", 10);            // "Hi" (fits)
truncateText("Hello", 2);          // "…" (too short)
truncateText("Hello World", 10, "~~"); // "Hello Wo~~" (custom ellipsis)
```

### Responsive Components

#### ResponsiveHeader

A header component that adapts to terminal width.

```tsx
import { ResponsiveHeader } from "@fusion/tui";

<ResponsiveHeader title="My App" />
```

#### ResponsiveTable

A table component with responsive column widths and truncation.

```tsx
import { ResponsiveTable } from "@fusion/tui";

<ResponsiveTable
  columns={[
    { header: "ID", minWidth: 10 },
    { header: "Description", minWidth: 30, canGrow: true },
    { header: "Status", minWidth: 12 },
  ]}
  rows={[
    ["FN-001", "Implement feature", "todo"],
    ["FN-002", "Fix bug in auth", "done"],
  ]}
/>
```

#### ResponsiveStatusBar

A status bar showing current terminal dimensions.

```tsx
import { ResponsiveStatusBar } from "@fusion/tui";

<ResponsiveStatusBar />
// Displays: "Terminal: 120x40 | Minimum: 80x24"
```

### Exports

The following are exported from `@fusion/tui`:
- `useTerminalDimensions` — Hook for reading terminal dimensions
- `computeColumnLayout` — Function for calculating column widths
- `truncateText` — Function for truncating text with ellipsis
- `ResponsiveHeader` — Header component with responsive content
- `ResponsiveTable` — Table component with responsive columns
- `ResponsiveTaskRow` — Task row with truncation
- `ResponsiveStatusBar` — Status bar showing terminal info
- `MIN_TERMINAL_COLUMNS` — Minimum supported terminal width (80)
- `MIN_TERMINAL_ROWS` — Minimum supported terminal height (24)
