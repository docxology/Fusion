/**
 * Responsive layout components for TUI.
 *
 * Provides components that adapt to terminal dimensions using the
 * terminal dimension and truncation utilities.
 */

import React from "react";
import { Box, Text } from "ink";
import { useTerminalDimensions, computeColumnLayout } from "../utils/terminal.js";
import { truncateText } from "../utils/truncate.js";

/**
 * ResponsiveHeader - A header that adapts to terminal width.
 *
 * At minimum width (80 columns), shows compact header.
 * At wider widths, shows additional context information.
 */
export function ResponsiveHeader({ title }: { title: string }): React.ReactNode {
  const { columns, isMinimumSize } = useTerminalDimensions();

  return (
    <Box flexDirection="column" paddingBottom={1}>
      <Box>
        <Text bold>{title}</Text>
        {!isMinimumSize && columns >= 100 && (
          <Text dimColor> — Extended view</Text>
        )}
      </Box>
      {!isMinimumSize && (
        <Text dimColor>Width: {columns} columns</Text>
      )}
    </Box>
  );
}

/**
 * Column configuration for responsive tables.
 */
export interface TableColumn {
  /** Column header text */
  header: string;
  /** Minimum width */
  minWidth: number;
  /** Preferred width for content-heavy columns */
  preferredWidth?: number;
  /** Whether column can grow */
  canGrow?: boolean;
  /** Growth weight relative to other growable columns */
  growWeight?: number;
}

/**
 * ResponsiveTable - A table component that adapts to terminal width.
 *
 * Computes column widths based on available terminal columns and
 * applies truncation to cell content that exceeds column width.
 */
export interface ResponsiveTableProps {
  /** Column definitions */
  columns: TableColumn[];
  /** Row data as arrays of strings */
  rows: string[][];
  /** Gap between columns */
  gap?: number;
}

/**
 * Calculate column widths for the table based on terminal dimensions.
 */
function calculateTableColumnWidths(
  terminalColumns: number,
  columns: TableColumn[],
  gap: number
): number[] {
  const availableForColumns = terminalColumns - (columns.length - 1) * gap;
  const layout = computeColumnLayout(
    availableForColumns,
    columns.map((col) => ({
      minWidth: col.minWidth,
      preferredWidth: col.preferredWidth,
      canGrow: col.canGrow,
      growWeight: col.growWeight ?? 1,
    })),
    "proportional"
  );
  return layout.widths;
}

export function ResponsiveTable({
  columns,
  rows,
  gap = 2,
}: ResponsiveTableProps): React.ReactNode {
  const { columns: terminalColumns } = useTerminalDimensions();

  const columnWidths = calculateTableColumnWidths(terminalColumns, columns, gap);

  return (
    <Box flexDirection="column">
      {/* Header row */}
      <Box flexDirection="row">
        {columns.map((col, i) => (
          <Box key={col.header} width={columnWidths[i]} marginRight={i < columns.length - 1 ? gap : 0}>
            <Text bold underline>{col.header}</Text>
          </Box>
        ))}
      </Box>

      {/* Divider */}
      <Box flexDirection="row">
        {columns.map((col, i) => (
          <Box key={`div-${col.header}`} width={columnWidths[i]} marginRight={i < columns.length - 1 ? gap : 0}>
            <Text dimColor>{"─".repeat(Math.min(col.minWidth, 20))}</Text>
          </Box>
        ))}
      </Box>

      {/* Data rows */}
      {rows.map((row, rowIndex) => (
        <Box key={`row-${rowIndex}`} flexDirection="row">
          {row.map((cell, cellIndex) => {
            const width = columnWidths[cellIndex];
            const truncatedCell = truncateText(cell, width);
            return (
              <Box key={`cell-${rowIndex}-${cellIndex}`} width={width} marginRight={cellIndex < row.length - 1 ? gap : 0}>
                <Text>{truncatedCell}</Text>
              </Box>
            );
          })}
        </Box>
      ))}
    </Box>
  );
}

/**
 * ResponsiveTaskRow - A single task row that truncates content.
 *
 * Displays task ID, description (truncated), and status with
 * ellipsis for overflow content.
 */
export interface ResponsiveTaskRowProps {
  /** Task ID */
  id: string;
  /** Task description */
  description: string;
  /** Task status */
  status: string;
  /** Minimum ID column width */
  idWidth?: number;
  /** Minimum status column width */
  statusWidth?: number;
}

export function ResponsiveTaskRow({
  id,
  description,
  status,
  idWidth = 10,
  statusWidth = 12,
}: ResponsiveTaskRowProps): React.ReactNode {
  const { columns } = useTerminalDimensions();

  // Calculate available width for description
  const reservedWidth = idWidth + statusWidth + 4; // 4 for gaps
  const descriptionWidth = Math.max(20, columns - reservedWidth);

  const truncatedDescription = truncateText(description, descriptionWidth);
  const truncatedStatus = truncateText(status, statusWidth);

  return (
    <Box flexDirection="row">
      <Box width={idWidth}>
        <Text bold>{id}</Text>
      </Box>
      <Box width={descriptionWidth} marginLeft={2}>
        <Text>{truncatedDescription}</Text>
      </Box>
      <Box width={statusWidth} marginLeft={2}>
        <Text dimColor>{truncatedStatus}</Text>
      </Box>
    </Box>
  );
}

/**
 * ResponsiveStatusBar - A status bar showing terminal dimensions.
 *
 * Useful for debugging responsive layout issues.
 */
export function ResponsiveStatusBar(): React.ReactNode {
  const { columns, rows, isMinimumSize } = useTerminalDimensions();

  return (
    <Box borderStyle="single" borderTop={true} borderLeft={false} borderRight={false} borderBottom={false} marginTop={1}>
      <Text dimColor>
        Terminal: {columns}×{rows}
        {isMinimumSize && " (minimum)"}
        {" | "}
        Minimum: 80×24
      </Text>
    </Box>
  );
}
