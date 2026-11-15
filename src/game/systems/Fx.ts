import Phaser from "phaser";
import { ARENA } from "../../config";
import { FONT, INK_CSS, TITLE_FONT } from "../palette";

/** Particle bursts, floating text and banners. */
export class Fx {
  private emitters = new Map<string, Phaser.GameObjects.Particles.ParticleEmitter>();

  constructor(private scene: Phaser.Scene) {}

  private emitter(color: number, kind: "burst" | "puff") {
    const key = `${kind}:${color}`;
    let e = this.emitters.get(key);
    if (!e) {
      e = this.scene.add.particles(0, 0, kind === "burst" ? "scrap" : "spark", kind === "burst"
        ? {
            // torn paper scraps
            lifespan: { min: 400, max: 800 },
            speed: { min: 90, max: 380 },
            gravityY: 300,
            rotate: { min: 0, max: 360 },
            scale: { start: 1, end: 0.5 },
            alpha: { start: 1, end: 0.6 },
            tint: color,
            emitting: false,
          }
        : {
            lifespan: { min: 300, max: 600 },
            speed: { min: 20, max: 90 },
            scale: { start: 0.6, end: 1.4 },
            alpha: { start: 0.8, end: 0 },
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

  puff(x: number, y: number, color = 0xb5b0a5, count = 10) {
    this.emitter(color, "puff").explode(count, x, y);
  }

  floatText(x: number, y: number, text: string, color = INK_CSS, size = 26) {
    const t = this.scene.add
      .text(x, y, text, { fontFamily: FONT, fontSize: `${size}px`, fontStyle: "bold", color, stroke: "#f9f5ea", strokeThickness: 7 })
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

  banner(text: string, color = INK_CSS, sub?: string, hold = 900) {
    const { width: W, height: H } = ARENA; // the game world, not the canvas (which has more pixels on Retina screens)
    const t = this.scene.add
      .text(W / 2, H / 2 - 120, text, { fontFamily: TITLE_FONT, fontSize: "84px", color, stroke: "#f9f5ea", strokeThickness: 14 })
      .setOrigin(0.5)
      .setDepth(980)
      .setScale(0.4)
      .setAlpha(0);
    t.setPadding(32);
    const targets: Phaser.GameObjects.Text[] = [t];
    if (sub) {
      const s = this.scene.add
        .text(W / 2, H / 2 - 64, sub, { fontFamily: FONT, fontSize: "24px", color: INK_CSS, stroke: "#f9f5ea", strokeThickness: 7 })
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
