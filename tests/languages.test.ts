import { describe, expect, it } from "vitest";
import { CHINESE, JAPANESE, KOREAN, KOREAN_SYLLABLES, hintFor, langCast, langPool, pickLang } from "../src/game/languages";
import { bestKey, cleanSubjects, toggleSubject, waveSubject } from "../src/game/subjects";

function rng(seed = 2) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe("language bag", () => {
  it("teaches each language's single marks first, then longer ones, then both", () => {
    for (const script of ["korean", "japanese", "chinese"] as const) {
      expect(langPool(script, 1).every((item) => item.script === script)).toBe(true);
      expect(langPool(script, 2).every((item) => item.script === script && item.strokes.length >= 2)).toBe(true);
      expect(langPool(script, 3)).toHaveLength(langPool(script, 1).length + langPool(script, 2).length);
    }
    expect(KOREAN.every((item) => item.strokes.length === 1)).toBe(true);
    expect(langPool("korean", 2)).toEqual(KOREAN_SYLLABLES);
  });

  it("never needs more than three marks, and every prompt has a hint", () => {
    for (const script of ["korean", "japanese", "chinese"] as const) {
      for (const item of langPool(script, 3)) {
        expect(item.strokes.length).toBeLessThanOrEqual(3);
        expect(hintFor(item.label)).toBe(item.hint);
      }
    }
  });

  it("names a prompt by its marks, so the same shape is the same cast", () => {
    expect(langCast(KOREAN[0].strokes)).toBe(langCast(JAPANESE[0].strokes));
    expect(langCast(KOREAN[0].strokes)).toBe(langCast(CHINESE[0].strokes));
    expect(langCast(["v", "circle"])).toBe("lang_v-circle");
    const rand = rng();
    for (let level = 1; level <= 4; level++) {
      const item = pickLang("chinese", level, rand);
      expect(langPool("chinese", level).map((entry) => entry.label)).toContain(item.label);
    }
  });
});

describe("subject selection", () => {
  it("is never empty and keeps a standard order", () => {
    expect(cleanSubjects(null)).toEqual(["shapes"]);
    expect(cleanSubjects(["math", "bogus", "asl", "math"])).toEqual(["asl", "math"]);
    expect(toggleSubject(["shapes"], "shapes")).toEqual(["shapes"]); // the last one stays
    expect(toggleSubject(["shapes"], "korean")).toEqual(["shapes", "korean"]);
    expect(toggleSubject(["shapes", "korean"], "shapes")).toEqual(["korean"]);
  });

  it("gives each wave the next subject, and each subject its own lesson count", () => {
    expect(waveSubject(["math"], 4)).toEqual({ subject: "math", level: 4 });
    const picked = cleanSubjects(["shapes", "math", "chinese"]);
    expect([1, 2, 3, 4, 5].map((n) => waveSubject(picked, n).subject)).toEqual(["shapes", "math", "chinese", "shapes", "math"]);
    expect(waveSubject(picked, 3).level).toBe(1);
    expect(waveSubject(picked, 4).level).toBe(2);
  });

  it("keeps the old best-score keys for single subjects", () => {
    expect(bestKey(["shapes"], "medium")).toBe("spellcam.best");
    expect(bestKey(["asl"], "hard")).toBe("spellcam.best.asl.hard");
    expect(bestKey(["math", "shapes"], "easy")).toBe("spellcam.best.mix.shapes+math.easy");
  });
});
