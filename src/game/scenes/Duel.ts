import Phaser from "phaser";
import { ARENA, DIFFICULTY } from "../../config";
import { openLobby } from "../../net/lobby";
import { pvp } from "../../net/pvp";
import { state } from "../../state";
import { FONT, INK, INK_CSS, MUTED_CSS, PAPER } from "../palette";
import { sfx } from "../sfx";
import { heading, Menu, screenFrame } from "../systems/Menu";
import { cameraNeeded, difficultyRow, guestLocked, subjectChips } from "../systems/pickers";

const MODES = [
  { id: "ranked", label: "Ranked", sub: "coming soon" },
  { id: "casual", label: "Casual", sub: "match with anyone" },
  { id: "friend", label: "Friend", sub: "play by room code" },
] as const;

type MatchMode = "casual" | "friend";
/** Which kind of match the bottom buttons find; kept while the page is open. */
let matchMode: MatchMode = "casual";

const DECK_SLOTS = 6;

/** Multiplayer setup: subjects, match type (casual matchmaking or a friend's room code), the spell deck, and getting ready. */
export class Duel extends Phaser.Scene {
  private menu!: Menu;
  private blurb!: Phaser.GameObjects.Text;
  private status!: Phaser.GameObjects.Text;

  constructor() {
    super("Duel");
  }

  create() {
    const W = ARENA.width;
    const menu = (this.menu = new Menu(this));
    screenFrame(this, menu, "Duel", () => this.scene.start("Title"));
    this.followHost();

    // left: what you play and against whom
    const lx = 420;
    heading(this, lx, 124, "Subjects", "pick one or more");
    subjectChips(menu, lx, 190, 104, 92, 10, true);
    heading(this, lx, 266, "Difficulty");
    this.blurb = difficultyRow(this, menu, lx, 308, 140, 44, true);
    heading(this, lx, 392, "Mode");
    MODES.forEach((m, i) => {
      menu.add({
        x: lx + (i - 1) * 218,
        y: 452,
        w: 200,
        h: 86,
        label: m.label,
        sub: m.sub,
        fontSize: 28,
        angle: i === 1 ? 0.8 : -1,
        selected: () => m.id === matchMode,
        // ranked isn't built yet; the match type is fixed once you're searching or connected
        enabled: () => m.id !== "ranked" && (pvp.status === "off" || m.id === matchMode),
        onClick: () => {
          if (m.id !== "ranked" && pvp.status === "off") matchMode = m.id;
        },
      });
    });

    // right: the spell deck (no spells exist yet, so the slots are empty)
    const rx = 1020;
    heading(this, rx, 124, "Spell deck");
    const g = this.add.graphics();
    for (let i = 0; i < DECK_SLOTS; i++) {
      const x = rx + ((i % 3) - 1) * 122, y = 216 + Math.floor(i / 3) * 156;
      g.fillStyle(PAPER, 0.6);
      g.fillRoundedRect(x - 52, y - 70, 104, 140, 10);
      g.lineStyle(2, INK, 0.35);
      g.strokeRoundedRect(x - 52, y - 70, 104, 140, 10);
      this.add.text(x, y, "?", { fontFamily: FONT, fontSize: "54px", color: MUTED_CSS }).setOrigin(0.5).setAlpha(0.6).setAngle(i % 2 ? 5 : -5);
    }
    this.add
      .text(rx, 468, "Spells are coming.\nThe ones you bring to a duel will go here.", { fontFamily: FONT, fontSize: "18px", color: MUTED_CSS, align: "center" })
      .setOrigin(0.5, 0);

    // bottom: the friend match itself
    this.status = this.add
      .text(W / 2, 566, "", { fontFamily: FONT, fontSize: "22px", fontStyle: "bold", color: INK_CSS, align: "center", wordWrap: { width: 1000 } })
      .setOrigin(0.5);
    const y = 646;
    const idle = (mode: MatchMode) => () => pvp.status === "off" && matchMode === mode;
    menu.add({ x: W / 2 - 150, y, w: 270, h: 66, label: "Quick match", fontSize: 30, primary: true, angle: -0.8, visible: idle("casual"), onClick: () => void pvp.quickMatch() });
    menu.add({ x: W / 2 + 150, y, w: 270, h: 66, label: "Browse games", fontSize: 26, angle: 0.8, visible: idle("casual"), onClick: openLobby });
    menu.add({ x: W / 2, y, w: 340, h: 66, label: "Host or join a game", fontSize: 28, primary: true, angle: -0.8, visible: idle("friend"), onClick: openLobby });
    menu.add({
      x: W / 2 - 130,
      y,
      w: 240,
      h: 66,
      label: () => (pvp.status === "hosting" && pvp.slot < 0 ? "Show the code" : "Open lobby"),
      fontSize: 26,
      visible: () => pvp.status === "searching" || pvp.status === "hosting" || pvp.status === "joining",
      onClick: openLobby,
    });
    menu.add({
      x: W / 2 - 130,
      y,
      w: 240,
      h: 66,
      label: () => (pvp.myReady ? "Not ready" : "Ready"),
      fontSize: 30,
      primary: true,
      angle: -0.8,
      visible: () => pvp.active,
      enabled: () => pvp.status === "connected" && !cameraNeeded(),
      onClick: () => this.toggleReady(),
    });
    menu.add({
      x: W / 2 + 130,
      y,
      w: 220,
      h: 66,
      label: () => (pvp.active ? "Disconnect" : "Cancel"),
      fontSize: 24,
      visible: () => pvp.status !== "off",
      onClick: () => pvp.leave(),
    });
    this.input.keyboard?.on("keydown-SPACE", () => this.toggleReady());
    this.input.keyboard?.on("keydown-ENTER", () => this.toggleReady());

    const off = pvp.on((e) => {
      if (e.type === "message" && e.msg.t === "hello") this.followHost();
      else if (e.type === "start") {
        sfx.start();
        this.scene.start("Arena", { subjects: state.subjects, pvp: true });
      }
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      off();
      if (pvp.active && pvp.myReady) pvp.setReady(false); // leaving this screen means not ready
    });
    pvp.sendMode(); // host: make sure the guest has the current picks
  }

  /** Guest: play what the host picked (not saved as our own choice). */
  private followHost() {
    if (!guestLocked() || !pvp.hostMode) return;
    state.subjects = pvp.hostMode.subjects;
    state.difficulty = pvp.hostMode.difficulty;
  }

  private toggleReady() {
    if (pvp.status !== "connected" || cameraNeeded()) return;
    pvp.setReady(!pvp.myReady);
    if (pvp.myReady) sfx.start();
  }

  private statusLine(): string {
    if (pvp.error) return pvp.error;
    switch (pvp.status) {
      case "off":
        return matchMode === "casual"
          ? "Casual: quick match pairs you with whoever's waiting, or browse the open games."
          : "Friend match: one of you hosts and reads out a four-letter code, the other joins with it.";
      case "searching": return "Looking for an opponent…";
      case "hosting":
        if (pvp.slot < 0) return `Your code is ${pvp.code}. Waiting for your friend to join…`;
        return pvp.quick ? "No one was waiting, so you're hosting. Waiting for an opponent…" : `Your game is listed as “${pvp.name}”. Waiting for someone to join…`;
      case "joining": return `Joining ${pvp.code}…`;
      case "reconnecting": return "Connection trouble: waiting for your friend…";
    }
    if (cameraNeeded()) return "ASL needs the camera, and this is the mouse-only test mode.";
    const who = pvp.isHost ? "You're the host: you pick the subjects and difficulty." : "The host picks the subjects and difficulty.";
    if (pvp.myReady) return "Ready! Waiting for your opponent…";
    return pvp.theirReady ? "Your opponent is ready. Press Ready to start." : `Connected. ${who} Press Ready when you are.`;
  }

  update() {
    this.menu.update();
    const set = (t: Phaser.GameObjects.Text, s: string) => t.text !== s && t.setText(s);
    set(this.blurb, DIFFICULTY[state.difficulty].blurb);
    set(this.status, this.statusLine());
  }
}
