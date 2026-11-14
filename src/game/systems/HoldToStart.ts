import Phaser from "phaser";
import { onInput } from "../../input/events";

/**
 * "Pinch (or hold the mouse) for N ms" → callback. Teaches the pinch gesture
 * before the game starts. Space / Enter also work.
 */
export class HoldToStart {
  private heldSince: number | null = null;
  private pos = { x: -100, y: -100 };
  private ring: Phaser.GameObjects.Graphics;
  private dot: Phaser.GameObjects.Arc;
  private fired = false;

  constructor(
    scene: Phaser.Scene,
    private ms: number,
    private onDone: () => void,
  ) {
    this.ring = scene.add.graphics().setDepth(1000);
    this.dot = scene.add.circle(-100, -100, 14).setStrokeStyle(3, 0xffffff, 0.9).setDepth(1000);
    const off = onInput((e) => {
      if (e.type !== "cursor") return;
      this.pos = { x: e.p.x, y: e.p.y };
      this.dot.setPosition(e.p.x, e.p.y).setRadius(e.inking ? 10 : 14);
      if (e.inking) this.heldSince ??= performance.now();
      else this.heldSince = null;
    });
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, off);
    const kb = scene.input.keyboard;
    kb?.on("keydown-SPACE", () => this.fire());
    kb?.on("keydown-ENTER", () => this.fire());
  }

  private fire() {
    if (this.fired) return;
    this.fired = true;
    this.onDone();
  }

  update() {
    this.ring.clear();
    if (this.heldSince === null || this.fired) return;
    const p = Math.min(1, (performance.now() - this.heldSince) / this.ms);
    this.ring.lineStyle(5, 0xffd36b, 1);
    this.ring.beginPath();
    this.ring.arc(this.pos.x, this.pos.y, 26, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
    this.ring.strokePath();
    if (p >= 1) this.fire();
  }
}
