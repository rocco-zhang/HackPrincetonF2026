import Phaser from "phaser";
import { CAST_HEADROOM, CAST_TIP } from "../scenes/Boot";
import { HIGHLIGHTER, INK, SYMBOL_COLOR } from "../palette";

const CORE_Y = -10;
/** The casting image is taller at the top, so it sits this much higher to keep the feet in place. */
const CAST_Y = CORE_Y - CAST_HEADROOM / 2;
/** Stay in the casting pose this long after drawing stops, so quick strokes don't make it twitch. */
const CAST_LINGER_MS = 280;

/** You: a stick figure in the middle of the page. */
export class Player extends Phaser.GameObjects.Container {
  private shadow: Phaser.GameObjects.Image;
  private core: Phaser.GameObjects.Image;
  private ring: Phaser.GameObjects.Graphics;
  private sparkles: Phaser.GameObjects.Particles.ParticleEmitter;
  private casting = false;
  private lastCast = -Infinity;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);
    this.shadow = scene.add.image(0, 50, "island");
    this.ring = scene.add.graphics();
    this.drawRing();
    this.core = scene.add.image(0, CORE_Y, "player");
    this.add([this.shadow, this.ring, this.core]);
    scene.add.existing(this);
    this.setDepth(400);
    scene.tweens.add({ targets: this.ring, angle: 360, duration: 40000, repeat: -1 });
    // a small sway, like a flip-book loop
    scene.tweens.add({ targets: this.core, angle: { from: -2.5, to: 2.5 }, duration: 700, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    // sparkles off the tip of the raised pencil while a spell is being drawn
    this.sparkles = scene.add
      .particles(x + CAST_TIP.x, y + CAST_Y + CAST_TIP.y, "star", {
        lifespan: { min: 350, max: 750 },
        speed: { min: 25, max: 95 },
        angle: { min: 200, max: 340 }, // mostly upwards
        gravityY: 60,
        scale: { start: 0.5, end: 0 },
        rotate: { min: 0, max: 360 },
        alpha: { start: 1, end: 0.2 },
        tint: [HIGHLIGHTER, ...Object.values(SYMBOL_COLOR)],
        frequency: 45,
        emitting: false,
      })
      .setDepth(402);
    this.once(Phaser.GameObjects.Events.DESTROY, () => this.sparkles.destroy());
  }

  /**
   * Call every frame with whether a spell is being drawn (or a letter held). While it is, the
   * figure throws its pencil arm up and the pencil sparkles.
   */
  setCasting(on: boolean) {
    const now = performance.now();
    if (on) this.lastCast = now;
    const active = now - this.lastCast < CAST_LINGER_MS;
    if (active === this.casting) return;
    this.casting = active;
    this.core.setTexture(active ? "player_cast" : "player").setY(active ? CAST_Y : CORE_Y);
    if (active) {
      // a little hop as the arm goes up
      this.scene.tweens.add({ targets: this.core, y: CAST_Y - 7, duration: 90, yoyo: true, ease: "Quad.easeOut" });
      this.sparkles.start();
    } else this.sparkles.stop();
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
