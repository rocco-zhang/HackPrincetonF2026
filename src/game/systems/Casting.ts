import Phaser from "phaser";
import { ARENA } from "../../config";
import type { Pt, SymbolName } from "../../input/events";
import type { Monster } from "../entities/Monster";
import type { Player } from "../entities/Player";
import { SYMBOL_COLOR } from "../palette";
import { sfx } from "../sfx";
import type { Fx } from "./Fx";

type FadingTrail = { pts: Pt[]; color: number; age: number };

export interface CastHost {
  player: Player;
  monsters: Monster[];
  fx: Fx;
  /** Called when a spell reaches a monster (after the symbol was removed logically). */
  onSpellLanded(m: Monster, name: SymbolName, killed: boolean, multi: number): void;
  /** Called once per cast with the monsters it hit. */
  onCast(name: SymbolName, hits: Monster[]): void;
}

/** Cursor, ink trail, and turning recognized symbols into spells. */
export class Casting {
  private gfx: Phaser.GameObjects.Graphics;
  private cursor: Phaser.GameObjects.Container;
  private cursorRing: Phaser.GameObjects.Arc;
  private cursorDot: Phaser.GameObjects.Image;
  private current: Pt[] = [];
  private fading: FadingTrail[] = [];
  private lastEnded: FadingTrail | null = null;

  constructor(
    private scene: Phaser.Scene,
    private host: CastHost,
  ) {
    this.gfx = scene.add.graphics().setDepth(700).setBlendMode(Phaser.BlendModes.SCREEN);
    this.cursorRing = scene.add.circle(0, 0, 16).setStrokeStyle(3, 0xffffff, 0.9);
    this.cursorDot = scene.add.image(0, 0, "spark").setScale(0.7).setBlendMode(Phaser.BlendModes.SCREEN).setVisible(false);
    this.cursor = scene.add.container(-100, -100, [this.cursorRing, this.cursorDot]).setDepth(960);
  }

  onCursor(p: Pt, inking: boolean) {
    this.cursor.setPosition(p.x, p.y);
    this.cursorRing.setRadius(inking ? 10 : 16).setStrokeStyle(3, inking ? 0xffe9a8 : 0xffffff, inking ? 1 : 0.8);
    this.cursorDot.setVisible(inking);
  }

  onStrokeStart(p: Pt) {
    this.current = [p];
  }

  onStrokePoint(p: Pt) {
    this.current.push(p);
  }

  onStrokeEnd() {
    if (this.current.length > 1) {
      this.lastEnded = { pts: this.current, color: 0xffffff, age: 0 };
      this.fading.push(this.lastEnded);
    }
    this.current = [];
  }

  onFizzle(points: Pt[]) {
    if (this.lastEnded) this.lastEnded.color = 0x6f6880;
    const end = points[points.length - 1] ?? { x: ARENA.width / 2, y: ARENA.height / 2 };
    this.host.fx.puff(end.x, end.y);
    this.host.fx.floatText(end.x, end.y - 20, "fizzle", "#9c95b0", 18);
    sfx.fizzle();
  }

  cast(name: SymbolName) {
    const color = SYMBOL_COLOR[name];
    if (this.lastEnded) {
      this.lastEnded.color = color;
      this.lastEnded.age = -0.1; // linger a bit longer when it worked
    }
    sfx.symbol(name);
    const { player } = this.host;
    player.castPulse(color);

    const targets = this.host.monsters.filter(
      (m) => !m.dying && m.front === name && m.x > -20 && m.x < ARENA.width + 20 && m.y > -20 && m.y < ARENA.height + 20,
    );
    for (const m of targets) {
      m.queue.shift();
      if (m.queue.length === 0) m.dying = true;
    }
    this.host.onCast(name, targets);
    const multi = targets.length;

    targets.forEach((m, i) => {
      const killed = m.queue.length === 0;
      const bolt = this.scene.add.image(player.x, player.y, "spark").setTint(color).setScale(1.4).setBlendMode(Phaser.BlendModes.SCREEN).setDepth(800);
      const tail = this.scene.add.particles(0, 0, "spark", {
        follow: bolt,
        lifespan: 260,
        scale: { start: 0.7, end: 0 },
        alpha: { start: 0.8, end: 0 },
        tint: color,
        frequency: 12,
        blendMode: Phaser.BlendModes.SCREEN,
      }).setDepth(799);
      const d = Phaser.Math.Distance.Between(player.x, player.y, m.x, m.y);
      this.scene.tweens.add({
        targets: bolt,
        x: m.x,
        y: m.y - 10,
        delay: i * 40,
        duration: Math.max(110, (d / 1900) * 1000),
        ease: "Quad.easeIn",
        onComplete: () => {
          bolt.destroy();
          tail.stop();
          this.scene.time.delayedCall(300, () => tail.destroy());
          this.host.onSpellLanded(m, name, killed, multi);
        },
      });
    });
  }

  update(dt: number) {
    const g = this.gfx;
    g.clear();
    for (const f of this.fading) f.age += dt;
    this.fading = this.fading.filter((f) => f.age < 0.45);
    for (const f of this.fading) {
      const a = 1 - Math.max(0, f.age) / 0.45;
      this.drawTrail(f.pts, f.color, a);
    }
    if (this.current.length > 1) this.drawTrail(this.current, 0xffd36b, 1);
  }

  private drawTrail(pts: Pt[], color: number, alpha: number) {
    const g = this.gfx;
    const pass = (width: number, c: number, a: number) => {
      g.lineStyle(width, c, a);
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
      g.strokePath();
    };
    pass(22, color, 0.12 * alpha);
    pass(12, color, 0.3 * alpha);
    pass(5, 0xffffff, 0.9 * alpha);
  }
}
