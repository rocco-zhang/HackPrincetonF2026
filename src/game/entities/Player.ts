import Phaser from "phaser";
import { CAST_HEADROOM, CAST_SHOULDER, CAST_TIP, PENCIL } from "../scenes/Boot";
import { HIGHLIGHTER, INK, PAPER, SYMBOL_COLOR } from "../palette";

const CORE_Y = -10;
/** The casting image is taller at the top, so it sits this much higher to keep the feet in place. */
const CAST_Y = CORE_Y - CAST_HEADROOM / 2;
/** Stay in the casting pose this long after drawing stops, so quick strokes don't make it twitch. */
const CAST_LINGER_MS = 280;
/** The air drawing after a spell lands: how big, and how long it takes to trace. */
const AIR_SIZE = 46;
const AIR_DRAW_MS = 460;
/** Where the raised pencil's tip rests, measured from the figure's own position. */
const REST_TIP = { x: CAST_TIP.x, y: CAST_Y + CAST_TIP.y };

/** You: a stick figure in the middle of the page. */
export class Player extends Phaser.GameObjects.Container {
  private shadow: Phaser.GameObjects.Image;
  private core: Phaser.GameObjects.Image;
  private ring: Phaser.GameObjects.Graphics;
  private sparkles: Phaser.GameObjects.Particles.ParticleEmitter;
  private casting = false;
  private lastCast = -Infinity;
  private airGfx: Phaser.GameObjects.Graphics | null = null;
  /** The casting pose's pencil and the arm holding it, drawn live so the pencil can follow a line. */
  private arm: Phaser.GameObjects.Graphics;
  private pencil: Phaser.GameObjects.Image;
  /** The pencil is busy writing a spell in the air: it follows that line, not its idle wiggle. */
  private writing = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);
    this.shadow = scene.add.image(0, 50, "island");
    this.ring = scene.add.graphics();
    this.drawRing();
    this.core = scene.add.image(0, CORE_Y, "player");
    this.arm = scene.add.graphics().setVisible(false);
    this.pencil = scene.add.image(0, 0, "pencil").setOrigin(PENCIL.originX, PENCIL.originY).setRotation(PENCIL.angle).setVisible(false);
    this.add([this.shadow, this.ring, this.core, this.arm, this.pencil]);
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
    // while the stroke is being drawn, the raised pencil scribbles a little in the air
    if (active && !this.writing) this.pointPencil(REST_TIP.x + Math.sin(now / 95) * 3.5, REST_TIP.y + Math.cos(now / 140) * 2.5);
    if (active === this.casting) return;
    this.casting = active;
    this.core.setTexture(active ? "player_cast" : "player").setY(active ? CAST_Y : CORE_Y);
    this.arm.setVisible(active);
    this.pencil.setVisible(active);
    if (active) {
      // a little hop as the arm goes up
      this.scene.tweens.add({ targets: this.core, y: CAST_Y - 7, duration: 90, yoyo: true, ease: "Quad.easeOut" });
      this.sparkles.start();
    } else this.sparkles.stop();
  }

  /** Put the pencil's tip at a point (measured from the figure's own position) and draw the arm out to the hand holding it. */
  private pointPencil(tx: number, ty: number) {
    this.pencil.setPosition(tx, ty);
    const hx = tx - Math.sin(PENCIL.angle) * PENCIL.grip, hy = ty + Math.cos(PENCIL.angle) * PENCIL.grip;
    const sx = CAST_SHOULDER.x, sy = CAST_Y + CAST_SHOULDER.y;
    const g = this.arm;
    g.clear();
    g.lineStyle(4.4, INK, 1);
    g.lineBetween(sx, sy, hx, hy);
    g.fillStyle(INK, 1);
    g.fillCircle(sx, sy, 2.2);
    g.fillCircle(hx, hy, 2.6);
    this.sparkles.setPosition(this.x + tx, this.y + ty);
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

  /**
   * A spell landed: the figure writes it in the air with the pencil. `strokes` are what was drawn
   * (any size, anywhere); they are shrunk into a small box above the pencil tip and traced out
   * stroke by stroke in the spell's color, then fade.
   */
  airDraw(strokes: { x: number; y: number }[][], color: number) {
    const lines = strokes.filter((s) => s.length > 1);
    if (!lines.length) return;
    const all = lines.flat();
    const x0 = Math.min(...all.map((p) => p.x)), x1 = Math.max(...all.map((p) => p.x));
    const y0 = Math.min(...all.map((p) => p.y)), y1 = Math.max(...all.map((p) => p.y));
    const k = AIR_SIZE / Math.max(x1 - x0, y1 - y0, 1);
    // the bottom of the drawing sits just above the pencil tip
    const cx = this.x + CAST_TIP.x + 4, bottom = this.y + CAST_Y + CAST_TIP.y - 8;
    const fit = lines.map((s) => s.map((p) => ({ x: cx + (p.x - (x0 + x1) / 2) * k, y: bottom + (p.y - y1) * k })));
    const lengths = fit.map((s) => s.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - s[i].x, p.y - s[i].y), 0));
    const total = lengths.reduce((a, b) => a + b, 0) || 1;

    this.airGfx?.destroy();
    const g = (this.airGfx = this.scene.add.graphics().setDepth(403));
    const paint = (progress: number) => {
      g.clear();
      let budget = progress * total;
      let head = fit[0][0];
      // a paper-colored edge first, so the drawing reads over monsters and trails
      for (const [width, c] of [[9, PAPER], [4.5, color]] as const) {
        let left = budget;
        for (let i = 0; i < fit.length && left > 0; i++) {
          const s = fit[i];
          g.lineStyle(width, c, 1);
          g.beginPath();
          g.moveTo(s[0].x, s[0].y);
          head = s[0];
          for (let j = 1; j < s.length && left > 0; j++) {
            const seg = Math.hypot(s[j].x - s[j - 1].x, s[j].y - s[j - 1].y);
            const t = seg > 0 ? Math.min(1, left / seg) : 1;
            head = { x: s[j - 1].x + (s[j].x - s[j - 1].x) * t, y: s[j - 1].y + (s[j].y - s[j - 1].y) * t };
            g.lineTo(head.x, head.y);
            left -= seg;
          }
          g.strokePath();
        }
      }
      if (progress < 1) {
        // the point of the pencil, so to speak
        g.fillStyle(color, 1);
        g.fillCircle(head.x, head.y, 4.5);
        g.fillStyle(0xffffff, 0.9);
        g.fillCircle(head.x, head.y, 2);
      }
      // the pencil's tip rides the end of the line
      this.pointPencil(head.x - this.x, head.y - this.y);
    };
    this.writing = true;
    const done = () => {
      if (this.airGfx === g) this.writing = false; // unless a newer spell has taken the pencil over
    };
    // hold the casting pose for as long as the drawing takes
    this.setCasting(true);
    this.lastCast = performance.now() + AIR_DRAW_MS + 200; // a time in the future: the pose lasts until then (plus the usual linger)
    this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: AIR_DRAW_MS,
      ease: "Sine.easeInOut",
      onUpdate: (tw) => g.active && paint(tw.getValue() ?? 1),
      onComplete: () => {
        done();
        if (!g.active) return;
        paint(1);
        this.writing = false;
        this.scene.tweens.add({ targets: g, alpha: 0, y: -10, delay: 260, duration: 280, onComplete: () => g.destroy() });
      },
    });
  }

  castPulse(color: number, hits = 1) {
    const tier = Math.max(0, Math.min(5, hits) - 1);
    const ring = this.scene.add.circle(this.x, this.y, 40 + tier * 6).setStrokeStyle(5 + tier * 2, color, 1).setDepth(401);
    this.scene.tweens.add({ targets: ring, scale: 2.4 + tier * 0.3, alpha: 0, duration: 380 + tier * 40, ease: "Quad.easeOut", onComplete: () => ring.destroy() });
    this.scene.tweens.add({ targets: this.core, scaleX: 1.12, scaleY: 1.12, duration: 90, yoyo: true });
  }

  hurt() {
    this.core.setTint(0xd7372f);
    this.scene.tweens.add({ targets: this.core, x: { from: -6, to: 6 }, duration: 60, yoyo: true, repeat: 2, onComplete: () => this.core.setX(0) });
    this.scene.time.delayedCall(300, () => this.core.clearTint());
  }
}
