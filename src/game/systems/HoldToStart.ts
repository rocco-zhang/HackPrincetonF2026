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
  private handOwner: number | null = null;
  private handSeen = -Infinity;
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
      if (e.type === "strokeCancel" && this.owner === "hand" && (e.hand ?? 0) === this.handOwner) {
        this.heldSince = null;
        this.owner = null;
        this.handOwner = null;
      }
      if (e.type !== "cursor") return;
      // the mouse and the hand are separate pointers: whichever started the hold owns it
      const src = e.src ?? "hand";
      if (this.owner && this.owner !== src) return;
      if (this.owner === "hand" && (e.hand ?? 0) !== this.handOwner) return;
      if (src === "hand") {
        this.handSeen = performance.now();
        this.dot.setVisible(true).setPosition(e.p.x, e.p.y).setRadius(e.inking ? 10 : 14);
      }
      if (!e.inking) {
        if (this.owner === src) {
          this.heldSince = null;
          this.owner = null;
          this.handOwner = null;
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
          this.handOwner = src === "hand" ? e.hand ?? 0 : null;
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
    this.handOwner = null;
  }

  update() {
    this.ring.clear();
    // A stopped camera produces no release event. Never finish a hold on stale evidence.
    if (this.owner === "hand" && performance.now() - this.handSeen > 200) {
      this.heldSince = null;
      this.owner = null;
      this.handOwner = null;
      this.dot.setVisible(false);
    }
    if (this.heldSince === null || this.fired) return;
    const p = Math.min(1, (performance.now() - this.heldSince) / this.ms);
    this.ring.lineStyle(5, 0xd7372f, 1);
    this.ring.beginPath();
    this.ring.arc(this.pos.x, this.pos.y, 26, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
    this.ring.strokePath();
    if (p >= 1) this.fire();
  }
}
