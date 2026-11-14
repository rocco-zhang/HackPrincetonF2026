import Phaser from "phaser";
import { ARENA } from "../../config";
import type { CastName, Pt } from "../../input/events";
import { state } from "../../state";
import type { Monster } from "../entities/Monster";
import type { Player } from "../entities/Player";
import { ACCENT, castColor, INK } from "../palette";
import { sfx } from "../sfx";
import type { Fx } from "./Fx";

type FadingTrail = { pts: Pt[]; color: number; age: number };

export interface CastHost {
  player: Player;
  monsters: Monster[];
  fx: Fx;
  /** Called when a spell reaches a monster (after the symbol was removed logically). */
  onSpellLanded(m: Monster, name: CastName, killed: boolean, multi: number): void;
  /** Called once per cast with the monsters it hit. */
  onCast(name: CastName, hits: Monster[]): void;
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
    this.gfx = scene.add.graphics().setDepth(700);
    this.cursorRing = scene.add.circle(0, 0, 16, 0xfffefa, 0.6).setStrokeStyle(3, INK, 0.9);
    this.cursorDot = scene.add.image(0, 0, "star").setScale(0.55).setTint(ACCENT).setVisible(false);
    this.cursor = scene.add.container(-100, -100, [this.cursorRing, this.cursorDot]).setDepth(960);
  }

  onCursor(p: Pt, inking: boolean) {
    this.cursor.setVisible(!state.aslActive);
    this.cursor.setPosition(p.x, p.y);
    this.cursorRing.setRadius(inking ? 11 : 16).setStrokeStyle(3, inking ? ACCENT : INK, inking ? 1 : 0.9);
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
      this.lastEnded = { pts: this.current, color: INK, age: 0 };
      this.fading.push(this.lastEnded);
    }
    this.current = [];
  }

  onFizzle(points: Pt[]) {
    if (this.lastEnded) this.lastEnded.color = 0xb5b0a5;
    const end = points[points.length - 1] ?? { x: ARENA.width / 2, y: ARENA.height / 2 };
    this.host.fx.puff(end.x, end.y);
    this.host.fx.floatText(end.x, end.y - 20, "oops", "#8a857a", 18);
    sfx.fizzle();
  }

  cast(name: CastName) {
    const color = castColor(name);
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
      const bolt = this.scene.add.image(player.x, player.y, "star").setTint(color).setScale(1.3).setDepth(800);
      this.scene.tweens.add({ targets: bolt, angle: 360, duration: 300, repeat: -1 });
      const tail = this.scene.add.particles(0, 0, "star", {
        follow: bolt,
        lifespan: 280,
        scale: { start: 0.6, end: 0 },
        rotate: { min: 0, max: 360 },
        tint: color,
        frequency: 14,
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
    if (this.current.length > 1) this.drawTrail(this.current, INK, 1);
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
    // pencil line; dots round off the joins and ends
    pass(5.5, color, 0.92 * alpha);
    g.fillStyle(color, 0.92 * alpha);
    for (const p of pts) g.fillCircle(p.x, p.y, 2.75);
  }
}
