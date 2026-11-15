import { describe, expect, it } from "vitest";
import { bossCards, isBossWave } from "../src/game/bosses";
import { castMarks, scriptMarks } from "../src/game/languages";
import { cleanLoadout, damageSpellTarget, spellMovementScale, wavePushDistance, SPELL_POWER, MANA, pickSpell, SPELL_IDS, SPELLS } from "../src/game/spells";
import { aslPool } from "../src/game/systems/Spawner";
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
  it("Wave pushes close enemies farther and keeps a minimum push at and beyond the edge", () => {
    const radius = 600, screenSize = 720;
    expect(wavePushDistance(0, radius, screenSize)).toBeCloseTo(396);
    expect(wavePushDistance(300, radius, screenSize)).toBeCloseTo(234);
    expect(wavePushDistance(600, radius, screenSize)).toBeCloseTo(72);
    expect(wavePushDistance(900, radius, screenSize)).toBeCloseTo(72);
    expect(wavePushDistance(0, 360, screenSize)).toBeCloseTo(237.6);
  });
  it("freeze stops movement even during Wave, then remaining slow resumes until expiry", () => {
    expect(spellMovementScale(100, 200, 300)).toBe(0);
    expect(spellMovementScale(200, 200, 300)).toBe(.35);
    expect(spellMovementScale(300, 200, 300)).toBe(1);
  });
});
