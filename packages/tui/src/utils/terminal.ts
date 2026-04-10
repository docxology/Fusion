/**
 * Terminal dimension utilities for responsive TUI layouts.
 *
 * Provides hooks and helpers for reading live terminal dimensions from Ink's
 * useStdout() and computing deterministic column widths.
 */

import { useStdout } from "ink";
import { useMemo } from "react";

/**
 * Minimum supported terminal dimensions.
 * These values are used as lower bounds for layout calculations.
 */
export const MIN_TERMINAL_COLUMNS = 80;
export const MIN_TERMINAL_ROWS = 24;

/**
 * Effective terminal dimensions with minimum bounds applied.
 */
export interface TerminalDimensions {
  /** Effective column count (minimum 80) */
  columns: number;
  /** Effective row count (minimum 24) */
  rows: number;
  /** Whether the terminal meets minimum size requirements */
  isMinimumSize: boolean;
  /** Extra columns available beyond the minimum */
  extraColumns: number;
}

/**
 * useTerminalDimensions - Hook to read live terminal dimensions with minimum bounds.
 *
 * Uses Ink's useStdout() to get the actual terminal size, then applies minimum
 * bounds of 80 columns and 24 rows for layout calculations. This ensures
 * deterministic layout even in smaller terminals.
 *
 * The hook updates whenever the terminal is resized.
 *
 * @returns {TerminalDimensions} Effective terminal dimensions
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { columns, rows, isMinimumSize, extraColumns } = useTerminalDimensions();
 *
 *   return (
 *     <Box>
 *       <Text>Terminal: {columns}x{rows}</Text>
 *       {!isMinimumSize && <Text dimColor> (narrow)</Text>}
 *     </Box>
 *   );
 * }
 * ```
 */
export function useTerminalDimensions(): TerminalDimensions {
  const { stdout } = useStdout();

  // Defensive: use default terminal dimensions if stdout is unavailable
  const columns = stdout?.columns ?? MIN_TERMINAL_COLUMNS;
  const rows = stdout?.rows ?? MIN_TERMINAL_ROWS;

  return useMemo(() => {
    const effectiveColumns = Math.max(columns, MIN_TERMINAL_COLUMNS);
    const effectiveRows = Math.max(rows, MIN_TERMINAL_ROWS);
    const extraColumns = Math.max(0, effectiveColumns - MIN_TERMINAL_COLUMNS);
    const isMinimumSize = effectiveColumns <= MIN_TERMINAL_COLUMNS && effectiveRows <= MIN_TERMINAL_ROWS;

    return {
      columns: effectiveColumns,
      rows: effectiveRows,
      isMinimumSize,
      extraColumns,
    };
  }, [columns, rows]);
}

/**
 * Column layout configuration for responsive tables/lists.
 */
export interface ColumnLayout {
  /** Width of each column */
  widths: number[];
  /** Total width used by all columns */
  totalWidth: number;
  /** Remaining columns after minimum allocations */
  remainingColumns: number;
}

/**
 * Column allocation strategy.
 */
export type ColumnStrategy = "equal" | "fixed" | "proportional" | "content-heavy";

/**
 * Column definition for layout calculation.
 */
export interface ColumnDefinition {
  /** Minimum width for this column */
  minWidth: number;
  /** Preferred/ideal width (optional) */
  preferredWidth?: number;
  /** Whether this column can grow to fill extra space */
  canGrow?: boolean;
  /** Growth weight relative to other growable columns */
  growWeight?: number;
}

/**
 * computeColumnLayout - Calculate column widths based on terminal dimensions.
 *
 * Produces deterministic column widths that:
 * - Respect minimum column widths
 * - Keep required columns readable at 80 columns
 * - Share extra width with content-heavy columns
 *
 * @param columns - Available terminal columns
 * @param definitions - Column definitions with minimum/preferred widths
 * @param strategy - Allocation strategy for extra space
 * @returns {ColumnLayout} Calculated column widths
 *
 * @example
 * ```tsx
 * const layout = computeColumnLayout(100, [
 *   { minWidth: 10, canGrow: false },    // ID column
 *   { minWidth: 40, canGrow: true, growWeight: 2 },  // Description (grows 2x)
 *   { minWidth: 10, canGrow: true, growWeight: 1 },  // Status (grows 1x)
 * ], "proportional");
 * // Returns widths array based on available space
 * ```
 */
export function computeColumnLayout(
  columns: number,
  definitions: ColumnDefinition[],
  strategy: ColumnStrategy = "proportional"
): ColumnLayout {
  const definitionCount = definitions.length;
  if (definitionCount === 0) {
    return { widths: [], totalWidth: 0, remainingColumns: columns };
  }

  // Step 1: Calculate minimum total width
  const minimumTotal = definitions.reduce((sum, def) => sum + def.minWidth, 0);

  // Step 2: If at or below minimum, use minimum widths
  if (columns <= minimumTotal) {
    return {
      widths: definitions.map((def) => def.minWidth),
      totalWidth: minimumTotal,
      remainingColumns: 0,
    };
  }

  // Step 3: Distribute extra columns based on strategy
  const extraColumns = columns - minimumTotal;
  const growableColumns = definitions
    .map((def, index) => ({ def, index, weight: def.growWeight ?? 1 }))
    .filter(({ def }) => def.canGrow);

  if (growableColumns.length === 0 || strategy === "fixed") {
    // Fixed strategy: don't distribute extra space
    return {
      widths: definitions.map((def) => def.minWidth),
      totalWidth: minimumTotal,
      remainingColumns: extraColumns,
    };
  }

  if (strategy === "equal") {
    // Equal strategy: divide extra space evenly among growable columns
    const extraPerGrowable = Math.floor(extraColumns / growableColumns.length);
    const widths = definitions.map((def) => def.minWidth);
    for (const { index } of growableColumns) {
      widths[index] += extraPerGrowable;
    }
    return {
      widths,
      totalWidth: columns,
      remainingColumns: extraColumns % growableColumns.length,
    };
  }

  if (strategy === "proportional") {
    // Proportional strategy: distribute based on grow weights
    const totalWeight = growableColumns.reduce((sum, c) => sum + c.weight, 0);
    const widths = definitions.map((def) => def.minWidth);
    let distributed = 0;

    // Distribute proportionally (all but last to avoid rounding errors)
    for (let i = 0; i < growableColumns.length - 1; i++) {
      const { index, weight } = growableColumns[i];
      const share = Math.floor((extraColumns * weight) / totalWeight);
      widths[index] += share;
      distributed += share;
    }

    // Last growable column gets the remainder
    const last = growableColumns[growableColumns.length - 1];
    widths[last.index] += extraColumns - distributed;

    return {
      widths,
      totalWidth: columns,
      remainingColumns: 0,
    };
  }

  // Content-heavy: prioritize columns with preferredWidth
  // Distribute based on how much each column is below its preferred width
  const widths = definitions.map((def) => def.minWidth);
  const contentScores = definitions.map((def) => {
    if (!def.canGrow) return 0;
    const preferred = def.preferredWidth ?? def.minWidth * 2;
    return Math.max(0, preferred - def.minWidth);
  });
  const totalScore = contentScores.reduce((a, b) => a + b, 0);

  if (totalScore === 0) {
    // Fall back to equal distribution
    const extraPerGrowable = Math.floor(extraColumns / growableColumns.length);
    for (const { index } of growableColumns) {
      widths[index] += extraPerGrowable;
    }
    return {
      widths,
      totalWidth: columns,
      remainingColumns: extraColumns % growableColumns.length,
    };
  }

  // Distribute proportionally to content score
  let distributed = 0;
  const sortedGrowable = [...growableColumns].sort((a, b) => {
    const scoreA = contentScores[a.index];
    const scoreB = contentScores[b.index];
    return scoreB - scoreA; // Higher scores first
  });

  for (let i = 0; i < sortedGrowable.length - 1; i++) {
    const { index } = sortedGrowable[i];
    const share = Math.floor((extraColumns * contentScores[index]) / totalScore);
    widths[index] += share;
    distributed += share;
  }

  // Last column gets the remainder
  const last = sortedGrowable[sortedGrowable.length - 1];
  widths[last.index] += extraColumns - distributed;

  return {
    widths,
    totalWidth: columns,
    remainingColumns: 0,
  };
}
