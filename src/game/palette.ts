import type { SymbolName } from "../input/events";

export const SYMBOL_COLOR: Record<SymbolName, number> = {
  hline: 0x4de8ff,
  vline: 0x9dff5c,
  v: 0xffb03b,
  caret: 0xff5ca8,
  circle: 0xffe14d,
  zigzag: 0xb07cff,
};

export const css = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

export const MONSTER_PALETTES = [
  { eye: "#7df9ff", rim: "#4de8ff", body: ["#2a1d4a", "#0a0716"] },
  { eye: "#ff7ad9", rim: "#ff5ca8", body: ["#3a1838", "#0d0610"] },
  { eye: "#c6ff7a", rim: "#9dff5c", body: ["#1b3328", "#060f0a"] },
];

export const FONT = '"Avenir Next", "Segoe UI", system-ui, sans-serif';
export const GOLD = 0xffd36b;
