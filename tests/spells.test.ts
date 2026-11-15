import { describe, expect, it } from "vitest";
import { bossCards, isBossWave } from "../src/game/bosses";
import { castMarks, scriptMarks } from "../src/game/languages";
import { cleanLoadout, damageSpellTarget, spellMovementScale, SPELL_POWER, MANA, pickSpell, readSpellPose, SPELL_IDS, SPELLS } from "../src/game/spells";
import { aslPool } from "../src/game/systems/Spawner";
import type { Landmark } from "../src/state";

type Fingers = { thumb: boolean; index: boolean; middle: boolean; ring: boolean; pinky: boolean };

function hand(open: Fingers): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  const fingers: [keyof Fingers, number, number, number, number][] = [
    ["thumb", 4, 3, 2, 1],
    ["index", 8, 7, 6, 5],
    ["middle", 12, 11, 10, 9],
    ["ring", 16, 15, 14, 13],
    ["pinky", 20, 19, 18, 17],
  ];
  fingers.forEach(([name, tip, dip, pip, mcp], i) => {
    const ang = -2.4 + i * 0.45;
    const at = (t: number) => ({ x: Math.cos(ang) * t, y: Math.sin(ang) * t, z: 0 });
    lm[mcp] = at(0.35);
    lm[pip] = at(0.6);
    lm[dip] = open[name] ? at(0.85) : at(0.4);
    lm[tip] = open[name] ? at(1.15) : at(0.28);
  });
  return lm;
}

const shut = { thumb: false, index: false, middle: false, ring: false, pinky: false };

describe("spell gestures", () => {
  it("reads horns and an open palm, and ignores a fist or a pinch", () => {
    expect(readSpellPose(hand({ ...shut, index: true, pinky: true }))).toBe(0); // horns: slot 1
    expect(readSpellPose(hand({ thumb: true, index: true, middle: true, ring: true, pinky: true }))).toBe(1); // open palm: slot 2
    expect(readSpellPose(hand(shut))).toBeNull();
    const pinched = hand({ thumb: true, index: true, middle: true, ring: true, pinky: true });
    pinched[4] = { ...pinched[8] };
    expect(readSpellPose(pinched)).toBeNull();
  });

});

describe("spell deck", () => {
  it("has at least six spells, each with a cost the mana bar can pay", () => {
    expect(SPELL_IDS.length).toBeGreaterThanOrEqual(6);
    for (const id of SPELL_IDS) {
      expect(SPELLS[id].cost).toBeGreaterThan(0);
      expect(SPELLS[id].cost).toBeLessThanOrEqual(MANA.max);
    }
    expect(MANA.start).toBeGreaterThanOrEqual(Math.min(...SPELL_IDS.map((id) => SPELLS[id].cost))); // one cheap spell from the start
  });

  it("always takes exactly two different spells into a round", () => {
    expect(cleanLoadout(null)).toEqual(["fire", "water"]);
    expect(cleanLoadout(["bomb", "bomb", "nonsense"])).toEqual(["bomb", "fire"]);
    expect(cleanLoadout(["heal", "shield", "bomb"])).toEqual(["heal", "shield"]);
  });

  it("swaps out the spell picked longest ago", () => {
    expect(pickSpell(["fire", "water"], "bomb")).toEqual(["water", "bomb"]);
    expect(pickSpell(["water", "bomb"], "heal")).toEqual(["bomb", "heal"]);
    expect(pickSpell(["bomb", "heal"], "heal")).toEqual(["bomb", "heal"]);
  });
});

describe("bosses", () => {
  let seed = 7;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  it("come every third wave", () => {
    expect([1, 2, 3, 4, 5, 6, 9].map(isBossWave)).toEqual([false, false, true, false, false, true, true]);
  });

  it("carry a long row for shapes and math", () => {
    expect(bossCards("shapes", 1, rand).symbols.length).toBeGreaterThanOrEqual(5);
    const math = bossCards("math", 2, rand);
    expect(math.symbols).toHaveLength(4);
    expect(math.labels).toHaveLength(4);
  });

  it("spell ASL words with letters taught by that lesson, never the same letter twice running", () => {
    for (let level = 1; level <= 5; level++) {
      const known = aslPool(level);
      for (let i = 0; i < 20; i++) {
        const { symbols } = bossCards("asl", level, rand);
        expect(symbols.length).toBeGreaterThanOrEqual(3);
        symbols.forEach((s, j) => {
          expect(known).toContain(s);
          if (j > 0) expect(s).not.toBe(symbols[j - 1]);
        });
      }
    }
  });

  it("write words in each language using only that language's marks", () => {
    for (const script of ["korean", "japanese", "chinese"] as const) {
      const marks = scriptMarks(script) as string[];
      for (let i = 0; i < 20; i++) {
        const boss = bossCards(script, 1, rand);
        expect(boss.symbols.length).toBeGreaterThanOrEqual(2);
        expect(boss.labels).toHaveLength(boss.symbols.length);
        for (const card of boss.symbols) for (const mark of castMarks(card)) expect(marks).toContain(mark);
      }
    }
  });
});

describe("spell effects", () => {
  function target(cards: number) {
    let visible = cards;
    return { queue: Array(cards).fill("card"), prompts: Array(cards).fill("prompt"),
      bubble: { popFront() { visible--; } }, visible: () => visible };
  }
  it("fire removes one card without destroying enemies that still have cards", () => {
    const monster = target(3);
    expect(damageSpellTarget(monster, SPELL_POWER.fireDamage)).toBe(false);
    expect(monster.queue).toHaveLength(2);
    expect(monster.prompts).toHaveLength(2);
    expect(monster.visible()).toBe(2);
    expect(damageSpellTarget(target(1), SPELL_POWER.fireDamage)).toBe(true);
  });
  it("bomb removes five cards and caps damage at the remaining card count", () => {
    const boss = target(8);
    expect(damageSpellTarget(boss, SPELL_POWER.bombDamage)).toBe(false);
    expect(boss.queue).toHaveLength(3);
    expect(boss.prompts).toHaveLength(3);
    expect(boss.visible()).toBe(3);
    expect(damageSpellTarget(boss, SPELL_POWER.bombDamage)).toBe(true);
    expect(boss.visible()).toBe(0);
  });
  it("freeze stops movement even during Wave, then remaining slow resumes until expiry", () => {
    expect(spellMovementScale(100, 200, 300)).toBe(0);
    expect(spellMovementScale(200, 200, 300)).toBe(.35);
    expect(spellMovementScale(300, 200, 300)).toBe(1);
  });
});
