import type { Landmark } from "../state";

/** The spells in the deck. Two go into a round: slot 1 is cast with horns, slot 2 with an open palm. */
export type SpellId = "fire" | "water" | "bomb" | "freeze" | "shield" | "heal";

export const SPELL_IDS: SpellId[] = ["fire", "water", "bomb", "freeze", "shield", "heal"];

export const SPELLS: Record<SpellId, { name: string; glyph: string; cost: number; blurb: string; color: number }> = {
  fire: { name: "Fire", glyph: "🔥", cost: 30, blurb: "deals 1 damage to every monster", color: 0xe25b2a },
  water: { name: "Wave", glyph: "🌊", cost: 35, blurb: "pushes every monster back and slows them", color: 0x2f7dff },
  bomb: { name: "Bomb", glyph: "💣", cost: 60, blurb: "deals 5 damage in a wide blast", color: 0x33312e },
  freeze: { name: "Freeze", glyph: "❄️", cost: 40, blurb: "stops every monster for 7 seconds", color: 0x56b4e9 },
  shield: { name: "Shield", glyph: "🛡️", cost: 45, blurb: "blocks the next monster, with no time limit", color: 0x2f9e58 },
  heal: { name: "Heal", glyph: "❤️", cost: 70, blurb: "gives one heart back", color: 0xd7372f },
};

/** Mana: what spells cost, and how drawing earns it back. */
export const MANA = { max: 100, start: 40, perSymbol: 6, perKill: 8, perWave: 20 };

/** How strong each spell is. */
export const SPELL_POWER = {
  fireDamage: 1,
  bombDamage: 5,
  pushDistance: 460,
  waveSlowSeconds: 4,
  waveSpeed: 0.35,
  bombRadius: 500,
  freezeSeconds: 7,
};

/** Remove matching cards and their displayed prompts; damage is identical for bosses. */
export function damageSpellTarget(target: { queue: unknown[]; prompts: unknown[]; bubble: { popFront(): void } }, damage: number): boolean {
  for (let i = 0; i < damage && target.queue.length > 0; i++) {
    target.queue.shift();
    target.prompts.shift();
    target.bubble.popFront();
  }
  return target.queue.length === 0;
}

export function spellMovementScale(now: number, freezeUntil: number, slowUntil: number): number {
  return now < freezeUntil ? 0 : now < slowUntil ? SPELL_POWER.waveSpeed : 1;
}

export type Loadout = [SpellId, SpellId];
export const DEFAULT_LOADOUT: Loadout = ["fire", "water"];
/** How each slot is cast, in slot order. */
export const SLOT_GESTURES = ["horns", "open palm"] as const;

/** Two different, valid spells. */
export function cleanLoadout(raw: unknown): Loadout {
  const picked = Array.isArray(raw) ? [...new Set(raw.filter((s): s is SpellId => SPELL_IDS.includes(s as SpellId)))] : [];
  for (const s of DEFAULT_LOADOUT) if (picked.length < 2 && !picked.includes(s)) picked.push(s);
  return [picked[0], picked[1]];
}

/** Pick a spell for battle: it takes the place of the one picked longest ago. Picking one that's already in changes nothing. */
export function pickSpell(loadout: Loadout, id: SpellId): Loadout {
  return loadout.includes(id) ? loadout : [loadout[1], id];
}

export const SPELL_HOLD = 0.45;
/** Ignore a pose that is just the hand opening at the end of a stroke. */
export const SPELL_AFTER_INK = 0.65;

const TIP = { thumb: 4, index: 8, middle: 12, ring: 16, pinky: 20 };
const PIP = { thumb: 3, index: 6, middle: 10, ring: 14, pinky: 18 };

function dist(a: Landmark, b: Landmark) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function extended(lm: Landmark[], tip: number, pip: number) {
  const palm = dist(lm[0], lm[9]) || 1;
  return dist(lm[tip], lm[0]) > dist(lm[pip], lm[0]) * 1.15 && dist(lm[tip], lm[0]) > palm * 0.9;
}

/** Which spell slot the hand is asking for: 0 for horns (index and pinky out), 1 for an open palm. A pinch is neither. */
export function readSpellPose(lm: Landmark[] | null): 0 | 1 | null {
  if (!lm || lm.length < 21) return null;
  const palm = dist(lm[0], lm[9]) || 1;
  if (dist(lm[TIP.thumb], lm[TIP.index]) / palm < 0.55) return null;
  const index = extended(lm, TIP.index, PIP.index);
  const middle = extended(lm, TIP.middle, PIP.middle);
  const ring = extended(lm, TIP.ring, PIP.ring);
  const pinky = extended(lm, TIP.pinky, PIP.pinky);
  if (index && middle && ring && pinky) return 1;
  if (index && pinky && !middle && !ring) return 0;
  return null;
}
