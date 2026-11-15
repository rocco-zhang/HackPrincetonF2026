import type { Landmark } from "../state";

/** Fire is the horns / spiderman hand. Water is an open palm. */
export type SpellId = "fire" | "water";

export type SpellBag = Record<SpellId, number>;

export const SPELL_HOLD = 0.45;
/** Ignore a pose that is just the hand opening at the end of a stroke. */
export const SPELL_AFTER_INK = 0.65;

const TIP = { thumb: 4, index: 8, middle: 12, ring: 16, pinky: 20 };
const PIP = { thumb: 3, index: 6, middle: 10, ring: 14, pinky: 18 };

export function emptySpells(): SpellBag {
  return { fire: 0, water: 0 };
}

/** A finished wave pays a random stack, such as 3 fire or 1 water. */
export function rollSpell(rand: () => number): { id: SpellId; count: number } {
  return {
    id: rand() < 0.5 ? "fire" : "water",
    count: 1 + Math.floor(rand() * 3),
  };
}

function dist(a: Landmark, b: Landmark) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function extended(lm: Landmark[], tip: number, pip: number) {
  const palm = dist(lm[0], lm[9]) || 1;
  return dist(lm[tip], lm[0]) > dist(lm[pip], lm[0]) * 1.15 && dist(lm[tip], lm[0]) > palm * 0.9;
}

/** Horns (index and pinky out) or an open palm. A pinch is neither. */
export function readSpellPose(lm: Landmark[] | null): SpellId | null {
  if (!lm || lm.length < 21) return null;
  const palm = dist(lm[0], lm[9]) || 1;
  if (dist(lm[TIP.thumb], lm[TIP.index]) / palm < 0.55) return null;
  const index = extended(lm, TIP.index, PIP.index);
  const middle = extended(lm, TIP.middle, PIP.middle);
  const ring = extended(lm, TIP.ring, PIP.ring);
  const pinky = extended(lm, TIP.pinky, PIP.pinky);
  if (index && middle && ring && pinky) return "water";
  if (index && pinky && !middle && !ring) return "fire";
  return null;
}
