import Phaser from "phaser";
import { a11y } from "../../a11y";
import { ARENA, DIFFICULTY } from "../../config";
import { saveClassicSpells, state } from "../../state";
import { arrowIcon, pinchIcon } from "../icons";
import { ACCENT_CSS, FONT, INK_CSS } from "../palette";
import { sfx } from "../sfx";
import { SUBJECT_INFO } from "../subjects";
import { heading, Menu, screenFrame } from "../systems/Menu";
import { cameraNeeded, difficultyRow, spellDeck, subjectChips } from "../systems/pickers";
import { spellRecipes } from "../spellCasting";
import { SPELLS } from "../spells";

/** Singleplayer setup: difficulty, subjects, how it works, start. */
export class Classic extends Phaser.Scene {
  private menu!: Menu;
  private blurb!: Phaser.GameObjects.Text;
  private subjectNote!: Phaser.GameObjects.Text;
  private matchText!: Phaser.GameObjects.Text;
  private warn!: Phaser.GameObjects.Text;
  private spellNote: Phaser.GameObjects.Text | null = null;

  constructor() {
    super("Classic");
  }

  create() {
    const W = ARENA.width, cx = W / 2;
    const menu = (this.menu = new Menu(this));
    screenFrame(this, menu, "Classic", () => this.scene.start("Title"));

    // spells are off unless switched on with the toggle in the corner; the screen is laid out
    // again when it changes, tighter when the spell row is there
    const spells = state.classicSpells;
    menu.add({
      x: W - 108,
      y: 54,
      w: 164,
      h: 46,
      label: spells ? "Spells: on" : "Spells: off",
      fontSize: 20,
      angle: 1.2,
      selected: () => spells,
      onClick: () => {
        saveClassicSpells(!spells);
        this.scene.restart();
      },
    });
    const y = spells
      ? { diffHead: 116, diff: 154, diffH: 42, subHead: 226, sub: 284, subH: 84, step: 520, cap: 572, capSize: 17, capWidth: 320, art: 0.88, start: 680, startH: 54 }
      : { diffHead: 124, diff: 168, diffH: 48, subHead: 244, sub: 318, subH: 104, step: 472, cap: 540, capSize: 19, capWidth: 300, art: 1, start: 664, startH: 68 };

    heading(this, cx, y.diffHead, "Difficulty");
    this.blurb = difficultyRow(this, menu, cx, y.diff, 160, y.diffH);

    this.subjectNote = heading(this, cx, y.subHead, "Subjects", "pick one or more").note;
    subjectChips(menu, cx, y.sub, 150, y.subH, 16);

    this.spellNote = null;
    if (spells) {
      heading(this, cx, 348, "Spells", "pick two · hold 👍 to begin casting");
      this.spellNote = spellDeck(this, menu, cx, 396, 150, 62, 16, 6, 1000);
    } else heading(this, cx, 404, "How it works");

    // how it works: three steps, each with a picture
    const stepY = y.step;
    const xs = [cx - 360, cx, cx + 360];
    const cap = (x: number, text: string) =>
      this.add.text(x, y.cap, text, { fontFamily: FONT, fontSize: `${y.capSize}px`, color: INK_CSS, align: "center", wordWrap: { width: y.capWidth } }).setOrigin(0.5, 0);
    // 1: pinch to draw
    pinchIcon(this.add.graphics({ x: xs[0] + 12, y: stepY }).setScale(y.art));
    cap(xs[0], "1. Pinch thumb and index finger to draw in the air");
    // 2: match what a monster carries
    this.add.image(xs[1] - 44, stepY + 4, "monster1").setScale(0.8 * y.art);
    this.add.image(xs[1] + 4, stepY - 32, "sym_v").setScale(0.8 * y.art).setAngle(-6);
    const scraps = [[52, -8], [70, 14], [60, 32], [84, -2]];
    scraps.forEach(([dx, dy], i) => this.add.image(xs[1] + dx, stepY + dy, "scrap").setAngle(i * 70));
    this.matchText = cap(xs[1], "");
    // 3: keep them away from you
    this.add.image(xs[2] - 52, stepY, "player").setScale(0.62 * y.art);
    ["heart", "heart", "heart_empty"].forEach((k, i) => this.add.image(xs[2] + 8 + i * 40, stepY, k).setScale(y.art));
    cap(xs[2], spells ? "3. One that reaches you costs a heart. Drawing fills your mana for spells" : "3. One that reaches you costs a heart. Lose them all and it's over");
    arrowIcon(this.add.graphics({ x: cx - 180, y: stepY }));
    arrowIcon(this.add.graphics({ x: cx + 180, y: stepY }));

    this.warn = spells
      ? this.add.text(cx + 190, y.start, "", { fontFamily: FONT, fontSize: "18px", fontStyle: "bold", color: ACCENT_CSS }).setOrigin(0, 0.5)
      : this.add.text(cx, 610, "", { fontFamily: FONT, fontSize: "20px", fontStyle: "bold", color: ACCENT_CSS }).setOrigin(0.5);
    menu.add({ x: cx, y: y.start, w: 300, h: y.startH, label: "Start", fontSize: spells ? 32 : 36, primary: true, angle: -0.8, enabled: () => !cameraNeeded(), onClick: () => this.begin() });
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
    if (this.spellNote) {
      const recipes=spellRecipes(state.loadout,state.subjects[0]);
      set(this.spellNote,recipes.map(r=>`${SPELLS[r.id].name}: 👍 then ${r.steps.map(s=>s.label).join(" → ")}`).join("   ·   ")+"\nHold thumbs up to begin immediately. First character selects the spell; finish in order or lose mana.");
    }
    set(this.warn, cameraNeeded() ? "ASL needs the camera (mouse test mode)" : "");
  }
}
