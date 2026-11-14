import Phaser from "phaser";
import { ARENA, GAME } from "../../config";
import { onInput, type SymbolName } from "../../input/events";
import { mulberry32 } from "../../input/shapes";
import { state } from "../../state";
import { Monster } from "../entities/Monster";
import { Player } from "../entities/Player";
import { INK_CSS, MONSTER_PALETTES, ORANGE_CSS, ACCENT_CSS, SYMBOL_COLOR } from "../palette";
import { sfx } from "../sfx";
import { Casting, type CastHost } from "../systems/Casting";
import { Fx } from "../systems/Fx";
import { Hud } from "../systems/Hud";
import { DEMO_SEED, edgePoint, Spawner, type SpawnOrder } from "../systems/Spawner";

const MULTI_NAMES = ["", "", "Double!", "Triple!", "Quad!", "Mega!"];

export class Arena extends Phaser.Scene implements CastHost {
  player!: Player;
  monsters: Monster[] = [];
  fx!: Fx;
  private hud!: Hud;
  private casting!: Casting;
  private spawner!: Spawner;
  private hearts = GAME.hearts;
  private score = 0;
  private streak = 0;
  private wave = 0;
  private phase: "banner" | "play" | "over" = "banner";
  private demo = false;

  constructor() {
    super("Arena");
  }

  init(data: { demo?: boolean }) {
    this.demo = !!data?.demo;
    this.monsters = [];
    this.hearts = GAME.hearts;
    this.score = 0;
    this.streak = 0;
    this.wave = 0;
    this.phase = "banner";
  }

  create() {
    const cx = ARENA.width / 2, cy = ARENA.height / 2;
    this.add.image(cx, cy, "floor").setDepth(-10);
    this.player = new Player(this, cx, cy);
    this.fx = new Fx(this);
    this.casting = new Casting(this, this);
    this.hud = new Hud(this);
    this.hud.setHearts(this.hearts);
    this.spawner = new Spawner(this.demo ? mulberry32(DEMO_SEED) : Math.random, this.demo ? 0.85 : 1);

    const off = onInput((e) => {
      switch (e.type) {
        case "cursor": return this.casting.onCursor(e.p, e.inking);
        case "strokeStart": return this.casting.onStrokeStart(e.p);
        case "strokePoint": return this.casting.onStrokePoint(e.p);
        case "strokeEnd": return this.casting.onStrokeEnd();
        case "symbol": if (this.phase !== "over") this.casting.cast(e.name); return;
        case "fizzle": if (this.phase !== "over") this.casting.onFizzle(e.points); return;
      }
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      off();
      state.wanted = [];
    });
    this.input.keyboard?.on("keydown-ESC", () => this.scene.start("Title"));

    this.startWave(1);
  }

  private startWave(n: number) {
    this.wave = n;
    this.phase = "banner";
    this.hud.setWave(n);
    const sub = n === 1 ? (this.demo ? "demo run" : "draw the shape taped to a monster to tear it up") : n === 3 ? "new shape: zigzag. Monsters now carry more than one" : n === 2 ? "new shapes: Λ and ◯" : undefined;
    this.fx.banner(`Wave ${n}`, INK_CSS, sub, 1200);
    sfx.wave();
    this.time.delayedCall(GAME.breather * 1000, () => {
      if (this.phase === "over") return;
      this.spawner.startWave(n);
      if (this.demo && n === 1) this.scriptDemoOpening();
      this.phase = "play";
    });
  }

  /** Three monsters with the same symbol, so the demo shows a triple hit early. */
  private scriptDemoOpening() {
    const speed = this.spawner.speed;
    const mk = (angle: number, palette: number): SpawnOrder => ({ angle, symbols: ["v"], speed, palette });
    this.spawner.script([
      { at: 0.2, order: mk(Math.PI, 0) },
      { at: 0.5, order: mk(-Math.PI / 5, 1) },
      { at: 0.8, order: mk(Math.PI / 4, 2) },
    ]);
  }

  private spawn(o: SpawnOrder) {
    const p = edgePoint(o.angle);
    this.monsters.push(new Monster(this, p.x, p.y, o.symbols, o.speed, o.palette));
  }

  update(_t: number, deltaMs: number) {
    const dt = Math.min(0.05, deltaMs / 1000);
    this.casting.update(dt);
    this.hud.update(this.score);
    const fronts = this.monsters.filter((m) => !m.dying && m.front).map((m) => m.front!) as SymbolName[];
    state.wanted = this.phase === "over" ? [] : fronts;
    if (this.phase === "over") return;

    if (this.phase === "play") {
      for (const o of this.spawner.update(dt, fronts)) this.spawn(o);
    }

    const { x: px, y: py } = this.player;
    for (const m of [...this.monsters]) {
      m.step(dt, px, py);
      if (!m.dying && m.distanceTo(px, py) < GAME.contactDistance) this.contact(m);
      if (this.hearts <= 0) return;
    }

    if (this.phase === "play" && this.spawner.done && this.monsters.length === 0) {
      const bonus = 500 * this.wave;
      this.score += bonus;
      this.fx.floatText(px, py - 90, `wave clear +${bonus}`, ORANGE_CSS, 28);
      this.startWave(this.wave + 1);
    }
  }

  private get streakMult() {
    return Math.min(GAME.streakMaxMult, 1 + Math.floor(this.streak / GAME.streakStep) * 0.5);
  }

  onCast(name: SymbolName, hits: Monster[]) {
    if (hits.length === 0) {
      this.fx.floatText(this.player.x, this.player.y - 70, "no monster needs that", "#8a857a", 16);
      return;
    }
    this.streak++;
    this.hud.setMultiplier(this.streakMult);
    if (hits.length >= 2) {
      const label = MULTI_NAMES[Math.min(hits.length, MULTI_NAMES.length - 1)];
      const c = SYMBOL_COLOR[name];
      this.cameras.main.flash(160, (c >> 16) & 255, (c >> 8) & 255, c & 255);
      this.cameras.main.shake(220, 0.008);
      this.fx.banner(label, ACCENT_CSS, `×${Math.min(3, hits.length)} score`, 350);
      sfx.multi(hits.length);
    }
  }

  onSpellLanded(m: Monster, name: SymbolName, killed: boolean, multi: number) {
    if (!m.active) return;
    const color = SYMBOL_COLOR[name];
    const mult = multi >= 3 ? 3 : multi >= 2 ? 2 : 1;
    const pts = Math.round((GAME.scorePerSymbol + (killed ? GAME.scorePerKill : 0)) * mult * this.streakMult);
    this.score += pts;
    this.fx.floatText(m.x, m.y - 40, `+${pts}`, killed ? ORANGE_CSS : INK_CSS, killed ? 28 : 22);
    m.bubble.popFront();
    m.flashHit();
    this.fx.burst(m.x, m.y - 10, color, 12);
    sfx.hit();
    if (killed) this.kill(m);
  }

  private kill(m: Monster) {
    this.removeMonster(m);
    const rim = Phaser.Display.Color.HexStringToColor(MONSTER_PALETTES[m.palette].rim).color;
    this.fx.burst(m.x, m.y, rim, 36);
    this.fx.burst(m.x, m.y, 0xffffff, 14);
    this.cameras.main.shake(120, 0.005);
    sfx.kill();
    this.tweens.add({
      targets: m,
      scale: 1.6,
      alpha: 0,
      angle: Phaser.Math.Between(-25, 25),
      duration: 260,
      ease: "Quad.easeOut",
      onComplete: () => m.destroy(),
    });
  }

  private contact(m: Monster) {
    this.removeMonster(m);
    this.fx.puff(m.x, m.y, 0x8a857a, 20);
    this.fx.burst(this.player.x, this.player.y, 0xff4d6d, 30);
    m.destroy();
    this.hearts--;
    this.streak = 0;
    this.hud.setMultiplier(1);
    this.hud.setHearts(this.hearts);
    this.player.hurt();
    this.cameras.main.shake(300, 0.018);
    this.cameras.main.flash(200, 255, 40, 80);
    sfx.hurt();
    if (this.hearts <= 0) this.gameOver();
  }

  private removeMonster(m: Monster) {
    const i = this.monsters.indexOf(m);
    if (i >= 0) this.monsters.splice(i, 1);
  }

  private gameOver() {
    this.phase = "over";
    sfx.gameOver();
    for (const m of this.monsters) this.tweens.add({ targets: m, alpha: 0.3, duration: 400 });
    this.time.delayedCall(1300, () =>
      this.scene.start("GameOver", { score: this.score, wave: this.wave, demo: this.demo }),
    );
  }
}
