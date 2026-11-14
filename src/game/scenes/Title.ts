import Phaser from "phaser";
import { ARENA } from "../../config";
import { SYMBOLS, type SymbolName } from "../../input/events";
import { state } from "../../state";
import { css, FONT, SYMBOL_COLOR } from "../palette";
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

    // drifting Hollows for atmosphere
    for (let i = 0; i < 6; i++) {
      const m = this.add.image(Phaser.Math.Between(60, W - 60), Phaser.Math.Between(80, H - 60), `monster${i % 3}`).setAlpha(0.18).setScale(0.8);
      this.tweens.add({ targets: m, x: m.x + Phaser.Math.Between(-80, 80), y: m.y + Phaser.Math.Between(-40, 40), duration: Phaser.Math.Between(3000, 5000), yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    }

    const title = this.add
      .text(W / 2, 150, "SPELLCAM", { fontFamily: FONT, fontSize: "120px", fontStyle: "bold", color: "#fff6dc" })
      .setOrigin(0.5)
      .setPadding(32).setShadow(0, 0, "#ffb43b", 30, true, true);
    this.tweens.add({ targets: title, scale: 1.03, duration: 1600, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    this.add
      .text(W / 2, 236, "Draw spells in the air. Banish the Hollows before they reach your lantern.", { fontFamily: FONT, fontSize: "24px", color: "#d9ccff" })
      .setOrigin(0.5);

    const gap = 150;
    SYMBOLS.forEach((s, i) => {
      const x = W / 2 + (i - (SYMBOLS.length - 1) / 2) * gap;
      const icon = this.add.image(x, 360, `sym_${s}`).setScale(1.3);
      this.tweens.add({ targets: icon, y: 350, duration: 900 + i * 90, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      this.add.text(x, 420, LABELS[s], { fontFamily: FONT, fontSize: "20px", fontStyle: "bold", color: css(SYMBOL_COLOR[s]) }).setOrigin(0.5);
    });

    this.prompt = this.add
      .text(W / 2, 540, "", { fontFamily: FONT, fontSize: "34px", fontStyle: "bold", color: "#ffffff" })
      .setOrigin(0.5)
      .setPadding(32).setShadow(0, 0, "#ffd36b", 14, true, true);
    this.tweens.add({ targets: this.prompt, alpha: 0.55, duration: 800, yoyo: true, repeat: -1 });

    this.add
      .text(W / 2, H - 28, "M switch hand/mouse · K calibrate drawing area · C next camera · F mirror · D debug · T record templates · G demo run", {
        fontFamily: FONT,
        fontSize: "15px",
        color: "#a79fc6",
      })
      .setOrigin(0.5);

    this.hold = new HoldToStart(this, 1000, () => {
      sfx.start();
      this.cameras.main.flash(250, 255, 220, 150);
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
