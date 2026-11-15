import { describe, expect, it } from "vitest";
import { readSpellPose, rollSpell } from "../src/game/spells";
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
    expect(readSpellPose(hand({ ...shut, index: true, pinky: true }))).toBe("fire");
    expect(readSpellPose(hand({ thumb: true, index: true, middle: true, ring: true, pinky: true }))).toBe("water");
    expect(readSpellPose(hand(shut))).toBeNull();
    const pinched = hand({ thumb: true, index: true, middle: true, ring: true, pinky: true });
    pinched[4] = { ...pinched[8] };
    expect(readSpellPose(pinched)).toBeNull();
  });

  it("pays 1 to 3 charges of either spell", () => {
    let s = 4;
    const rand = () => {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296;
    };
    const drops = Array.from({ length: 40 }, () => rollSpell(rand));
    expect(drops.every((d) => (d.id === "fire" || d.id === "water") && d.count >= 1 && d.count <= 3)).toBe(true);
    expect(drops.some((d) => d.id === "fire" && d.count === 3)).toBe(true);
    expect(drops.some((d) => d.id === "water" && d.count === 1)).toBe(true);
  });
});