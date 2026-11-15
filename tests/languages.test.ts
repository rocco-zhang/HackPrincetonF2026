import { describe, expect, it } from "vitest";
import { CHINESE, JAPANESE, KOREAN, KOREAN_SYLLABLES, hintFor, langCast, langPool, nextMarks, pickLang, scriptMarks } from "../src/game/languages";
import { createDefaultRecognizer } from "../src/input/recognizer";
import { jitteredStroke, LANG_BASE_SHAPES, BASE_SHAPES, mulberry32 } from "../src/input/shapes";
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
    expect(langCast(["giyeok", "vline"])).toBe("lang_giyeok-vline");
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

describe("letter strokes", () => {
  const rec = createDefaultRecognizer();
  const rand = mulberry32(99);
  // a wobbly hand-drawn version of a shape, placed somewhere in the arena
  const draw = (base: [number, number][], rot = 8) =>
    jitteredStroke(base, rand, { size: 180, rotJitterDeg: rot, vertexJitter: 0.07, pointNoise: 0.015 }).map((p, i) => ({ x: p.x + 300, y: p.y + 200, t: i * 16 }));
  const read = (base: [number, number][], script: "korean" | "japanese" | "chinese") => rec.recognize(draw(base), [], undefined, scriptMarks(script)).name;

  it("Korean no longer uses the V or the peak: ㄱ and ㄴ are their own strokes", () => {
    expect(scriptMarks("korean").sort()).toEqual(["circle", "giyeok", "hline", "nieun", "vline"]);
    expect(KOREAN.find((k) => k.label === "ㄱ")!.strokes).toEqual(["giyeok"]);
    expect(KOREAN.find((k) => k.label === "ㄴ")!.strokes).toEqual(["nieun"]);
  });

  it("reads ㄱ and ㄴ drawn the way they are written, and tells them apart", () => {
    let ok = 0;
    const n = 60;
    for (let i = 0; i < n; i++) {
      if (read(LANG_BASE_SHAPES.giyeok[i % 2 ? 2 : 0], "korean") === "giyeok") ok++; // square and slanted
      if (read(LANG_BASE_SHAPES.nieun[0], "korean") === "nieun") ok++;
    }
    expect(ok / (2 * n)).toBeGreaterThan(0.95);
  });

  it("does not take a circle or a line for ㄱ or ㄴ in a Korean round", () => {
    for (let i = 0; i < 20; i++) {
      expect(read(BASE_SHAPES.circle[i % BASE_SHAPES.circle.length], "korean")).toBe("circle");
      expect(read(BASE_SHAPES.hline[0], "korean")).toBe("hline");
      expect(read(BASE_SHAPES.vline[0], "korean")).toBe("vline");
    }
  });

  it("reads Japanese く and し", () => {
    let ok = 0;
    const n = 60;
    for (let i = 0; i < n; i++) {
      if (read(LANG_BASE_SHAPES.ku[0], "japanese") === "ku") ok++;
      if (read(LANG_BASE_SHAPES.shi[0], "japanese") === "shi") ok++;
    }
    expect(ok / (2 * n)).toBeGreaterThan(0.95);
  });

  it("keeps letter strokes out of ordinary spell rounds", () => {
    for (let i = 0; i < 20; i++) {
      const r = rec.recognize(draw(LANG_BASE_SHAPES.giyeok[0]));
      expect(["giyeok", "nieun", "ku", "shi"]).not.toContain(r.name);
    }
  });

  it("knows which mark continues a card", () => {
    expect(nextMarks(["lang_giyeok-vline"], []).sort()).toEqual(["giyeok"]);
    expect(nextMarks(["lang_giyeok-vline"], ["giyeok"]).sort()).toEqual(["giyeok", "vline"]);
    expect(nextMarks(["lang_circle", "lang_nieun-hline"], ["nieun"]).sort()).toEqual(["circle", "hline", "nieun"]);
  });
});
