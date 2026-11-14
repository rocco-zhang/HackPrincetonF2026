import Phaser from "phaser";
import { ARENA, DIFFICULTY, type Difficulty } from "../../config";
import { state } from "../../state";
import { FONT, INK_CSS, MUTED_CSS, ORANGE_CSS } from "../palette";

export class Hud {
  private hearts: Phaser.GameObjects.Image[] = [];
  private scoreText: Phaser.GameObjects.Text;
  private multText: Phaser.GameObjects.Text;
  private waveText: Phaser.GameObjects.Text;
  private hint: Phaser.GameObjects.Text;
  private warn: Phaser.GameObjects.Text;
  private shownScore = 0;

  constructor(
    private scene: Phaser.Scene,
    maxHearts: number,
    private difficulty: Difficulty = "medium",
  ) {
    const depth = 1000;
    for (let i = 0; i < maxHearts; i++) {
      this.hearts.push(scene.add.image(36 + i * 44, 36, "heart").setDepth(depth));
    }
    this.scoreText = scene.add
      .text(ARENA.width + 8, -16, "0", { fontFamily: FONT, fontSize: "40px", fontStyle: "bold", color: INK_CSS, stroke: "#f9f5ea", strokeThickness: 8 })
      .setOrigin(1, 0)
      .setPadding(32)
      .setDepth(depth);
    this.multText = scene.add
      .text(ARENA.width - 24, 62, "", { fontFamily: FONT, fontSize: "20px", fontStyle: "bold", color: ORANGE_CSS, stroke: "#f9f5ea", strokeThickness: 5 })
      .setOrigin(1, 0)
      .setDepth(depth);
    this.waveText = scene.add
      .text(ARENA.width / 2, 18, "", { fontFamily: FONT, fontSize: "22px", fontStyle: "bold", color: INK_CSS, stroke: "#f9f5ea", strokeThickness: 6 })
      .setOrigin(0.5, 0)
      .setDepth(depth);
    this.hint = scene.add
      .text(18, ARENA.height - 14, "", { fontFamily: FONT, fontSize: "16px", color: MUTED_CSS })
      .setOrigin(0, 1)
      .setDepth(depth);
    this.warn = scene.add
      .text(ARENA.width / 2, ARENA.height - 40, "✋ Raise your hand so the camera can see it", {
        fontFamily: FONT,
        fontSize: "24px",
        fontStyle: "bold",
        color: "#ffffff",
        backgroundColor: "#d7372f",
        padding: { x: 14, y: 8 },
      })
      .setOrigin(0.5, 1)
      .setDepth(depth)
      .setVisible(false);
  }

  setHearts(n: number) {
    this.hearts.forEach((h, i) => {
      const was = h.texture.key === "heart";
      h.setTexture(i < n ? "heart" : "heart_empty");
      if (was && i >= n) {
        this.scene.tweens.add({ targets: h, scale: 1.8, duration: 120, yoyo: true });
      }
    });
  }

  setWave(n: number) {
    this.waveText.setText(this.difficulty === "medium" ? `Wave ${n}` : `Wave ${n}  ·  ${DIFFICULTY[this.difficulty].label}`);
  }

  setMultiplier(m: number) {
    this.multText.setText(m > 1 ? `streak ×${m.toFixed(1)}` : "");
  }

  update(score: number) {
    if (this.shownScore !== score) {
      this.shownScore += Math.ceil((score - this.shownScore) * 0.2);
      if (Math.abs(score - this.shownScore) < 2) this.shownScore = score;
      this.scoreText.setText(this.shownScore.toLocaleString());
    }
    const hand = state.mode === "hand";
    this.hint.setText(
      (state.mathActive ? "draw each digit, then hold still" : state.aslActive ? "🤟 hold a letter's handshape" : hand ? "✋ pinch thumb + index to draw" : "🖱 drag to draw") + "   ·   M switch input   ·   D debug",
    );
    const lost = hand && performance.now() - state.lastHandSeen > 1000;
    this.warn.setVisible(lost).setY(state.aslActive ? ARENA.height - 160 : ARENA.height - 40); // clear of the ASL cards
  }
}
