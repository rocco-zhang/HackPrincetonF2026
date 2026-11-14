import Phaser from "phaser";
import { ARENA } from "../../config";
import { ASL_LETTERS } from "../../asl/hand";
import { SYMBOLS, type SymbolName } from "../../input/events";
import { pvp } from "../../net/pvp";
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
  private tagline!: Phaser.GameObjects.Text;
  private modeLine!: Phaser.GameObjects.Text;
  private drawRow!: Phaser.GameObjects.Container;
  private aslRow!: Phaser.GameObjects.Container;

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
    this.tagline = this.add
      .text(W / 2, 236, "", { fontFamily: FONT, fontSize: "25px", color: INK_CSS, stroke: "#f9f5ea", strokeThickness: 6 })
      .setOrigin(0.5);

    // what you cast with: six drawn symbols, or (ASL mode) ten fingerspelled letters
    const gap = 150;
    this.drawRow = this.add.container(0, 0);
    SYMBOLS.forEach((s, i) => {
      const x = W / 2 + (i - (SYMBOLS.length - 1) / 2) * gap;
      const icon = this.add.image(x, 360, `sym_${s}`).setScale(1.3);
      this.tweens.add({ targets: icon, y: 350, duration: 900 + i * 90, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      const label = this.add.text(x, 420, LABELS[s], { fontFamily: FONT, fontSize: "20px", fontStyle: "bold", color: INK_CSS, stroke: "#f9f5ea", strokeThickness: 5 }).setOrigin(0.5);
      this.drawRow.add([icon, label]);
    });
    this.aslRow = this.add.container(0, 0);
    ASL_LETTERS.forEach((l, i) => {
      const x = W / 2 + ((i % 12) - 5.5) * 86;
      this.aslRow.add(this.add.image(x, i < 12 ? 322 : 424, `aslcard_${l}`).setScale(0.56).setAngle(i % 2 ? 2 : -2));
    });
    this.input.keyboard?.on("keydown-R", () => {
      if (state.aslSelected) this.scene.start("AslTrainer");
    });

    this.modeLine = this.add
      .text(W / 2, 606, "", { fontFamily: FONT, fontSize: "22px", color: INK_CSS, stroke: "#f9f5ea", strokeThickness: 6 })
      .setOrigin(0.5);
    this.input.keyboard?.on("keydown-A", () => {
      if (pvp.active && !pvp.isHost) return; // in a versus game the host picks the mode
      state.aslSelected = !state.aslSelected;
      pvp.sendMode(state.aslSelected);
      this.showMode();
    });
    // versus: back on the title screen means not ready yet; the game starts when both are
    if (pvp.active) pvp.setReady(false);
    const offPvp = pvp.on((e) => {
      if (e.type === "message" && e.msg.t === "hello") {
        state.aslSelected = e.msg.asl;
        this.showMode();
      } else if (e.type === "start") {
        sfx.start();
        this.scene.start("Arena", { asl: state.aslSelected, pvp: true });
      } else if (e.type === "state") this.showMode();
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, offPvp);
    this.showMode();

    this.prompt = this.add
      .text(W / 2, 546, "", { fontFamily: FONT, fontSize: "34px", fontStyle: "bold", color: INK_CSS, stroke: "#f9f5ea", strokeThickness: 8 })
      .setOrigin(0.5)
      .setPadding(32);
    this.tweens.add({ targets: this.prompt, alpha: 0.55, duration: 800, yoyo: true, repeat: -1 });

    this.add
      .text(W / 2, H - 28, "A drawing/ASL · V versus · M hand/mouse · K calibrate area · C next camera · F mirror · D debug · T record templates · G demo run", {
        fontFamily: FONT,
        fontSize: "15px",
        color: MUTED_CSS,
      })
      .setOrigin(0.5);

    this.hold = new HoldToStart(this, 1000, () => {
      if (state.aslSelected && state.mode !== "hand") {
        // handshapes need the camera; say so in the prompt and wait
        this.hold.rearm();
        return;
      }
      if (pvp.active) {
        // versus: holding marks you ready; the round starts when your opponent is too
        pvp.setReady(true);
        sfx.start();
        this.hold.rearm();
        return;
      }
      sfx.start();
      this.cameras.main.flash(250, 255, 255, 255);
      this.scene.start("Arena", { demo: false, asl: state.aslSelected });
    });
  }

  private showMode() {
    const asl = state.aslSelected;
    this.drawRow.setVisible(!asl);
    this.aslRow.setVisible(asl);
    this.tagline.setText(
      asl ? "Learn ASL fingerspelling: make a monster's letter with your hand to tear it up." : "You're a stick figure. The paper monsters want you. Draw them away.",
    );
    const mode = asl ? "ASL fingerspelling" : "Drawing";
    this.modeLine.setText(
      pvp.active ? `Versus  ·  ${mode} mode${pvp.isHost ? "  ·  A: change mode" : " (the host picks)"}  ·  V: connection`
      : asl ? "ASL fingerspelling mode  ·  R: teach it your own hand  ·  A: drawing mode  ·  V: versus a friend"
      : "Drawing mode  ·  A: ASL fingerspelling mode  ·  V: versus a friend",
    );
  }

  update() {
    this.hold.update();
    let msg: string;
    if (state.aslSelected && state.mode !== "hand") {
      msg = "ASL mode needs the camera: press M to turn it on";
    } else if (pvp.status === "reconnecting") {
      msg = "Connection trouble: waiting for your opponent…";
    } else if (pvp.active && pvp.myReady) {
      msg = "Ready! Waiting for your opponent…";
    } else if (pvp.active) {
      const how = state.mode === "hand" ? "Pinch and hold" : "Hold the mouse button (or press Space)";
      msg = `${how} when you're ready${pvp.theirReady ? ": your opponent is waiting" : ""}`;
    } else if (state.mode === "hand") {
      msg = state.handVisible || performance.now() - state.lastHandSeen < 600
        ? "Pinch thumb + index and hold to begin"
        : "Raise your hand in front of the camera";
    } else {
      msg = "Hold the mouse button (or press Space) to begin";
    }
    if (this.prompt.text !== msg) this.prompt.setText(msg);
  }
}
