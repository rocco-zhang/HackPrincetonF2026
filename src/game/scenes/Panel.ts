import Phaser from "phaser";
import { actions } from "../../actions";
import { ARENA, DIFFICULTIES, DIFFICULTY } from "../../config";
import { state } from "../../state";
import { FONT, INK_CSS, MUTED_CSS } from "../palette";
import { audio, setAudio, sfx } from "../sfx";
import { bestScore, SUBJECT_INFO, SUBJECTS } from "../subjects";
import { Menu, screenFrame } from "../systems/Menu";

export type PanelKind = "friends" | "achievements" | "settings";

const NAMES: Record<PanelKind, string> = { friends: "Friends", achievements: "Achievements", settings: "Settings" };

/** The three screens behind the title screen's corner icons. */
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
