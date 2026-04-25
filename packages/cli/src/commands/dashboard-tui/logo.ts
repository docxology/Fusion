// FUSION block-letter logos using Unicode box-drawing + full blocks.
// The caller picks a size based on terminal dimensions and applies an
// all-blue vertical gradient.

// ANSI Shadow font — 47 cols × 6 rows.
export const FUSION_LOGO_LINES = [
  "███████╗██╗   ██╗███████╗██╗ ██████╗ ███╗   ██╗",
  "██╔════╝██║   ██║██╔════╝██║██╔═══██╗████╗  ██║",
  "█████╗  ██║   ██║███████╗██║██║   ██║██╔██╗ ██║",
  "██╔══╝  ██║   ██║╚════██║██║██║   ██║██║╚██╗██║",
  "██║     ╚██████╔╝███████║██║╚██████╔╝██║ ╚████║",
  "╚═╝      ╚═════╝ ╚══════╝╚═╝ ╚═════╝ ╚═╝  ╚═══╝",
];

// ANSI Shadow doubled vertically — each row of FUSION_LOGO_LINES rendered
// twice for a 2× taller block logo (47 cols × 12 rows). Preserves the same
// block-letter aesthetic; just scaled up. Used when the terminal has room.
export const FUSION_LOGO_LARGE_LINES = [
  "███████╗██╗   ██╗███████╗██╗ ██████╗ ███╗   ██╗",
  "███████╗██╗   ██╗███████╗██╗ ██████╗ ███╗   ██╗",
  "██╔════╝██║   ██║██╔════╝██║██╔═══██╗████╗  ██║",
  "██╔════╝██║   ██║██╔════╝██║██╔═══██╗████╗  ██║",
  "█████╗  ██║   ██║███████╗██║██║   ██║██╔██╗ ██║",
  "█████╗  ██║   ██║███████╗██║██║   ██║██╔██╗ ██║",
  "██╔══╝  ██║   ██║╚════██║██║██║   ██║██║╚██╗██║",
  "██╔══╝  ██║   ██║╚════██║██║██║   ██║██║╚██╗██║",
  "██║     ╚██████╔╝███████║██║╚██████╔╝██║ ╚████║",
  "██║     ╚██████╔╝███████║██║╚██████╔╝██║ ╚████║",
  "╚═╝      ╚═════╝ ╚══════╝╚═╝ ╚═════╝ ╚═╝  ╚═══╝",
  "╚═╝      ╚═════╝ ╚══════╝╚═╝ ╚═════╝ ╚═╝  ╚═══╝",
];

export const FUSION_TAGLINE = "AI coding agent dashboard";
