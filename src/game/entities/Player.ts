import Phaser from "phaser";
import { GOLD } from "../palette";

/** The lantern at the center of the arena. */
export class Player extends Phaser.GameObjects.Container {
  private aura: Phaser.GameObjects.Image;
  private core: Phaser.GameObjects.Image;
  private ring: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);
    this.aura = scene.add.image(0, 0, "glow").setTint(GOLD).setAlpha(0.45).setScale(1.1).setBlendMode(Phaser.BlendModes.SCREEN);
    this.ring = scene.add.graphics();
    this.drawRing();
    this.core = scene.add.image(0, 0, "player");
    this.add([this.aura, this.ring, this.core]);
    scene.add.existing(this);
    this.setDepth(400);
    scene.tweens.add({ targets: this.aura, scale: 1.3, alpha: 0.6, duration: 1400, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    scene.tweens.add({ targets: this.ring, angle: 360, duration: 12000, repeat: -1 });
    scene.tweens.add({ targets: this.core, angle: 360, duration: 30000, repeat: -1 });
  }

  private drawRing() {
    const g = this.ring;
    g.lineStyle(2, GOLD, 0.7);
    const r = 58;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.beginPath();
      g.arc(0, 0, r, a, a + 0.32);
      g.strokePath();
      g.fillStyle(GOLD, 0.9);
      g.fillCircle(Math.cos(a + 0.42) * r, Math.sin(a + 0.42) * r, 2);
    }
  }

  castPulse(color: number) {
    const ring = this.scene.add.circle(this.x, this.y, 40).setStrokeStyle(4, color, 1).setDepth(401);
    this.scene.tweens.add({ targets: ring, scale: 2.4, alpha: 0, duration: 380, ease: "Quad.easeOut", onComplete: () => ring.destroy() });
    this.scene.tweens.add({ targets: this.core, scale: 1.25, duration: 90, yoyo: true });
  }

  hurt() {
    this.core.setTint(0xff4d6d);
    this.aura.setTint(0xff4d6d);
    this.scene.time.delayedCall(300, () => {
      this.core.clearTint();
      this.aura.setTint(GOLD);
    });
  }
}
