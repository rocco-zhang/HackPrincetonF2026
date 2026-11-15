import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("phaser", () => ({ default: { Scene: class {}, GameObjects: { Container: class {} } } }));
vi.mock("../src/input/handTracker", () => ({ resetAslHold: vi.fn() }));
vi.mock("../src/game/sfx", () => ({ sfx: {wave: vi.fn(), gameOver: vi.fn()}, setMusicFast: vi.fn() }));
import { Arena } from "../src/game/scenes/Arena";
import { INCANTATION } from "../src/game/spellCasting";
import { state } from "../src/state";

afterEach(() => {
  state.spellCastingActive = false;
  state.spellGesturesEnabled = false;
  state.wanted = [];
  state.wantedMarks = [];
});

describe("multiplayer round end during spellcasting", () => {
  it.each(["opponent died", "opponent disconnected"])("restores normal time immediately when %s", reason => {
    const arena = new Arena();
    arena["phase"] = "play";
    const delayedCall = vi.fn();
    Object.assign(arena, {
      time: { timeScale: INCANTATION.timeScale, delayedCall },
      tweens: { timeScale: INCANTATION.timeScale, add: vi.fn() },
    });
    arena["incantation"].beginFrom("spell_thumbs_up", ["fire", "water"], "asl", 100, 0);
    state.spellCastingActive = true;
    state.spellGesturesEnabled = true;
    state.wanted = ["asl_F"];
    arena["endVersus"](true, reason);
    expect(arena.time.timeScale).toBe(1);
    expect(arena.tweens.timeScale).toBe(1);
    expect(arena["incantation"].tick(100_000)).toBeNull();
    expect(state.spellCastingActive).toBe(false);
    expect(state.spellGesturesEnabled).toBe(false);
    expect(state.wanted).toEqual([]);
    expect(delayedCall).toHaveBeenCalledWith(1100, expect.any(Function));
    arena["endVersus"](true, reason);
    expect(delayedCall).toHaveBeenCalledTimes(1);
  });
});
