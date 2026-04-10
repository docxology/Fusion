/**
 * Text truncation utilities for clean terminal display.
 *
 * Provides consistent ellipsis output for overflow text while
 * preserving short text unchanged.
 */

export const DEFAULT_ELLIPSIS = "…";

/**
 * truncateText - Truncate text to a maximum width with ellipsis.
 *
 * When text exceeds maxWidth:
 * - If maxWidth < 4, text is replaced with just ellipsis
 * - Otherwise, text is truncated to (maxWidth - 1) characters + ellipsis
 *
 * When text fits within maxWidth, it is returned unchanged.
 *
 * @param text - Text to truncate (already stripped of ANSI codes)
 * @param maxWidth - Maximum width in terminal columns
 * @param ellipsis - Ellipsis character(s) to use (default: "…")
 * @returns {string} Truncated text with ellipsis if needed
 *
 * @example
 * ```typescript
 * truncateText("Hello World", 10);    // "Hello World" (fits)
 * truncateText("Hello World", 8);    // "Hello W…"
 * truncateText("Hello World", 3);     // "…" (too short for meaningful truncation)
 * truncateText("Hello World", 2);     // "…" (minimum display width)
 * ```
 */
export function truncateText(text: string, maxWidth: number, ellipsis: string = DEFAULT_ELLIPSIS): string {
  if (maxWidth <= 0) {
    return "";
  }

  const textWidth = text.length;

  // Text fits within maxWidth
  if (textWidth <= maxWidth) {
    return text;
  }

  // Too short for meaningful truncation
  if (maxWidth < 4) {
    return ellipsis.slice(0, Math.max(1, maxWidth));
  }

  // Truncate with ellipsis - reserve space for the actual ellipsis length
  const availableWidth = maxWidth - ellipsis.length;
  if (availableWidth <= 0) {
    // Ellipsis alone exceeds width
    return ellipsis.slice(0, Math.max(1, maxWidth));
  }
  return text.slice(0, availableWidth) + ellipsis;
}

/**
 * TruncateOptions - Configuration options for truncate functions.
 */
export interface TruncateOptions {
  /** Ellipsis character(s) to use */
  ellipsis?: string;
  /** Whether to preserve words (avoid breaking mid-word) */
  preserveWords?: boolean;
  /** Minimum width threshold for truncation */
  minTruncateWidth?: number;
}

/**
 * truncateWithOptions - Truncate with additional options.
 *
 * @param text - Text to truncate
 * @param maxWidth - Maximum width
 * @param options - Truncation options
 * @returns {string} Truncated text
 */
export function truncateWithOptions(
  text: string,
  maxWidth: number,
  options: TruncateOptions = {}
): string {
  const {
    ellipsis = DEFAULT_ELLIPSIS,
    preserveWords = false,
    minTruncateWidth = 4,
  } = options;

  if (maxWidth <= 0) {
    return "";
  }

  const textWidth = text.length;

  // Text fits within maxWidth
  if (textWidth <= maxWidth) {
    return text;
  }

  // Too short for meaningful truncation
  if (maxWidth < minTruncateWidth) {
    return ellipsis.slice(0, Math.max(1, maxWidth));
  }

  if (preserveWords) {
    // Find the last space before the truncation point
    const availableWidth = maxWidth - 1;
    const truncatedAt = text.slice(0, availableWidth);
    const lastSpace = truncatedAt.lastIndexOf(" ");

    if (lastSpace > availableWidth * 0.5) {
      // There's a word boundary in the first half - break there
      const wordBoundary = text.slice(0, lastSpace).trimEnd();
      if (wordBoundary.length + ellipsis.length <= maxWidth) {
        return wordBoundary + ellipsis;
      }
    }
  }

  // Standard truncation
  const availableWidth = maxWidth - ellipsis.length;
  return text.slice(0, Math.max(0, availableWidth)) + ellipsis;
}

/**
 * padText - Pad text to a specific width.
 *
 * @param text - Text to pad
 * @param width - Target width
 * @param align - Alignment direction ("left" | "right" | "center")
 * @returns {string} Padded text
 *
 * @example
 * ```typescript
 * padText("Hi", 6);      // "Hi    " (left by default)
 * padText("Hi", 6, "right");   // "    Hi"
 * padText("Hi", 6, "center");  // "  Hi  "
 * ```
 */
export function padText(text: string, width: number, align: "left" | "right" | "center" = "left"): string {
  if (width <= 0) {
    return "";
  }

  const textWidth = text.length;

  // Text equals or exceeds target width
  if (textWidth >= width) {
    return text.slice(0, width);
  }

  const padding = width - textWidth;

  switch (align) {
    case "right":
      return " ".repeat(padding) + text;
    case "center": {
      const leftPad = Math.floor(padding / 2);
      const rightPad = padding - leftPad;
      return " ".repeat(leftPad) + text + " ".repeat(rightPad);
    }
    default:
      return text + " ".repeat(padding);
  }
}

/**
 * fitText - Fit text to a width by truncating or padding.
 *
 * @param text - Text to fit
 * @param width - Target width
 * @param align - Alignment when text is shorter than width
 * @param ellipsis - Ellipsis for truncation (omit to use padding instead)
 * @returns {string} Text fitted to width
 *
 * @example
 * ```typescript
 * fitText("Hi", 6);           // "Hi    " (padded)
 * fitText("Hello World", 6);   // "Hello " (truncated without ellipsis)
 * ```
 */
export function fitText(
  text: string,
  width: number,
  align: "left" | "right" | "center" = "left",
  ellipsis?: string
): string {
  if (width <= 0) {
    return "";
  }

  const textWidth = text.length;

  // Text exceeds target width
  if (textWidth > width) {
    if (ellipsis) {
      return truncateText(text, width, ellipsis);
    }
    // Without ellipsis, truncate but don't include trailing space from mid-word break
    const truncated = text.slice(0, width);
    return truncated.trimEnd();
  }

  // Text fits perfectly - no padding needed
  if (textWidth === width) {
    return text;
  }

  // Text is shorter - pad to fit
  return padText(text, width, align);
}
