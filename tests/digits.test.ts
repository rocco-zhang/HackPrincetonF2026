import { describe, expect, it } from "vitest";
import { DIGIT_SHAPES, recognizeDigit } from "../src/input/digits";
import { jitteredStroke, mulberry32, type XY } from "../src/input/shapes";

function strokes(digit: string, seed: number): XY[][] {
  const rand = mulberry32(seed);
  return DIGIT_SHAPES[digit].flatMap((base) =>
    Array.from({ length: 10 }, () => {
      const drawn = jitteredStroke(base, rand, {
        size: 120 + rand() * 180,
        scaleJitter: 0.2,
        rotJitterDeg: 8,
        vertexJitter: 0.04,
        pointNoise: 0.01,
        points: 40,
      });
      const ox = rand() * 400;
      const oy = rand() * 200;
      return drawn.map((p) => ({ x: p.x + ox, y: p.y + oy }));
    }),
  );
}

describe("recognizeDigit", () => {
  for (const digit of Object.keys(DIGIT_SHAPES)) {
    it(`reads a drawn ${digit}`, () => {
      const samples = strokes(digit, 20 + Number(digit));
      const correct = samples.filter((sample) => recognizeDigit(sample)?.digit === digit).length;
      expect(correct / samples.length, digit).toBeGreaterThanOrEqual(0.8);
    });
  }
});
