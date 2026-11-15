import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { experiment } from "../src/input/pinchConfig";
import { SYMBOLS, type SymbolName } from "../src/input/events";
import { createDefaultRecognizer, lineCheck } from "../src/input/recognizer";
import { BASE_SHAPES, jitteredStroke, mulberry32, type XY } from "../src/input/shapes";

const rec = createDefaultRecognizer();
const saved = { ...experiment };
// Reference accuracy suite uses the original line geometry, independently of personal tuning.
beforeEach(() => Object.assign(experiment, { lineStraightness: .86, lineThinness: .28 }));
afterEach(() => Object.assign(experiment, saved));

function testStrokes(name: SymbolName, seed: number, perShape = 12) {
  const rand = mulberry32(seed);
  const out: XY[][] = [];
  for (const base of BASE_SHAPES[name]) {
    for (let i = 0; i < perShape; i++) {
      const size = 100 + rand() * 300;
      const s = jitteredStroke(base, rand, {
        size,
        scaleJitter: 0.3,
        rotJitterDeg: 10,
        vertexJitter: 0.08,
        pointNoise: 0.015,
        points: 20 + Math.floor(rand() * 60),
      });
      const ox = rand() * 800;
      const oy = rand() * 400;
      out.push(s.map((p) => ({ x: p.x + ox, y: p.y + oy })));
    }
  }
  return out;
}

describe("recognizer", () => {
  for (const name of SYMBOLS) {
    it(`recognizes ${name} in both directions ≥ 90%`, () => {
      const strokes = testStrokes(name, 1000 + SYMBOLS.indexOf(name));
      const results = strokes.map((s) => rec.recognize(s));
      const correct = results.filter((r) => r.accepted && r.name === name).length;
      const rate = correct / strokes.length;
      const confusions: Record<string, number> = {};
      for (const r of results) if (r.name !== name) confusions[r.name ?? `fizzle(${r.best?.name})`] = (confusions[r.name ?? `fizzle(${r.best?.name})`] ?? 0) + 1;
      expect(rate, `${name}: ${(rate * 100).toFixed(1)}% confusions=${JSON.stringify(confusions)}`).toBeGreaterThanOrEqual(0.9);
    });
  }

  it("never confuses hline with vline or v with caret", () => {
    const pairs: [SymbolName, SymbolName][] = [
      ["hline", "vline"],
      ["vline", "hline"],
      ["v", "caret"],
      ["caret", "v"],
    ];
    for (const [a, b] of pairs) {
      const strokes = testStrokes(a, 77 + SYMBOLS.indexOf(a));
      const wrong = strokes.filter((s) => rec.recognize(s).name === b).length;
      expect(wrong, `${a} recognized as ${b}`).toBe(0);
    }
  });

  it("rejects diagonal lines and tiny strokes", () => {
    const diag: XY[] = Array.from({ length: 30 }, (_, i) => ({ x: i * 10, y: i * 10 }));
    expect(lineCheck(diag)?.kind).toBe("diagonal");
    expect(rec.recognize(diag).accepted).toBe(false);
    const tiny: XY[] = Array.from({ length: 5 }, (_, i) => ({ x: i, y: 0 }));
    expect(rec.recognize(tiny).method).toBe("tooSmall");
  });

  it("resolves a slanted line when only one of dash / pillar is needed", () => {
    const diag: XY[] = Array.from({ length: 30 }, (_, i) => ({ x: i * 10, y: i * 10 }));
    expect(rec.recognize(diag, ["hline"]).name).toBe("hline");
    expect(rec.recognize(diag, ["vline", "circle"]).name).toBe("vline");
    expect(rec.recognize(diag, ["v"]).accepted).toBe(false);
  });

  it("accepts sloppier strokes for a needed symbol, without stealing clear other symbols", () => {
    const sloppy = (name: SymbolName, seed: number) => {
      const rand = mulberry32(seed);
      return BASE_SHAPES[name].flatMap((base) =>
        Array.from({ length: 12 }, () =>
          jitteredStroke(base, rand, { size: 250, scaleJitter: 0.4, rotJitterDeg: 22, vertexJitter: 0.16, pointNoise: 0.03, points: 40 }),
        ),
      );
    };
    for (const name of ["v", "caret", "circle", "zigzag"] as SymbolName[]) {
      const strokes = sloppy(name, 500 + SYMBOLS.indexOf(name));
      const plain = strokes.filter((s) => rec.recognize(s).name === name).length;
      const helped = strokes.filter((s) => rec.recognize(s, [name]).name === name).length;
      expect(helped, name).toBeGreaterThanOrEqual(plain);
      expect(helped / strokes.length, `${name} with context`).toBeGreaterThanOrEqual(0.9);
    }
    // a clean ring is still a ring when only a vee is needed
    for (const s of testStrokes("circle", 9)) expect(rec.recognize(s, ["v"]).name).not.toBe("v");
    for (const s of testStrokes("caret", 9)) expect(rec.recognize(s, ["v"]).name).not.toBe("v");
  });

  it("mostly fizzles random scribbles", () => {
    const rand = mulberry32(42);
    let fizzles = 0;
    const total = 200;
    for (let k = 0; k < total; k++) {
      let x = 400, y = 300, heading = rand() * Math.PI * 2;
      const pts: XY[] = [];
      for (let i = 0; i < 60; i++) {
        heading += (rand() - 0.5) * 1.6;
        x += Math.cos(heading) * 12;
        y += Math.sin(heading) * 12;
        pts.push({ x, y });
      }
      if (!rec.recognize(pts).accepted) fizzles++;
    }
    expect(fizzles / total).toBeGreaterThanOrEqual(0.7);
  });
});
