import Phaser from "phaser";
import { ARENA } from "../../config";
import { ACCENT_CSS, FONT, INK_CSS, MUTED_CSS, ORANGE_CSS, TITLE_FONT } from "../palette";
import { sfx } from "../sfx";
import { HoldToStart } from "../systems/HoldToStart";

const BEST_KEY = "spellcam.best";

export class GameOver extends Phaser.Scene {
  private hold!: HoldToStart;

  constructor() {
    super("GameOver");
  }

  create(data: { score: number; wave: number; demo?: boolean }) {
    const W = ARENA.width, H = ARENA.height;
    this.add.image(W / 2, H / 2, "floor");
    const best = Number(localStorage.getItem(BEST_KEY) ?? 0);
    const isBest = data.score > best;
    if (isBest) localStorage.setItem(BEST_KEY, String(data.score));

    this.add
      .text(W / 2, 140, "The paper monsters got you!", { fontFamily: TITLE_FONT, fontSize: "60px", color: ACCENT_CSS, stroke: "#f9f5ea", strokeThickness: 12 })
      .setOrigin(0.5)
      .setPadding(32);
    // the monsters that got you, looking pleased with themselves
    [-330, 330].forEach((dx, i) => {
      const bot = this.add.image(W / 2 + dx, 280, `monster${i * 2}`).setScale(1.5).setFlipX(dx > 0);
      this.tweens.add({ targets: bot, y: 268, duration: 600 + i * 120, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    });
    const scoreText = this.add
      .text(W / 2, 270, "0", { fontFamily: FONT, fontSize: "110px", fontStyle: "bold", color: INK_CSS, stroke: "#f9f5ea", strokeThickness: 14 })
      .setOrigin(0.5)
      .setPadding(32);
    this.tweens.addCounter({
      from: 0,
      to: data.score,
      duration: 900,
      ease: "Quad.easeOut",
      onUpdate: (tw) => scoreText.setText(Math.round(tw.getValue() ?? 0).toLocaleString()),
    });
    this.add
      .text(W / 2, 360, `reached wave ${data.wave}   ·   best ${Math.max(best, data.score).toLocaleString()}`, { fontFamily: FONT, fontSize: "26px", color: INK_CSS, stroke: "#f9f5ea", strokeThickness: 6 })
      .setOrigin(0.5);
    if (isBest && data.score > 0) {
      const nb = this.add.text(W / 2, 410, "New best!", { fontFamily: FONT, fontSize: "30px", fontStyle: "bold", color: ORANGE_CSS, stroke: "#f9f5ea", strokeThickness: 7 }).setOrigin(0.5);
      this.tweens.add({ targets: nb, scale: 1.15, duration: 400, yoyo: true, repeat: -1 });
    }
    const prompt = this.add
      .text(W / 2, 530, "Pinch & hold (or hold mouse / Space) to play again", { fontFamily: FONT, fontSize: "30px", fontStyle: "bold", color: INK_CSS, stroke: "#f9f5ea", strokeThickness: 8 })
      .setOrigin(0.5);
    this.tweens.add({ targets: prompt, alpha: 0.55, duration: 800, yoyo: true, repeat: -1 });
    this.add.text(W / 2, H - 28, "Esc: title screen", { fontFamily: FONT, fontSize: "15px", color: MUTED_CSS }).setOrigin(0.5);
    this.input.keyboard?.on("keydown-ESC", () => this.scene.start("Title"));

    // short delay so a stroke that was in progress at game over doesn't restart instantly
    this.time.delayedCall(700, () => {
      this.hold = new HoldToStart(this, 600, () => {
        sfx.start();
        this.scene.start("Arena", { demo: data.demo });
      });
    });
  }

  update() {
    this.hold?.update();
  }
}
