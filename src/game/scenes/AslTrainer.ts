import Phaser from "phaser";
import { ARENA } from "../../config";
import { aslExampleCount, clearAllAslExamples, lastSave, setAslExamples } from "../../asl/examples";
import { ASL, ASL_CLASSES, type AslClass } from "../../asl/hand";
import { state } from "../../state";
import { ACCENT, ACCENT_CSS, FONT, HIGHLIGHTER, INK, INK_CSS, MUTED_CSS, TITLE_FONT } from "../palette";

const COLS = 5;
const TILE_W = 132, TILE_H = 84;
const GRID_X = 560, GRID_Y = 190;
const READY_MS = 1200;
const EVERY_NTH_FRAME = 3; // 30 examples over ~3 s, so small movements of the hand are included

/**
 * "Teach it your own hand": record examples of each letter. Your examples replace the trained
 * model's idea of every letter you record, and are saved (data/asl-examples.json + this browser)
 * so they are still there after a restart.
 */
export class AslTrainer extends Phaser.Scene {
  private sel = 0;
  private phase: "idle" | "ready" | "capture" = "idle";
  private phaseStart = 0;
  private captured: number[][] = [];
  private lastFeat: number[] | null = null;
  private frameNo = 0;
  private note = "";

  private gfx!: Phaser.GameObjects.Graphics;
  private card!: Phaser.GameObjects.Image;
  private restText!: Phaser.GameObjects.Text;
  private status!: Phaser.GameObjects.Text;
  private reading!: Phaser.GameObjects.Text;
  private counts: Phaser.GameObjects.Text[] = [];

  constructor() {
    super("AslTrainer");
  }

  create() {
    const W = ARENA.width, H = ARENA.height;
    this.sel = 0;
    this.phase = "idle";
    this.note = "";
    this.counts = [];
    state.aslTraining = true;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => (state.aslTraining = false));

    this.add.image(W / 2, H / 2, "floor");
    this.gfx = this.add.graphics();
    this.add.text(W / 2, 62, "Teach it your own hand", { fontFamily: TITLE_FONT, fontSize: "58px", color: INK_CSS }).setOrigin(0.5).setPadding(12);
    this.add
      .text(W / 2, 122, "Letters you record are recognised from your examples instead of the built-in model. They are saved, so you only do this once.", {
        fontFamily: FONT,
        fontSize: "19px",
        color: INK_CSS,
      })
      .setOrigin(0.5);

    this.card = this.add.image(270, 372, "aslcard_A").setScale(1.75);
    this.restText = this.add
      .text(270, 372, "your relaxed hand\n(between letters)\n\nreads as no letter", { fontFamily: FONT, fontSize: "24px", color: INK_CSS, align: "center" })
      .setOrigin(0.5);

    ASL_CLASSES.forEach((cls, i) => {
      const { x, y } = this.tile(i);
      this.add.text(x - 44, y, cls === "rest" ? "rest" : cls, { fontFamily: TITLE_FONT, fontSize: cls === "rest" ? "19px" : "40px", color: INK_CSS }).setOrigin(0, 0.5);
      this.counts.push(this.add.text(x + 52, y, "", { fontFamily: FONT, fontSize: "17px", color: MUTED_CSS }).setOrigin(1, 0.5));
    });

    this.reading = this.add.text(270, 548, "", { fontFamily: FONT, fontSize: "22px", color: INK_CSS, align: "center" }).setOrigin(0.5);
    this.status = this.add.text(W / 2, H - 76, "", { fontFamily: FONT, fontSize: "26px", fontStyle: "bold", color: INK_CSS, align: "center" }).setOrigin(0.5);
    this.add
      .text(W / 2, H - 26, "arrow keys: choose   ·   Space: record (replaces that letter)   ·   Backspace: forget that letter   ·   Shift+Backspace: forget all   ·   Esc: done", {
        fontFamily: FONT,
        fontSize: "16px",
        color: MUTED_CSS,
      })
      .setOrigin(0.5);

    const kb = this.input.keyboard!;
    const move = (d: number) => {
      if (this.phase !== "idle") return;
      this.sel = (this.sel + d + ASL_CLASSES.length) % ASL_CLASSES.length;
      this.note = "";
    };
    kb.on("keydown-LEFT", () => move(-1));
    kb.on("keydown-RIGHT", () => move(1));
    kb.on("keydown-UP", () => move(-COLS));
    kb.on("keydown-DOWN", () => move(COLS));
    kb.on("keydown-SPACE", () => this.startRecording());
    kb.on("keydown-BACKSPACE", (ev: KeyboardEvent) => {
      if (this.phase !== "idle") return;
      if (ev.shiftKey) void clearAllAslExamples().then(() => (this.note = "Forgot all your examples. Every letter uses the built-in model again."));
      else void setAslExamples(this.cls, []).then(() => (this.note = `Forgot your ${this.label}. It uses the built-in model again.`));
    });
    kb.on("keydown-ESC", () => this.scene.start("Title"));
  }

  private get cls(): AslClass {
    return ASL_CLASSES[this.sel];
  }

  private get label() {
    return this.cls === "rest" ? "relaxed hand" : this.cls;
  }

  private tile(i: number) {
    return { x: GRID_X + (i % COLS) * TILE_W + TILE_W / 2, y: GRID_Y + Math.floor(i / COLS) * TILE_H + TILE_H / 2 };
  }

  private startRecording() {
    if (this.phase !== "idle") return;
    if (state.mode !== "hand") {
      this.note = "This needs the camera: press M to turn on hand input.";
      return;
    }
    this.phase = "ready";
    this.phaseStart = performance.now();
    this.captured = [];
    this.frameNo = 0;
    this.note = "";
  }

  private finishRecording() {
    const cls = this.cls, label = this.label;
    this.phase = "idle";
    void setAslExamples(cls, this.captured).then(() => {
      const where = lastSave === "file" ? "saved to data/asl-examples.json" : lastSave === "browser" ? "saved in this browser" : "could NOT be saved";
      this.note = `Recorded ${label}: ${where}.`;
    });
    if (this.sel < ASL_CLASSES.length - 1) this.sel++; // on to the next one
  }

  update() {
    const now = performance.now();
    const g = this.gfx;
    g.clear();

    // capture: every few camera frames, while a hand is visible
    if (this.phase === "ready" && now - this.phaseStart > READY_MS) this.phase = "capture";
    if (this.phase === "capture" && state.aslFeat && state.aslFeat !== this.lastFeat) {
      if (this.frameNo++ % EVERY_NTH_FRAME === 0) this.captured.push(state.aslFeat);
      if (this.captured.length >= ASL.recordFrames) this.finishRecording();
    }
    this.lastFeat = state.aslFeat;

    // grid
    ASL_CLASSES.forEach((cls, i) => {
      const { x, y } = this.tile(i);
      const n = aslExampleCount(cls);
      if (i === this.sel) {
        g.fillStyle(HIGHLIGHTER, 0.85);
        g.fillRect(x - TILE_W / 2 + 6, y - TILE_H / 2 + 8, TILE_W - 12, TILE_H - 16);
      }
      g.lineStyle(i === this.sel ? 3 : 1.5, INK, i === this.sel ? 0.9 : 0.35);
      g.strokeRect(x - TILE_W / 2 + 6, y - TILE_H / 2 + 8, TILE_W - 12, TILE_H - 16);
      this.counts[i].setText(n ? "yours ✓" : "built-in").setColor(n ? ACCENT_CSS : MUTED_CSS);
    });

    // the selected letter's reference card
    const isRest = this.cls === "rest";
    this.card.setVisible(!isRest);
    this.restText.setVisible(isRest);
    if (!isRest) this.card.setTexture(`aslcard_${this.cls}`);

    const hand = state.mode === "hand";
    this.reading.setText(
      !hand ? "camera is off (press M)"
      : !state.handVisible ? "no hand in view"
      : state.aslLetter ? `camera reads: ${state.aslLetter}  (${state.aslSource === "yours" ? "your example" : "built-in model"})`
      : "camera reads: no letter",
    );

    let msg = this.note || `Press Space, then hold ${isRest ? "your relaxed hand" : `the letter ${this.cls}`} in view.`;
    if (this.phase === "ready") msg = `Get ready: ${isRest ? "relax your hand" : `make the letter ${this.cls}`}…`;
    if (this.phase === "capture") {
      msg = state.handVisible ? `Hold ${this.label}. Tilt and move it slightly while it records.` : "Can't see your hand: bring it back into view.";
      const w = 420, x = ARENA.width / 2 - w / 2, y = ARENA.height - 118;
      g.fillStyle(ACCENT, 0.85);
      g.fillRect(x, y, (w * this.captured.length) / ASL.recordFrames, 14);
      g.lineStyle(2.5, INK, 0.9);
      g.strokeRect(x, y, w, 14);
    }
    if (this.status.text !== msg) this.status.setText(msg);
  }
}
