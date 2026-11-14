import Phaser from "phaser";
import { ARENA } from "../../config";
import { SYMBOLS, type SymbolName } from "../../input/events";
import { state } from "../../state";
import { FONT, HIGHLIGHTER, INK_CSS, MUTED_CSS, TITLE_FONT } from "../palette";
import { sfx } from "../sfx";
import { HoldToStart } from "../systems/HoldToStart";

const LABELS: Record<SymbolName, string> = {
  hline: "dash",
  vline: "pillar",
  v: "vee",
  caret: "peak",
  circle: "ring",
  zigzag: "bolt",
};

export class Title extends Phaser.Scene {
  private hold!: HoldToStart;
  private prompt!: Phaser.GameObjects.Text;

  constructor() {
    super("Title");
  }

  create() {
    const W = ARENA.width, H = ARENA.height;
    this.add.image(W / 2, H / 2, "floor");

    // paper monsters loitering in the margins
    for (let i = 0; i < 6; i++) {
      // kept to the side margins so they never sit behind the text
      const x = i % 2 ? Phaser.Math.Between(60, 190) : Phaser.Math.Between(W - 190, W - 60);
      const m = this.add.image(x, 110 + Math.floor(i / 2) * 200 + Phaser.Math.Between(-30, 30), `monster${i % 3}`).setFlipX(i % 2 === 0);
      this.tweens.add({ targets: m, x: m.x + Phaser.Math.Between(-30, 30), y: m.y + Phaser.Math.Between(-30, 30), duration: Phaser.Math.Between(3000, 5000), yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    }

    // a swipe of highlighter behind the title
    const hl = this.add.graphics({ x: W / 2, y: 158 }).setAngle(-1.6);
    hl.fillStyle(HIGHLIGHTER, 0.85);
    hl.fillRect(-300, -34, 600, 78);
    hl.fillStyle(HIGHLIGHTER, 0.5);
    hl.fillRect(-312, -26, 628, 20);
    this.add
      .text(W / 2, 150, "SPELLCAM", { fontFamily: TITLE_FONT, fontSize: "132px", color: INK_CSS })
      .setOrigin(0.5)
      .setPadding(32)
      .setAngle(-1.6);
    this.add
      .text(W / 2, 236, "You're a stick figure. The paper monsters want you. Draw them away.", { fontFamily: FONT, fontSize: "25px", color: INK_CSS, stroke: "#f9f5ea", strokeThickness: 6 })
      .setOrigin(0.5);

    const gap = 150;
    SYMBOLS.forEach((s, i) => {
      const x = W / 2 + (i - (SYMBOLS.length - 1) / 2) * gap;
      const icon = this.add.image(x, 360, `sym_${s}`).setScale(1.3);
      this.tweens.add({ targets: icon, y: 350, duration: 900 + i * 90, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      this.add.text(x, 420, LABELS[s], { fontFamily: FONT, fontSize: "20px", fontStyle: "bold", color: INK_CSS, stroke: "#f9f5ea", strokeThickness: 5 }).setOrigin(0.5);
    });

    this.prompt = this.add
      .text(W / 2, 540, "", { fontFamily: FONT, fontSize: "34px", fontStyle: "bold", color: INK_CSS, stroke: "#f9f5ea", strokeThickness: 8 })
      .setOrigin(0.5)
      .setPadding(32);
    this.tweens.add({ targets: this.prompt, alpha: 0.55, duration: 800, yoyo: true, repeat: -1 });

    this.add
      .text(W / 2, H - 28, "M hand/mouse · K calibrate area · C next camera · F mirror · D debug · T record templates · G demo run", {
        fontFamily: FONT,
        fontSize: "15px",
        color: MUTED_CSS,
      })
      .setOrigin(0.5);

    this.hold = new HoldToStart(this, 1000, () => {
      sfx.start();
      this.cameras.main.flash(250, 255, 255, 255);
      this.scene.start("Arena", { demo: false });
    });
  }

  update() {
    this.hold.update();
    let msg: string;
    if (state.mode === "hand") {
      msg = state.handVisible || performance.now() - state.lastHandSeen < 600
        ? "Pinch thumb + index and hold to begin"
        : "Raise your hand in front of the camera";
    } else {
      msg = "Hold the mouse button (or press Space) to begin";
    }
    if (this.prompt.text !== msg) this.prompt.setText(msg);
  }
}
