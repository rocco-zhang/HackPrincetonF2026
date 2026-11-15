import { describe, expect, it, vi } from "vitest";
vi.mock("phaser", () => ({ default: { Math: { Distance: { Between: () => 500 } } } }));
vi.mock("../src/game/scenes/Boot", () => ({ PENCIL: {} }));
vi.mock("../src/game/sfx", () => ({ sfx: { symbol: vi.fn() } }));
import { Casting } from "../src/game/systems/Casting";
import { ARENA } from "../src/config";

describe("casting in the monster spawn margin", () => {
  it.each([
    [-50, 100], [ARENA.width + 50, 100], [100, -50], [100, ARENA.height + 50],
  ])("hits matching monsters at (%s, %s)", (x, y) => {
    const monster = { x, y, front: "circle", queue: ["circle"], dying: false };
    const mismatch = { x, y, front: "v", queue: ["v"], dying: false };
    const host = { monsters: [monster, mismatch], onCast: vi.fn(), player: { x: 640, y: 360, castPulse: vi.fn() } };
    const bolt = { setTint: () => bolt, setScale: () => bolt, setDepth: () => bolt };
    const tail = { setDepth: () => tail };
    const casting = Object.create(Casting.prototype) as Casting;
    Object.assign(casting, {
      host, lastByHand: new Map(), finished: [],
      scene: { add: { image: () => bolt, particles: () => tail }, tweens: { add: vi.fn() } },
    });
    casting.cast("circle");
    expect(monster.dying).toBe(true);
    expect(monster.queue).toEqual([]);
    expect(mismatch.queue).toEqual(["v"]);
    expect(host.onCast).toHaveBeenCalledWith("circle", [monster]);
  });
});


describe("completed spell ink", () => {
  it("removes held and fading strokes without canceling a stroke still being drawn", () => {
    const casting = Object.create(Casting.prototype) as Casting;
    const stroke = [{ x: 1, y: 2, t: 0 }, { x: 20, y: 30, t: 10 }];
    const trail = { pts: stroke, color: 0, age: 0, at: 0 };
    const clear = vi.fn();
    Object.assign(casting, { gfx: { clear }, held: [trail], fading: [trail], finished: [trail], lastByHand: new Map([[0, trail]]), currents: new Map([[1, stroke]]) });
    casting.clearCompletedInk();
    expect(casting.holding).toBe(false);
    expect(casting.drawing).toBe(true);
    expect(casting["fading"]).toEqual([]);
    expect(casting["finished"]).toEqual([]);
    expect(casting["lastByHand"].size).toBe(0);
    expect(clear).toHaveBeenCalledOnce();
  });
});
