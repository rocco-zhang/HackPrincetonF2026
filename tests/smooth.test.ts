import { describe, expect, it } from "vitest";
import { beautify } from "../src/input/smooth";

function spread(values: number[]) {
  return Math.max(...values) - Math.min(...values);
}

describe("stroke smoothing", () => {
  it("eases a wiggly horizontal line without leaving the fingertip", () => {
    const raw = Array.from({ length: 24 }, (_, i) => ({ x: 80 + i * 12, y: 200 + (i % 2 ? 16 : -16) }));
    const out = beautify(raw);
    const mid = out.slice(1, -1).map((p) => p.y);
    expect(spread(mid)).toBeLessThan(spread(raw.map((p) => p.y)));
    expect(spread(mid)).toBeGreaterThan(8);
    expect(out[0]).toEqual(raw[0]);
    expect(out[out.length - 1]).toEqual(raw[raw.length - 1]);
  });

  it("eases a wiggly vertical line and keeps both ends", () => {
    const raw = Array.from({ length: 24 }, (_, i) => ({ x: 300 + (i % 2 ? 14 : -14), y: 40 + i * 12 }));
    const out = beautify(raw);
    const mid = out.slice(1, -1).map((p) => p.x);
    expect(spread(mid)).toBeLessThan(spread(raw.map((p) => p.x)));
    expect(out[0]).toEqual(raw[0]);
    expect(out[out.length - 1]).toEqual(raw[raw.length - 1]);
  });

  it("eases a closed loop toward a circle", () => {
    const raw = Array.from({ length: 48 }, (_, i) => {
      const a = (i / 47) * Math.PI * 2;
      const wobble = i % 2 ? 8 : -8;
      return { x: 400 + Math.cos(a) * (90 + wobble), y: 300 + Math.sin(a) * (90 + wobble) };
    });
    const out = beautify(raw);
    const radii = (pts: { x: number; y: number }[]) => pts.slice(2, -2).map((p) => Math.hypot(p.x - 400, p.y - 300));
    expect(spread(radii(out))).toBeLessThan(spread(radii(raw)) * 0.8);
    expect(out[0]).toEqual(raw[0]);
    expect(out[out.length - 1]).toEqual(raw[raw.length - 1]);
  });

  it("leaves a V, a U, and a zigzag alone", () => {
    const vee: { x: number; y: number }[] = [];
    for (let i = 0; i <= 18; i++) vee.push({ x: i * 8, y: 40 + i * 10 });
    for (let i = 1; i <= 18; i++) vee.push({ x: 144 + i * 8, y: 220 - i * 10 });
    expect(beautify(vee)).toBe(vee);

    const cup = Array.from({ length: 32 }, (_, i) => {
      const a = Math.PI * (0.1 + 0.8 * (i / 31));
      return { x: 200 + Math.cos(a) * 110, y: 160 + Math.sin(a) * 110 };
    });
    expect(beautify(cup)).toBe(cup);

    const zag = Array.from({ length: 16 }, (_, i) => ({ x: i * 20, y: i % 2 ? 0 : 50 }));
    expect(beautify(zag)).toBe(zag);
  });
});