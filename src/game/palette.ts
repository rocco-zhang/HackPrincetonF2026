import type { SymbolName } from "../input/events";

/** Pencil graphite: every line and all text. */
export const INK = 0x33312e;
export const INK_CSS = "#33312e";
/** The sheet of paper everything is drawn on. */
export const PAPER = 0xf9f5ea;
export const PAPER_CSS = "#f9f5ea";
/** Red pen, for the things that should jump out. */
export const ACCENT = 0xd7372f;
export const ACCENT_CSS = "#d7372f";
export const ORANGE_CSS = "#d9661c";
export const MUTED_CSS = "#8a857a";
export const HIGHLIGHTER = 0xffe95c;

// Felt-tip marker colours, dark enough to read on paper.
export const SYMBOL_COLOR: Record<SymbolName, number> = {
  hline: 0x2b6fd0,
  vline: 0x2f9e58,
  v: 0xe8762c,
  caret: 0xd7372f,
  circle: 0xd09a00,
  zigzag: 0x7a4fc4,
};

export const css = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

/** The three paper monsters. `rim` is the colour of the scraps when one is torn up. */
export const MONSTER_PALETTES = [
  { name: "crumpled ball", rim: "#ffffff" },
  { name: "torn notebook page", rim: "#cfe0f7" },
  { name: "sticky note", rim: "#ffe66b" },
];

// macOS handwriting fonts first; elsewhere the bundled Patrick Hand / Permanent Marker
// (imported in main.ts, served locally, so the game still works offline).
export const FONT = '"Chalkboard SE", "Chalkboard", "Patrick Hand", "Comic Sans MS", cursive';
export const TITLE_FONT = '"Marker Felt", "Permanent Marker", "Patrick Hand", "Comic Sans MS", cursive';
