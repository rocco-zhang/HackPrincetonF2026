import Phaser from "phaser";
import { INK } from "../palette";

/** You: a stick figure in the middle of the page. */
export class Player extends Phaser.GameObjects.Container {
  private shadow: Phaser.GameObjects.Image;
  private core: Phaser.GameObjects.Image;
  private ring: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);
    this.shadow = scene.add.image(0, 50, "island");
    this.ring = scene.add.graphics();
    this.drawRing();
    this.core = scene.add.image(0, -10, "player");
    this.add([this.shadow, this.ring, this.core]);
    scene.add.existing(this);
    this.setDepth(400);
    scene.tweens.add({ targets: this.ring, angle: 360, duration: 40000, repeat: -1 });
    // a small sway, like a flip-book loop
    scene.tweens.add({ targets: this.core, angle: { from: -2.5, to: 2.5 }, duration: 700, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
  }

  /** Dashed pencil circle: a monster that gets inside it costs a heart. */
  private drawRing() {
    const g = this.ring;
    const r = 62;
    g.lineStyle(2.5, INK, 0.5);
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      g.beginPath();
      g.arc(0, 0, r + (i % 3) - 1, a, a + 0.19);
      g.strokePath();
    }
  }

  castPulse(color: number) {
    const ring = this.scene.add.circle(this.x, this.y, 40).setStrokeStyle(5, color, 1).setDepth(401);
    this.scene.tweens.add({ targets: ring, scale: 2.4, alpha: 0, duration: 380, ease: "Quad.easeOut", onComplete: () => ring.destroy() });
    this.scene.tweens.add({ targets: this.core, scaleX: 1.12, scaleY: 1.12, duration: 90, yoyo: true });
  }

  hurt() {
    this.core.setTint(0xd7372f);
    this.scene.tweens.add({ targets: this.core, x: { from: -6, to: 6 }, duration: 60, yoyo: true, repeat: 2, onComplete: () => this.core.setX(0) });
    this.scene.time.delayedCall(300, () => this.core.clearTint());
  }
}
