/**
 * TUI Utility modules.
 */

export {
  useTerminalDimensions,
  computeColumnLayout,
  type TerminalDimensions,
  type ColumnLayout,
  type ColumnDefinition,
  type ColumnStrategy,
  MIN_TERMINAL_COLUMNS,
  MIN_TERMINAL_ROWS,
} from "./terminal.js";

export {
  truncateText,
  truncateWithOptions,
  padText,
  fitText,
  DEFAULT_ELLIPSIS,
  type TruncateOptions,
} from "./truncate.js";
