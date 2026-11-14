import Phaser from "phaser";
import { onInput } from "../../input/events";

/**
 * "Pinch (or hold the mouse button) for N ms" → callback. Teaches the pinch gesture
 * before the game starts. Space / Enter also work.
 */
export class HoldToStart {
  private heldSince: number | null = null;
  private pos = { x: -100, y: -100 };
  private ring: Phaser.GameObjects.Graphics;
  private dot: Phaser.GameObjects.Arc;
  private fired = false;
  /** Which pointer is holding. */
  private owner: "mouse" | "hand" | null = null;
  /** That pointer's current press began somewhere ignored; it doesn't count until released. */
  private ignoring: "mouse" | "hand" | null = null;

  constructor(
    scene: Phaser.Scene,
    private ms: number,
    private ignoreAt: ((x: number, y: number) => boolean) | null,
    private onDone: () => void,
  ) {
    this.ring = scene.add.graphics().setDepth(1000);
    this.dot = scene.add.circle(-100, -100, 14, 0xfffefa, 0.6).setStrokeStyle(3, 0x33312e, 0.9).setDepth(1000);
    const off = onInput((e) => {
      if (e.type !== "cursor") return;
      // the mouse and the hand are separate pointers: whichever started the hold owns it
      const src = e.src ?? "hand";
      if (this.owner && this.owner !== src) return;
      if (src === "hand") this.dot.setPosition(e.p.x, e.p.y).setRadius(e.inking ? 10 : 14);
      if (!e.inking) {
        if (this.owner === src) {
          this.heldSince = null;
          this.owner = null;
        }
        if (this.ignoring === src) this.ignoring = null;
        return;
      }
      this.pos = { x: e.p.x, y: e.p.y };
      if (this.heldSince === null && this.ignoring !== src) {
        if (this.ignoreAt?.(e.p.x, e.p.y)) this.ignoring = src;
        else {
          this.heldSince = performance.now();
          this.owner = src;
        }
      }
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

  /** Allow it to fire again (when a start was refused). */
  rearm() {
    this.fired = false;
    this.heldSince = null;
    this.owner = null;
  }

  update() {
    this.ring.clear();
    if (this.heldSince === null || this.fired) return;
    const p = Math.min(1, (performance.now() - this.heldSince) / this.ms);
    this.ring.lineStyle(5, 0xd7372f, 1);
    this.ring.beginPath();
    this.ring.arc(this.pos.x, this.pos.y, 26, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
    this.ring.strokePath();
    if (p >= 1) this.fire();
  }
}
