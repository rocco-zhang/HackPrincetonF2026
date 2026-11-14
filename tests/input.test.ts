import { describe, expect, it } from "vitest";
import type { InputEvent, Pt } from "../src/input/events";
import { OneEuro } from "../src/input/oneEuro";
import { PinchGate, StrokeDetector } from "../src/input/strokeDetector";

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

describe("PinchGate", () => {
  it("needs 2 frames below pinchOn to start and 3 above pinchOff to stop", () => {
    const g = new PinchGate(0.35, 0.5, 2, 3);
    expect(g.update(0.2)).toBe(false);
    expect(g.update(0.2)).toBe(true);
    // in the hysteresis band: stays inking
    expect(g.update(0.45)).toBe(true);
    expect(g.update(0.45)).toBe(true);
    expect(g.update(0.6)).toBe(true);
    expect(g.update(0.6)).toBe(true);
    expect(g.update(0.6)).toBe(false);
  });

  it("ignores single-frame glitches", () => {
    const g = new PinchGate(0.35, 0.5, 2, 3);
    g.update(0.2);
    g.update(0.2);
    expect(g.inking).toBe(true);
    g.update(0.9);
    g.update(0.2);
    g.update(0.9);
    g.update(0.9);
    expect(g.inking).toBe(true);
    // a lost hand counts as release
    g.update(null);
    expect(g.inking).toBe(false);
  });

  it("does not start in the hysteresis band", () => {
    const g = new PinchGate(0.35, 0.5, 2, 3);
    for (let i = 0; i < 10; i++) g.update(0.4);
    expect(g.inking).toBe(false);
  });
});

describe("StrokeDetector", () => {
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
      expect(end.points[0].x).toBe(30);
    }
  });
});
