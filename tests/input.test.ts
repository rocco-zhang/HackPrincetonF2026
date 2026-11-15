import { describe, expect, it } from "vitest";
import type { InputEvent, Pt } from "../src/input/events";
import { OneEuro } from "../src/input/oneEuro";
import { StrokeDetector } from "../src/input/strokeDetector";

describe("OneEuro", () => {
  it("passes a constant signal through unchanged", () => {
    const f = new OneEuro(1, 0.01);
    let v = 0;
    for (let i = 0; i < 30; i++) v = f.filter(5, i / 30);
    expect(v).toBeCloseTo(5, 6);
  });

  it("reduces jitter around a still point", () => {
    const f = new OneEuro(1, 0.01);
    const out: number[] = [];
    for (let i = 0; i < 120; i++) out.push(f.filter(100 + (i % 2 ? 4 : -4), i / 30));
    const tail = out.slice(60);
    const spread = Math.max(...tail) - Math.min(...tail);
    expect(spread).toBeLessThan(4);
  });

  it("follows a fast move with little lag thanks to beta", () => {
    const slow = new OneEuro(1, 0);
    const fast = new OneEuro(1, 0.05);
    let a = 0, b = 0;
    for (let i = 0; i < 15; i++) {
      const x = i * 40; // 1200 px/s
      a = slow.filter(x, i / 30);
      b = fast.filter(x, i / 30);
    }
    const target = 14 * 40;
    expect(target - b).toBeLessThan(target - a);
  });
});

describe("StrokeDetector", () => {
  it("cuts the stroke back to the release time", () => {
    const events: InputEvent[] = [];
    const sd = new StrokeDetector(0, (e) => events.push(e));
    for (let i = 0; i < 20; i++) sd.update({ x: i * 10, y: 0, t: i * 33 }, true);
    sd.finish(14 * 33);
    const end = events[events.length - 1];
    expect(end.type === "strokeEnd" && end.points.length).toBe(15);
  });

  it("emits start/points/end and trims the ends", () => {
    const events: InputEvent[] = [];
    const sd = new StrokeDetector(3, (e) => events.push(e));
    const p = (i: number): Pt => ({ x: i * 10, y: 0, t: i });
    for (let i = 0; i < 20; i++) sd.update(p(i), true);
    sd.update(p(20), false);
    expect(events[0].type).toBe("strokeStart");
    expect(events.filter((e) => e.type === "strokePoint")).toHaveLength(19);
    const end = events[events.length - 1];
    expect(end.type).toBe("strokeEnd");
    if (end.type === "strokeEnd") {
      expect(end.points).toHaveLength(14);
      expect(end.rawPoints).toHaveLength(20);
      expect(end.points[0].x).toBe(30);
    }
  });
});
