import { describe, expect, it } from "vitest";
import { KOREAN, JAPANESE, WORDS, langCast, langPool, pickLang } from "../src/game/languages";

function rng(seed = 2) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe("language bag", () => {
  it("teaches a few Korean marks, then Japanese, then short words", () => {
    expect(langPool(1).every((item) => item.script === "korean" && item.strokes.length === 1)).toBe(true);
    expect(langPool(2).every((item) => item.script === "japanese" && item.strokes.length === 1)).toBe(true);
    expect(langPool(3)).toEqual(WORDS);
    expect(WORDS.every((item) => item.strokes.length === 2)).toBe(true);
    expect(langPool(4)).toHaveLength(KOREAN.length + JAPANESE.length + WORDS.length);
  });

  it("names a prompt by its marks, so the same shape is the same cast", () => {
    expect(langCast(KOREAN[0].strokes)).toBe(langCast(JAPANESE[0].strokes));
    expect(langCast(["v", "circle"])).toBe("lang_v-circle");
    const rand = rng();
    for (let wave = 1; wave <= 4; wave++) {
      const item = pickLang(wave, rand);
      expect(langPool(wave).map((entry) => entry.label)).toContain(item.label);
    }
  });
});
