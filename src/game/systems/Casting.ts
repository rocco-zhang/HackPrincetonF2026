import Phaser from "phaser";
import { ARENA } from "../../config";
import type { CastName, Pt } from "../../input/events";
import { beautify } from "../../input/smooth";
import { state } from "../../state";
import type { Monster } from "../entities/Monster";
import type { Player } from "../entities/Player";
import { ACCENT, castColor, INK } from "../palette";
import { sfx } from "../sfx";
import type { Fx } from "./Fx";

type FadingTrail = { pts: Pt[]; color: number; age: number; at: number };
/** Kept strokes are fainter than the one being drawn, so the new stroke reads clearly on top. */
const HELD_ALPHA = 0.5;

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
  private cursors = new Map<number, { root: Phaser.GameObjects.Container; ring: Phaser.GameObjects.Arc; dot: Phaser.GameObjects.Image }>();
  private cursorAt = new Map<number, number>();
  private currents = new Map<number, Pt[]>();
  private fading: FadingTrail[] = [];
  /** Strokes kept on screen because they are part of a card or number that isn't finished yet. */
  private held: FadingTrail[] = [];
  /** The strokes a finished card was made of, handed from releaseHeld to the cast that follows it. */
  private finished: FadingTrail[] = [];
  private lastByHand = new Map<number, FadingTrail>();

  constructor(
    private scene: Phaser.Scene,
    private host: CastHost,
  ) {
    this.gfx = scene.add.graphics().setDepth(700);
    this.cursorFor(0);
  }

  private cursorFor(hand: number) {
    let cursor = this.cursors.get(hand);
    if (!cursor) {
      const ring = this.scene.add.circle(0, 0, 16, 0xfffefa, 0.6).setStrokeStyle(3, INK, 0.9);
      const dot = this.scene.add.image(0, 0, "star").setScale(0.55).setTint(ACCENT).setVisible(false);
      const root = this.scene.add.container(-100, -100, [ring, dot]).setDepth(960);
      cursor = { root, ring, dot };
      this.cursors.set(hand, cursor);
    }
    return cursor;
  }

  onCursor(p: Pt, inking: boolean, hand = 0) {
    const cursor = this.cursorFor(hand);
    this.cursorAt.set(hand, performance.now());
    cursor.root.setVisible(!state.aslActive || (state.spellRunesEnabled && !state.spellCastingActive && inking));
    cursor.root.setPosition(p.x, p.y);
    cursor.ring.setRadius(inking ? 11 : 16).setStrokeStyle(3, inking ? ACCENT : INK, inking ? 1 : 0.9);
    cursor.dot.setVisible(inking);
  }

  onStrokeStart(p: Pt, hand = 0) {
    this.currents.set(hand, [p]);
  }

  onStrokePoint(p: Pt, hand = 0) {
    this.currents.get(hand)?.push(p);
  }

  cancelStroke(hand=0) {
    this.currents.delete(hand);
  }

  onStrokeEnd(hand = 0) {
    const pts = this.currents.get(hand) ?? [];
    this.currents.delete(hand);
    if (pts.length > 1) {
      const trail: FadingTrail = { pts, color: INK, age: 0, at: performance.now() };
      this.fading.push(trail);
      this.lastByHand.set(hand, trail);
    }
  }

  /** Keep the stroke that was just drawn visible (dimmed) while the card or number it belongs to is unfinished. */
  holdLast(hand = 0) {
    const trail = this.lastByHand.get(hand);
    if (!trail || this.held.includes(trail)) return;
    this.fading = this.fading.filter((f) => f !== trail);
    trail.color = INK;
    this.held.push(trail);
  }

  /** Let the kept strokes go. They fade out together, in `color` when the card they made was cast. */
  releaseHeld(color?: number) {
    for (const trail of this.held) {
      trail.age = color === undefined ? 0 : -0.1;
      if (color !== undefined) trail.color = color;
      this.fading.push(trail);
    }
    this.finished = color === undefined ? [] : this.held;
    this.held = [];
  }

  /** A stroke is being drawn right now. */
  get drawing() {
    return this.currents.size > 0;
  }

  get holding() {
    return this.held.length > 0;
  }

  onFizzle(points: Pt[], hand = 0) {
    const trail = this.lastByHand.get(hand);
    if (trail) trail.color = 0xb5b0a5;
    const end = points[points.length - 1] ?? { x: ARENA.width / 2, y: ARENA.height / 2 };
    this.host.fx.puff(end.x, end.y);
    this.host.fx.floatText(end.x, end.y - 20, "oops", "#8a857a", 18);
    sfx.fizzle();
  }

  cast(name: CastName, hand = 0) {
    const color = castColor(name);
    const trail = this.lastByHand.get(hand);
    if (trail) {
      trail.color = color;
      trail.age = -0.1; // linger a bit longer when it worked
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
    // it hit something: the figure writes what was drawn in the air (nothing to write for a signed letter)
    const drawn = [...new Set([...this.finished, ...(trail && performance.now() - trail.at < 1000 ? [trail] : [])])];
    this.finished = [];
    if (multi > 0 && drawn.length) player.airDraw(drawn.map((t) => (state.langActive ? t.pts : beautify(t.pts))), color);

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
    const now = performance.now();
    for (const [hand, cursor] of this.cursors) {
      if (now - (this.cursorAt.get(hand) ?? 0) > 250) cursor.root.setVisible(false);
    }
    for (const f of this.fading) f.age += dt;
    this.fading = this.fading.filter((f) => f.age < 0.45);
    for (const f of this.fading) {
      const a = 1 - Math.max(0, f.age) / 0.45;
      this.drawTrail(f.pts, f.color, a);
    }
    for (const h of this.held) this.drawTrail(h.pts, h.color, HELD_ALPHA);
    for (const pts of this.currents.values()) {
      if (pts.length > 1) this.drawTrail(pts, INK, 1);
    }
  }

  private drawTrail(pts: Pt[], color: number, alpha: number) {
    const g = this.gfx;
    const shown = state.langActive ? pts : beautify(pts);
    const pass = (width: number, c: number, a: number) => {
      g.lineStyle(width, c, a);
      g.beginPath();
      g.moveTo(shown[0].x, shown[0].y);
      for (let i = 1; i < shown.length; i++) g.lineTo(shown[i].x, shown[i].y);
      g.strokePath();
    };
    // pencil line; dots round off the joins and ends
    pass(5.5, color, 0.92 * alpha);
    g.fillStyle(color, 0.92 * alpha);
    for (const p of shown) g.fillCircle(p.x, p.y, 2.75);
  }
}
