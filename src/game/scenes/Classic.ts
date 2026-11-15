import Phaser from "phaser";
import { a11y } from "../../a11y";
import { ARENA, DIFFICULTY } from "../../config";
import { state } from "../../state";
import { arrowIcon, pinchIcon } from "../icons";
import { ACCENT_CSS, FONT, INK_CSS } from "../palette";
import { sfx } from "../sfx";
import { SUBJECT_INFO } from "../subjects";
import { heading, Menu, screenFrame } from "../systems/Menu";
import { cameraNeeded, difficultyRow, subjectChips } from "../systems/pickers";

/** Singleplayer setup: difficulty, subjects, how it works, start. */
export class Classic extends Phaser.Scene {
  private menu!: Menu;
  private blurb!: Phaser.GameObjects.Text;
  private subjectNote!: Phaser.GameObjects.Text;
  private matchText!: Phaser.GameObjects.Text;
  private warn!: Phaser.GameObjects.Text;

  constructor() {
    super("Classic");
  }

  create() {
    const W = ARENA.width, cx = W / 2;
    const menu = (this.menu = new Menu(this));
    screenFrame(this, menu, "Classic", () => this.scene.start("Title"));

    heading(this, cx, 124, "Difficulty");
    this.blurb = difficultyRow(this, menu, cx, 168);

    this.subjectNote = heading(this, cx, 244, "Subjects", "pick one or more").note;
    subjectChips(menu, cx, 318, 150, 104, 16);

    // how it works: three steps, each with a picture
    heading(this, cx, 404, "How it works");
    const stepY = 472, capY = 540;
    const xs = [cx - 360, cx, cx + 360];
    const cap = (x: number, text: string) =>
      this.add.text(x, capY, text, { fontFamily: FONT, fontSize: "19px", color: INK_CSS, align: "center", wordWrap: { width: 300 } }).setOrigin(0.5, 0);
    // 1: pinch to draw
    pinchIcon(this.add.graphics({ x: xs[0] + 12, y: stepY }));
    cap(xs[0], "1. Pinch thumb and index finger to draw in the air");
    // 2: match what a monster carries
    this.add.image(xs[1] - 44, stepY + 4, "monster1").setScale(0.8);
    this.add.image(xs[1] + 6, stepY - 34, "sym_v").setScale(0.8).setAngle(-6);
    const scraps = [[52, -8], [70, 14], [60, 34], [84, -2]];
    scraps.forEach(([dx, dy], i) => this.add.image(xs[1] + dx, stepY + dy, "scrap").setAngle(i * 70));
    this.matchText = cap(xs[1], "");
    // 3: keep them away from you
    this.add.image(xs[2] - 52, stepY, "player").setScale(0.62);
    ["heart", "heart", "heart_empty"].forEach((k, i) => this.add.image(xs[2] + 8 + i * 40, stepY, k));
    cap(xs[2], "3. One that reaches you costs a heart. Lose them all and it's over");
    arrowIcon(this.add.graphics({ x: cx - 180, y: stepY }));
    arrowIcon(this.add.graphics({ x: cx + 180, y: stepY }));

    this.warn = this.add.text(cx, 610, "", { fontFamily: FONT, fontSize: "20px", fontStyle: "bold", color: ACCENT_CSS }).setOrigin(0.5);
    menu.add({ x: cx, y: 664, w: 300, h: 68, label: "Start", fontSize: 36, primary: true, angle: -0.8, enabled: () => !cameraNeeded(), onClick: () => this.begin() });
    this.input.keyboard?.on("keydown-SPACE", () => this.begin());
    this.input.keyboard?.on("keydown-ENTER", () => this.begin());
  }

  private begin() {
    if (cameraNeeded()) return;
    sfx.start();
    if (!a11y.reduceMotion) this.cameras.main.flash(250, 255, 255, 255);
    this.scene.start("Arena", { subjects: state.subjects });
  }

  update() {
    this.menu.update();
    const set = (t: Phaser.GameObjects.Text, s: string) => t.text !== s && t.setText(s);
    set(this.blurb, DIFFICULTY[state.difficulty].blurb);
    const many = state.subjects.length > 1;
    set(this.subjectNote, many ? `each wave switches to the next: ${state.subjects.map((s) => SUBJECT_INFO[s].label).join(" → ")}` : "pick one or more");
    const hows = [...new Set(state.subjects.map((s) => SUBJECT_INFO[s].how))];
    set(this.matchText, `2. A monster carries a card: ${hows.join(", or ")} to tear it up`);
    set(this.warn, cameraNeeded() ? "ASL needs the camera, and this is the mouse-only test mode" : "");
  }
}
