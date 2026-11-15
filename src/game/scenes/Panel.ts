import Phaser from "phaser";
import { a11y, cardScale, setA11y, SIZE_NAMES, type A11y } from "../../a11y";
import { actions } from "../../actions";
import { ARENA, DIFFICULTIES, DIFFICULTY } from "../../config";
import { state } from "../../state";
import { SYMBOLS } from "../../input/events";
import { Monster } from "../entities/Monster";
import { FONT, INK_CSS, MUTED_CSS } from "../palette";
import { audio, setAudio, sfx } from "../sfx";
import { bestScore, SUBJECT_INFO, SUBJECTS } from "../subjects";
import { Menu, screenFrame } from "../systems/Menu";

export type PanelKind = "friends" | "achievements" | "accessibility" | "settings";

const NAMES: Record<PanelKind, string> = { friends: "Friends", achievements: "Achievements", accessibility: "Accessibility", settings: "Settings" };

/** The four screens behind the title screen's corner icons. */
export class Panel extends Phaser.Scene {
  private menu!: Menu;

  constructor() {
    super("Panel");
  }

  create(data: { kind?: PanelKind }) {
    const kind = data?.kind ?? "settings";
    const menu = (this.menu = new Menu(this));
    screenFrame(this, menu, NAMES[kind], () => this.scene.start("Title"));
    if (kind === "friends") this.friends();
    else if (kind === "achievements") this.achievements();
    else if (kind === "accessibility") this.accessibility();
    else this.settings();
  }

  private say(y: number, text: string, size = 24, color = INK_CSS) {
    return this.add.text(ARENA.width / 2, y, text, { fontFamily: FONT, fontSize: `${size}px`, color, align: "center", wordWrap: { width: 820 } }).setOrigin(0.5, 0);
  }

  private friends() {
    this.say(190, "There's no friends list yet.");
    this.say(240, "For now you can play anyone on another computer with a room code: one of you hosts, the other joins.", 21, MUTED_CSS);
    this.menu.add({ x: ARENA.width / 2, y: 370, w: 360, h: 68, label: "Play a friend by code", fontSize: 28, primary: true, angle: -0.8, onClick: () => this.scene.start("Duel") });
  }

  /** No badges exist yet, so this shows the one record the game does keep: best scores. */
  private achievements() {
    this.say(136, "Badges aren't built yet. Until then, your best Classic scores on this computer:", 21, MUTED_CSS);
    const x0 = 400, cols = [660, 800, 940], y0 = 222, row = 58;
    DIFFICULTIES.forEach((d, i) => this.add.text(cols[i], y0, DIFFICULTY[d].label, { fontFamily: FONT, fontSize: "22px", fontStyle: "bold", color: INK_CSS }).setOrigin(1, 0.5));
    SUBJECTS.forEach((s, r) => {
      const y = y0 + (r + 1) * row;
      this.add.text(x0, y, SUBJECT_INFO[s].label, { fontFamily: FONT, fontSize: "24px", fontStyle: "bold", color: INK_CSS }).setOrigin(0, 0.5);
      DIFFICULTIES.forEach((d, i) => {
        const best = bestScore([s], d);
        this.add.text(cols[i], y, best ? best.toLocaleString() : "–", { fontFamily: FONT, fontSize: "24px", color: best ? INK_CSS : MUTED_CSS }).setOrigin(1, 0.5);
      });
    });
    this.say(y0 + 7 * row + 8, "Rounds that mix subjects keep their own best score, shown when a round ends.", 17, MUTED_CSS);
  }

  /** Colour-blind colours, card size, reduced motion and a plain font, with a preview of what they change. */
  private accessibility() {
    const onOff = (v: boolean) => (v ? "On" : "Off");
    const again = () => this.scene.restart({ kind: "accessibility" });
    const flip = (k: "colorblind" | "reduceMotion" | "plainFont") => setA11y({ [k]: !a11y[k] } as Partial<A11y>);
    const rows = [
      {
        name: "Colour-blind colours",
        note: "markers that stay apart without telling red from green",
        label: onOff(a11y.colorblind),
        on: a11y.colorblind,
        // the symbols are drawn once, so redraw the art in the new colours and come back here
        run: () => (flip("colorblind"), this.scene.start("Boot", { next: "Panel", data: { kind: "accessibility" } })),
      },
      {
        name: "Card size",
        note: "how big the cards on the monsters are",
        label: SIZE_NAMES[a11y.size],
        on: a11y.size > 0,
        run: () => (setA11y({ size: ((a11y.size + 1) % 3) as A11y["size"] }), again()),
      },
      { name: "Reduce motion", note: "no screen shake, no flashes", label: onOff(a11y.reduceMotion), on: a11y.reduceMotion, run: () => (flip("reduceMotion"), again()) },
      { name: "Plain font", note: "a clear sans-serif instead of handwriting", label: onOff(a11y.plainFont), on: a11y.plainFont, run: () => (flip("plainFont"), again()) },
    ];
    rows.forEach((r, i) => {
      const y = 166 + i * 84;
      this.add.text(150, y - 12, r.name, { fontFamily: FONT, fontSize: "26px", fontStyle: "bold", color: INK_CSS }).setOrigin(0, 0.5);
      this.add.text(150, y + 16, r.note, { fontFamily: FONT, fontSize: "17px", color: MUTED_CSS }).setOrigin(0, 0.5);
      this.menu.add({ x: 700, y, w: 200, h: 54, label: r.label, fontSize: 22, angle: i % 2 ? 0.6 : -0.6, selected: () => r.on, onClick: r.run });
    });

    // preview: a monster carrying cards at the chosen size, and the six markers in the chosen colours
    this.add.text(1030, 132, "Preview", { fontFamily: FONT, fontSize: "20px", fontStyle: "bold", color: INK_CSS }).setOrigin(0.5);
    new Monster(this, 1030, 300 + (cardScale() - 1) * 40, ["circle", "v"], 0, 1);
    SYMBOLS.forEach((s, i) => this.add.image(1030 + ((i % 3) - 1) * 84, 410 + Math.floor(i / 3) * 78, `sym_${s}`).setScale(1.15));
    this.say(590, "These are saved on this computer and apply to every mode.", 17, MUTED_CSS);
  }

  private settings() {
    const onOff = (v: boolean) => (v ? "On" : "Off");
    type Row = { name: string; note: string; label: string | (() => string); run: () => void; volume?: { get: () => number; set: (v: number) => void; on: () => boolean; test?: () => void } };
    const rows: Row[] = [
      {
        name: "Sound effects",
        note: "N mutes all",
        label: () => onOff(audio.sfxOn),
        run: () => setAudio({ sfxOn: !audio.sfxOn }),
        // let go of the slider to hear how loud that is
        volume: { get: () => audio.sfxVol, set: (v) => setAudio({ sfxVol: v }), on: () => audio.sfxOn, test: () => sfx.hit() },
      },
      {
        name: "Music",
        note: "",
        label: () => onOff(audio.musicOn),
        run: () => setAudio({ musicOn: !audio.musicOn }),
        volume: { get: () => audio.musicVol, set: (v) => setAudio({ musicVol: v }), on: () => audio.musicOn },
      },
      { name: "Mirror the camera", note: "F", label: () => onOff(state.mirror), run: actions.toggleMirror },
      { name: "Camera", note: "C", label: "Use the next camera", run: () => void actions.nextCamera() },
      { name: "Drawing area", note: "K", label: "Calibrate (4 seconds)", run: () => void actions.calibrate() },
      { name: "ASL letters", note: "", label: "Teach it your own hand", run: () => this.scene.start("AslTrainer") },
      { name: "Debug overlay", note: "D", label: () => onOff(state.debug), run: actions.toggleDebug },
    ];
    // the pinch-tuning page only exists on the dev server
    if (import.meta.env.DEV) rows.push({ name: "Input lab", note: "", label: "Tune pinch settings", run: () => void (location.href = "/dev/pinch") });
    rows.forEach((r, i) => {
      const y = 140 + i * 62;
      this.add.text(300, y, r.name, { fontFamily: FONT, fontSize: "26px", fontStyle: "bold", color: INK_CSS }).setOrigin(0, 0.5);
      if (r.note) this.add.text(560, y + 2, `key ${r.note}`, { fontFamily: FONT, fontSize: "16px", color: MUTED_CSS }).setOrigin(0, 0.5);
      if (r.volume) {
        // an on/off switch, then the volume
        this.menu.add({ x: 730, y, w: 100, h: 48, label: r.label, fontSize: 22, angle: i % 2 ? 0.6 : -0.6, selected: r.volume.on, onClick: r.run });
        this.menu.slider({ x: 816, y, w: 164, get: r.volume.get, set: r.volume.set, enabled: r.volume.on, onRelease: r.volume.test });
      } else this.menu.add({ x: 830, y, w: 300, h: 48, label: r.label, fontSize: 22, angle: i % 2 ? 0.6 : -0.6, onClick: r.run });
    });
  }

  update() {
    this.menu.update();
  }
}
