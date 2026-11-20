import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("phaser", () => ({ default: { Scene: class {}, GameObjects: { Container: class {} } } }));
vi.mock("../src/input/handTracker", () => ({ resetAslHold: vi.fn() }));
vi.mock("../src/game/entities/Monster", () => ({ Monster: class {
  front: string;
  constructor(_scene: unknown, _x: number, _y: number, symbols: string[]) { this.front = symbols[0]; }
} }));
vi.mock("../src/game/sfx", () => ({ sfx: {wave: vi.fn(), gameOver: vi.fn()}, setMusicFast: vi.fn() }));
import { initCastPipeline, recognizer } from "../src/input/castPipeline";
import { BASE_SHAPES, LANG_BASE_SHAPES, jitteredStroke, mulberry32 } from "../src/input/shapes";
import type { StrokeName } from "../src/input/events";
beforeAll(() => initCastPipeline());
import { Arena } from "../src/game/scenes/Arena";
import { INCANTATION } from "../src/game/spellCasting";
import { MANA } from "../src/game/spells";
import { spellRecipes } from "../src/game/spellCasting";
import { state } from "../src/state";
import { devControlsEnabled } from "../src/game/devControls";

describe("sequential bosses", () => {
  it("waits for the current boss to leave before spawning the next", () => {
    const arena = new Arena();
    arena["phase"] = "play";
    arena["bossesRemaining"] = 2;
    arena["bossPlan"] = { symbols: ["v"], title: "First boss" };
    arena["subject"] = "shapes";
    arena["level"] = 21;
    arena["roll"] = mulberry32(5);
    const monsters: { boss: boolean }[] = [];
    Object.assign(arena, { monsters, spawner: { done: false } });
    const spawn = vi.spyOn(arena as never as { spawnBoss: (cards: unknown) => void }, "spawnBoss")
      .mockImplementation(() => { monsters.push({ boss: true }); });
    arena["spawnNextBoss"]();
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(arena["bossesRemaining"]).toBe(1);
    arena["spawnNextBoss"]();
    expect(spawn).toHaveBeenCalledTimes(1);
    monsters.length = 0;
    arena["spawnNextBoss"]();
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(arena["bossesRemaining"]).toBe(0);
    monsters.length = 0;
    arena["spawnNextBoss"]();
    expect(spawn).toHaveBeenCalledTimes(2);
  });
  it("spawns all pending bosses once the regular spawns are exhausted and cleared", () => {
    const arena = new Arena();
    const monsters = [{ boss: true, dying: false }, { boss: false, dying: false }];
    Object.assign(arena, { phase: "play", bossesRemaining: 3, monsters,
      spawner: { done: false }, subject: "shapes", level: 30, roll: mulberry32(5) });
    const spawn = vi.spyOn(arena as never as { spawnBoss: (cards: unknown) => void }, "spawnBoss").mockImplementation(() => {});
    arena["spawnNextBoss"]();
    expect(spawn).not.toHaveBeenCalled();
    Object.assign(arena, { spawner: { done: true } });
    arena["spawnNextBoss"]();
    expect(spawn).not.toHaveBeenCalled();
    monsters.pop();
    arena["spawnNextBoss"]();
    expect(spawn).toHaveBeenCalledTimes(3);
    expect(arena["bossesRemaining"]).toBe(0);
  });
  it("halves mana rewards only after wave 30 and still caps mana", () => {
    const arena = new Arena();
    Object.assign(arena, { wave: 30, mana: 0, hud: { setMana: vi.fn() } });
    arena["gainMana"](10);
    expect(arena["mana"]).toBe(10);
    Object.assign(arena, { wave: 31 });
    arena["gainMana"](10);
    expect(arena["mana"]).toBe(15);
    arena["gainMana"](10000);
    expect(arena["mana"]).toBe(MANA.max);
  });
});

describe("developer controls", () => {
  function setup() {
    const arena = new Arena();
    arena["devMode"] = true;
    arena["phase"] = "play";
    Object.assign(arena, { player: { x: 640, y: 360 }, casting: { cast: vi.fn() } });
    const monster = (front: string, distance: number, dying = false) => ({ front, active: true, dying, distanceTo: () => distance });
    Object.assign(arena, { monsters: [monster("hline", 200), monster("v", 20, true), monster("circle", 60)] });
    return arena;
  }

  it("requires explicit URL opt-in", () => {
    expect(devControlsEnabled("?dev=1")).toBe(true);
    expect(devControlsEnabled("?dev=0")).toBe(false);
    expect(devControlsEnabled("?mouse")).toBe(false);
  });
  it("casts the nearest live front through the normal multi-hit path", () => {
    const arena = setup();
    arena["devCastNearest"]();
    expect(arena["casting"].cast).toHaveBeenCalledWith("circle");
  });
  it.each(["paused", "banner", "over", "disabled"])("blocks developer attacks when %s", condition => {
    const arena = setup();
    if (condition === "paused") arena["paused"] = true;
    else if (condition === "disabled") arena["devMode"] = false;
    else arena["phase"] = condition as "banner" | "over";
    arena["devCastNearest"]();
    expect(arena["casting"].cast).not.toHaveBeenCalled();
  });
  it("routes spell slots through normal spell validation and ignores repeats", () => {
    const arena = setup();
    const cast = vi.spyOn(arena as never as { castSpell: (id: string) => boolean }, "castSpell").mockReturnValue(false);
    const event = { key: "2", code: "Digit2", preventDefault: vi.fn() } as unknown as KeyboardEvent;
    arena["onDevKey"](event);
    expect(cast).toHaveBeenCalledWith("water");
    arena["onDevKey"]({ ...event, repeat: true });
    expect(cast).toHaveBeenCalledTimes(1);
  });
  it("toggles 8x timers and animations during wave banners and preserves spell slowdown", () => {
    const arena = setup();
    arena["phase"] = "banner";
    Object.assign(arena, { time: { timeScale: 1 }, tweens: { timeScale: 1 } });
    const event = { code: "KeyT", key: "t", preventDefault: vi.fn() } as unknown as KeyboardEvent;
    arena["onDevKey"](event);
    expect(arena["devSpeed"]).toBe(8);
    expect(arena.time.timeScale).toBe(8);
    expect(arena.tweens.timeScale).toBe(8);
    arena["setSpellTime"](true);
    expect(arena.time.timeScale).toBe(8 * INCANTATION.timeScale);
    arena["setSpellTime"](false);
    expect(arena.time.timeScale).toBe(8);
    arena["onDevKey"](event);
    expect(arena["devSpeed"]).toBe(1);
    expect(arena.time.timeScale).toBe(1);
  });
  it("does not toggle speed when paused, disabled, or a key repeats", () => {
    const arena = setup();
    const event = { code: "KeyT", key: "t", preventDefault: vi.fn() } as unknown as KeyboardEvent;
    arena["paused"] = true;
    arena["onDevKey"](event);
    arena["paused"] = false;
    arena["onDevKey"]({ ...event, repeat: true });
    arena["devMode"] = false;
    arena["onDevKey"](event);
    expect(arena["devSpeed"]).toBe(1);
  });
});

afterEach(() => {
  state.spellCastingActive = false;
  state.spellGesturesEnabled = false;
  state.wanted = [];
  state.wantedMarks = [];
  state.aslLetter = null;
  state.aslProgress = 0;
});

describe("ASL attacks on spawn", () => {
  it.each([
    { subject: "asl", progress: 1, symbol: "asl_V", spell: false, attacks: 1 },
    { subject: "asl", progress: 0.5, symbol: "asl_V", spell: false, attacks: 0 },
    { subject: "asl", progress: 1, symbol: "asl_U", spell: false, attacks: 0 },
    { subject: "shapes", progress: 1, symbol: "asl_V", spell: false, attacks: 0 },
    { subject: "asl", progress: 1, symbol: "asl_V", spell: true, attacks: 0 },
  ] as const)("checks a held sign for $subject at $progress with $symbol (spell=$spell)", ({ subject, progress, symbol, spell, attacks }) => {
    const arena = new Arena();
    arena["subject"] = subject;
    arena["phase"] = "play";
    const cast = vi.fn();
    Object.assign(arena, { casting: { cast } });
    state.aslLetter = "V";
    state.aslProgress = progress;
    if (spell) arena["incantation"].beginFrom("spell_thumbs_up", ["fire", "water"], "asl", 100, 0);
    const order = { angle: 0, symbols: [symbol], speed: 20, palette: 0 };
    arena["spawn"](order);
    arena["spawn"](order);
    expect(cast).toHaveBeenCalledTimes(attacks * 2);
    if (attacks) {
      expect(cast).toHaveBeenNthCalledWith(1, "asl_V", 0, arena.monsters[0]);
      expect(cast).toHaveBeenNthCalledWith(2, "asl_V", 0, arena.monsters[1]);
    }
  });
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


describe("explicit language submission", () => {
  const bases = { ...BASE_SHAPES, ...LANG_BASE_SHAPES };
  const draw = (name: StrokeName) => jitteredStroke(bases[name][0], mulberry32(23), { size: 180, vertexJitter: 0, pointNoise: 0, rotJitterDeg: 0 }).map((point, t) => ({ ...point, t }));
  function setup(subject: "chinese" | "japanese") {
    const arena = new Arena();
    arena["subject"] = subject;
    arena["phase"] = "play";
    const casting = { holdLast: vi.fn(), releaseHeld: vi.fn(), cast: vi.fn() };
    Object.assign(arena, { casting });
    return { arena, casting };
  }

  it("retains strokes without attacking until submission, including ambiguous prefixes", () => {
    const { arena, casting } = setup("chinese");
    arena["onLanguageStroke"](draw("hline"));
    arena["onLanguageStroke"](draw("hline"));
    expect(casting.cast).not.toHaveBeenCalled();
    expect(casting.holdLast).toHaveBeenCalledTimes(2);
    expect(arena["languageStrokes"]).toHaveLength(2);
    arena["submitLanguage"]();
    expect(casting.cast).toHaveBeenCalledWith("lang_hline-hline", 0);
    expect(arena["languageStrokes"]).toEqual([]);
    arena["submitLanguage"]();
    expect(casting.cast).toHaveBeenCalledTimes(1);
  });

  it("submits individual hiragana and clears the buffer between characters", () => {
    const { arena, casting } = setup("japanese");
    arena["onLanguageStroke"](draw("no"));
    arena["submitLanguage"]();
    expect(casting.cast).toHaveBeenLastCalledWith("lang_no", 0);
    arena["onLanguageStroke"](draw("vline"));
    arena["onLanguageStroke"](draw("vline"));
    arena["submitLanguage"]();
    expect(casting.cast).toHaveBeenLastCalledWith("lang_vline-vline", 0);
  });

  it("does not recognize or discard unfamiliar or tiny strokes before submission", () => {
    const { arena, casting } = setup("japanese");
    const read = vi.spyOn(recognizer, "recognize");
    try {
      const tiny = [{ x: 1, y: 1, t: 0 }, { x: 2, y: 3, t: 16 }];
      arena["onLanguageStroke"](tiny);
      arena["onLanguageStroke"](draw("ku"));
      expect(read).not.toHaveBeenCalled();
      expect(arena["languageStrokes"]).toHaveLength(2);
      expect(casting.holdLast).toHaveBeenCalledTimes(2);
      arena["submitLanguage"]();
      expect(read).toHaveBeenCalledTimes(2);
      expect(casting.cast).toHaveBeenCalledWith("lang_unrecognized-ku", 0);
    } finally { read.mockRestore(); }
  });

  it("submits a complete Chinese character to an armed spell", () => {
    const { arena, casting } = setup("chinese");
    const recipe = spellRecipes(["fire", "water"], "chinese")[1];
    // Water starts with person, represented by the two-sided descending stroke.
    arena["incantation"].beginFrom("spell_thumbs_up", ["fire", "water"], "chinese", 100, 0);
    const route = vi.fn((sign: string) => { arena["incantation"].input(sign, 100); return true; });
    Object.assign(arena, { routeSpellSign: route });
    arena["onLanguageStroke"](draw("caret"));
    expect(route).not.toHaveBeenCalled();
    arena["submitLanguage"]();
    expect(route).toHaveBeenCalledWith(recipe.steps[0].token);
    expect(arena["incantation"].active?.id).toBe("water");
    expect(arena["incantation"].active?.step).toBe(1);
    expect(casting.cast).not.toHaveBeenCalled();
  });

  it("allows clearing a mistake without attacking", () => {
    const { arena, casting } = setup("japanese");
    arena["onLanguageStroke"](draw("ku"));
    arena["clearLanguage"]();
    arena["submitLanguage"]();
    expect(arena["languageStrokes"]).toEqual([]);
    expect(casting.releaseHeld).toHaveBeenCalled();
    expect(casting.cast).not.toHaveBeenCalled();
  });
});


describe("completed spell characters", () => {
  it.each(["shapes", "asl", "math", "korean", "japanese", "chinese"] as const)("clears ink immediately after a character in %s", subject => {
    const arena = new Arena();
    arena["subject"] = subject;
    arena["phase"] = "play";
    arena["spells"] = true;
    const clearCompletedInk = vi.fn();
    Object.assign(arena, { casting: { clearCompletedInk } });
    const now = performance.now();
    arena["incantation"].beginFrom("spell_thumbs_up", ["fire", "water"], subject, 100, now);
    const first = spellRecipes(["fire", "water"], subject)[0].steps[0].token;
    expect(arena["routeSpellSign"](first)).toBe(true);
    expect(arena["incantation"].active?.step).toBe(1);
    expect(clearCompletedInk).toHaveBeenCalledTimes(1);
  });
});


describe("paused gameplay", () => {
  it("does not advance gameplay or expire a spell while the menu is open", () => {
    const arena = new Arena();
    arena["paused"] = true;
    const tick = vi.spyOn(arena["incantation"], "tick");
    arena.update(100000, 1000);
    expect(tick).not.toHaveBeenCalled();
    expect(arena["worldTime"]).toBe(0);
  });

  it("preserves the remaining spell deadline across a long pause", () => {
    const arena = new Arena();
    const spell = arena["incantation"];
    spell.beginFrom("spell_thumbs_up", ["fire", "water"], "shapes", 100, 100);
    const remaining = spell.remaining(600);
    spell.defer(60000);
    expect(spell.remaining(60600)).toBe(remaining);
    expect(spell.tick(60600)).toBeNull();
    expect(spell.tick(60600 + remaining)?.reason).toBe("too slow");
  });
});


describe("pause menu clicks", () => {
  function setup() {
    const arena = new Arena();
    arena["paused"] = true;
    const resume = vi.fn();
    const exit = vi.fn();
    Object.assign(arena, { setPaused: resume, exitRound: exit });
    return { arena, resume, exit };
  }

  it("resumes outside the menu", () => {
    const { arena, resume, exit } = setup();
    arena["onPauseClick"](100, 600);
    expect(resume).toHaveBeenCalledWith(false);
    expect(exit).not.toHaveBeenCalled();
  });

  it("ignores the heading and empty menu space", () => {
    const { arena, resume, exit } = setup();
    arena["onPauseClick"](640, 302);
    arena["onPauseClick"](640, 360);
    expect(resume).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });

  it("handles Continue and Exit separately", () => {
    const { arena, resume, exit } = setup();
    arena["onPauseClick"](790, 412);
    expect(resume).toHaveBeenCalledWith(false);
    expect(exit).not.toHaveBeenCalled();
    arena["onPauseClick"](490, 412);
    expect(exit).toHaveBeenCalledOnce();
  });
});
