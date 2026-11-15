/** The spells in the deck. Two go into a round, cast through the shared thumbs-up and sign-sequence system. */
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
