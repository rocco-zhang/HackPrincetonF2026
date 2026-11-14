import Phaser from "phaser";
import { FONT } from "../palette";

/** Particle bursts, floating text and banners. */
export class Fx {
  private emitters = new Map<string, Phaser.GameObjects.Particles.ParticleEmitter>();

  constructor(private scene: Phaser.Scene) {}

  private emitter(color: number, kind: "burst" | "puff") {
    const key = `${kind}:${color}`;
    let e = this.emitters.get(key);
    if (!e) {
      e = this.scene.add.particles(0, 0, "spark", kind === "burst"
        ? {
            lifespan: { min: 350, max: 750 },
            speed: { min: 90, max: 420 },
            scale: { start: 0.9, end: 0 },
            alpha: { start: 1, end: 0 },
            tint: color,
            blendMode: Phaser.BlendModes.SCREEN,
            emitting: false,
          }
        : {
            lifespan: { min: 300, max: 600 },
            speed: { min: 20, max: 90 },
            scale: { start: 0.6, end: 1.4 },
            alpha: { start: 0.5, end: 0 },
            tint: color,
            emitting: false,
          });
      e.setDepth(900);
      this.emitters.set(key, e);
    }
    return e;
  }

  burst(x: number, y: number, color: number, count = 24) {
    this.emitter(color, "burst").explode(count, x, y);
  }

  puff(x: number, y: number, color = 0x8a8399, count = 10) {
    this.emitter(color, "puff").explode(count, x, y);
  }

  floatText(x: number, y: number, text: string, color = "#ffffff", size = 26) {
    const t = this.scene.add
      .text(x, y, text, { fontFamily: FONT, fontSize: `${size}px`, fontStyle: "bold", color, stroke: "#120a24", strokeThickness: 5 })
      .setOrigin(0.5)
      .setDepth(950);
    this.scene.tweens.add({
      targets: t,
      y: y - 60,
      alpha: { from: 1, to: 0 },
      scale: { from: 1.3, to: 1 },
      duration: 900,
      ease: "Quad.easeOut",
      onComplete: () => t.destroy(),
    });
  }

  banner(text: string, color = "#ffffff", sub?: string, hold = 900) {
    const { width: W, height: H } = this.scene.scale;
    const t = this.scene.add
      .text(W / 2, H / 2 - 120, text, { fontFamily: FONT, fontSize: "72px", fontStyle: "bold", color, stroke: "#120a24", strokeThickness: 8 })
      .setOrigin(0.5)
      .setDepth(980)
      .setScale(0.4)
      .setAlpha(0);
    t.setPadding(32).setShadow(0, 0, color, 18, true, true);
    const targets: Phaser.GameObjects.Text[] = [t];
    if (sub) {
      const s = this.scene.add
        .text(W / 2, H / 2 - 64, sub, { fontFamily: FONT, fontSize: "24px", color: "#e6defc", stroke: "#120a24", strokeThickness: 5 })
        .setOrigin(0.5)
        .setDepth(980)
        .setAlpha(0);
      targets.push(s);
      this.scene.tweens.add({ targets: s, alpha: 1, duration: 200, hold, yoyo: true, onComplete: () => s.destroy() });
    }
    this.scene.tweens.add({
      targets: t,
      scale: 1,
      alpha: 1,
      duration: 260,
      ease: "Back.easeOut",
      hold,
      yoyo: true,
      onComplete: () => t.destroy(),
    });
  }
}
