import { a11y, onA11y } from "../a11y";
import { ASL_NAMES, isLang, isMath, isSymbol, type CastName, type SymbolName } from "../input/events";

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

// Felt-tip marker colors, dark enough to read on paper.
const MARKER_COLORS: Record<SymbolName, number> = {
  hline: 0x2b6fd0,
  vline: 0x2f9e58,
  v: 0xe8762c,
  caret: 0xd7372f,
  circle: 0xd09a00,
  zigzag: 0x7a4fc4,
};
// Color-blind mode: the Okabe–Ito set, which stays apart for red-green color blindness
// (blue, bluish green, orange, black, sky blue, reddish purple; no red next to green).
const COLORBLIND_COLORS: Record<SymbolName, number> = {
  hline: 0x0072b2,
  vline: 0x009e73,
  v: 0xe69f00,
  caret: 0x1c1b1a,
  circle: 0x56b4e9,
  zigzag: 0xcc79a7,
};

/** The marker color of each symbol. Changes in place with the color-blind setting. */
export const SYMBOL_COLOR: Record<SymbolName, number> = { ...MARKER_COLORS };

/** Marker color for anything castable; ASL letters cycle through the six markers. */
export function castColor(name: CastName): number {
  if (isSymbol(name)) return SYMBOL_COLOR[name];
  if (isMath(name) || isLang(name)) return SYMBOL_COLOR.hline;
  const i = ASL_NAMES.indexOf(name);
  const markers = Object.values(SYMBOL_COLOR);
  return markers[(i < 0 ? 0 : i) % markers.length];
}

export const css = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

/** The three paper monsters. `rim` is the color of the scraps when one is torn up. */
export const MONSTER_PALETTES = [
  { name: "crumpled ball", rim: "#ffffff" },
  { name: "torn notebook page", rim: "#cfe0f7" },
  { name: "sticky note", rim: "#ffe66b" },
];

// macOS handwriting fonts first; elsewhere the bundled Patrick Hand / Permanent Marker
// (imported in main.ts, served locally, so the game still works offline).
const HANDWRITING = '"Chalkboard SE", "Chalkboard", "Patrick Hand", "Comic Sans MS", cursive';
const PLAIN = 'Arial, "Helvetica Neue", Helvetica, sans-serif';
/** The font for everything you read. Handwriting, or a plain sans-serif with the "plain font" setting. */
export let FONT = HANDWRITING;
export const TITLE_FONT = '"Marker Felt", "Permanent Marker", "Patrick Hand", "Comic Sans MS", cursive';

// keep the colors and the reading font in step with the accessibility settings
onA11y(() => {
  Object.assign(SYMBOL_COLOR, a11y.colorblind ? COLORBLIND_COLORS : MARKER_COLORS);
  FONT = a11y.plainFont ? PLAIN : HANDWRITING;
  if (typeof document !== "undefined") document.body?.classList.toggle("plain-font", a11y.plainFont);
});
