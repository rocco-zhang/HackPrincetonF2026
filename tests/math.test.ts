import { describe, expect, it } from "vitest";
import { makeProblem, mathQueue, waveOps } from "../src/game/math";

function rng(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function value(prompt: string): number {
  const expr = prompt.replace(/−/g, "-").replace(/×/g, "*").replace(/÷/g, "/");
  return Function(`"use strict"; return (${expr})`)() as number;
}

describe("arithmetic waves", () => {
  it("teaches one operation at a time, then mixes them", () => {
    expect(waveOps(1)).toEqual(["add"]);
    expect(waveOps(2)).toEqual(["sub"]);
    expect(waveOps(3)).toEqual(["mul"]);
    expect(waveOps(4)).toEqual(["div"]);
    expect(waveOps(5)).toEqual(["add", "sub", "mul", "div"]);
    expect(mathQueue(1)).toBe(1);
    expect(mathQueue(6)).toBe(2);
    expect(mathQueue(8)).toBe(3);
    expect(mathQueue(9)).toBe(4);
    expect(mathQueue(100)).toBe(4);
  });

  it("asks questions whose written problem equals the answer", () => {
    const rand = rng(7);
    for (let wave = 1; wave <= 10; wave++) {
      for (let i = 0; i < 40; i++) {
        const problem = makeProblem(wave, rand);
        expect(value(problem.prompt)).toBe(problem.answer);
        expect(problem.answer).toBeGreaterThan(0);
        expect(problem.name).toBe(`math_${problem.answer}`);
      }
    }
  });

  it("keeps the first four waves to a single operation and small numbers", () => {
    const rand = rng(3);
    for (let i = 0; i < 30; i++) {
      expect(makeProblem(1, rand).prompt).toMatch(/^\d+ \+ \d+$/);
      expect(makeProblem(1, rand).answer).toBeLessThanOrEqual(10);
      const sub = makeProblem(2, rand);
      expect(sub.prompt).toMatch(/^\d+ − \d+$/);
      expect(makeProblem(3, rand).prompt).toMatch(/^\d+ × \d+$/);
      const div = makeProblem(4, rand);
      expect(div.prompt).toMatch(/^\d+ ÷ \d+$/);
      const [, left, right] = div.prompt.match(/(\d+) ÷ (\d+)/)!;
      expect(Number(left) % Number(right)).toBe(0);
    }
  });

  it("can rebuild a problem that shares an answer already on screen", () => {
    const rand = rng(11);
    const problem = makeProblem(5, rand, 12);
    expect(problem.answer).toBe(12);
    expect(value(problem.prompt)).toBe(12);
  });
});
