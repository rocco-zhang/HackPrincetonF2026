import { describe, expect, it } from "vitest";
import { drawingHandId } from "../src/input/hands";
import type { InputEvent, Pt } from "../src/input/events";
import { StrokeDetector } from "../src/input/strokeDetector";

describe("two-hand drawing", () => {
  it("keeps the left and right hands on their own strokes", () => {
    expect(drawingHandId("Left", 0)).toBe(1);
    expect(drawingHandId("Right", 1)).toBe(0);
    const events: InputEvent[] = [];
    const left = new StrokeDetector(0, (e) => events.push({ ...e, hand: 0 }));
    const right = new StrokeDetector(0, (e) => events.push({ ...e, hand: 1 }));
    const pt = (x: number, y: number): Pt => ({ x, y, t: 0 });
    for (let i = 0; i < 6; i++) left.update(pt(i * 10, 100), true);
    for (let i = 0; i < 6; i++) right.update(pt(200, i * 12), true);
    left.update(pt(60, 100), false);
    right.update(pt(200, 72), false);
    const ends = events.filter((e) => e.type === "strokeEnd");
    expect(ends).toHaveLength(2);
    const line = ends.find((e) => e.hand === 0);
    const stick = ends.find((e) => e.hand === 1);
    expect(line?.type === "strokeEnd" && line.points.every((p) => p.y === 100)).toBe(true);
    expect(stick?.type === "strokeEnd" && stick.points.every((p) => p.x === 200)).toBe(true);
  });
});