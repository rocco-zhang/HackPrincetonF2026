import Phaser from "phaser";
import { ARENA, DIFFICULTY } from "../../config";
import { openLobby } from "../../net/lobby";
import { pvp } from "../../net/pvp";
import { state } from "../../state";
import { spellRecipes } from "../spellCasting";
import { SPELLS } from "../spells";
import { FONT, INK_CSS } from "../palette";
import { sfx } from "../sfx";
import { heading, Menu, screenFrame } from "../systems/Menu";
import { cameraNeeded, difficultyRow, guestLocked, spellDeck, subjectChips } from "../systems/pickers";

const MODES = [
  { id: "ranked", label: "Ranked", sub: "coming soon" },
  { id: "casual", label: "Casual", sub: "open games or a code" },
] as const;


/** Multiplayer setup: subjects, match type (casual: open games or a join code), the spell deck, and getting ready. */
export class Duel extends Phaser.Scene {
  private menu!: Menu;
  private blurb!: Phaser.GameObjects.Text;
  private status!: Phaser.GameObjects.Text;
  private spellNote!: Phaser.GameObjects.Text;
  /** Host a game was pressed: the bottom row shows Public / Private instead. */
  private choosingHost = false;

  constructor() {
    super("Duel");
  }

  /** Set just before opening this screen to land on the join-code box. Used once, then cleared. */
  static joinByCode = false;

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
        x: lx + (i - 0.5) * 218,
        y: 452,
        w: 200,
        h: 86,
        label: m.label,
        sub: m.sub,
        fontSize: 28,
        angle: i === 1 ? 0.8 : -1,
        selected: () => m.id === "casual",
        enabled: () => m.id === "casual", // ranked isn't built yet
        onClick: () => {},
      });
    });

    // right: the spell deck. Each player picks their own two.
    const rx = 1020;
    heading(this, rx, 124, "Spell deck", "pick two; hold thumbs up to cast");
    this.spellNote = spellDeck(this, menu, rx, 208, 112, 112, 12, 3, 380);

    // bottom: finding an opponent
    this.status = this.add
      .text(W / 2, 566, "", { fontFamily: FONT, fontSize: "22px", fontStyle: "bold", color: INK_CSS, align: "center", wordWrap: { width: 1000 } })
      .setOrigin(0.5);
    const y = 646;
    this.choosingHost = false;
    const idle = () => pvp.status === "off" && !this.choosingHost;
    const choosing = () => pvp.status === "off" && this.choosingHost;
    const host = (how: "public" | "private") => () => {
      this.choosingHost = false;
      void (how === "public" ? pvp.hostPublic() : pvp.hostPrivate()).catch(() => {});
    };
    const pending = () => pvp.status === "searching" || pvp.status === "hosting" || pvp.status === "joining";
    // browsing (open games, quick match, a join code) is the panel; hosting is its own button
    menu.add({ x: W / 2 - 150, y, w: 270, h: 66, label: "Browse games", fontSize: 26, angle: -0.8, visible: idle, onClick: () => openLobby() });
    menu.add({ x: W / 2 + 150, y, w: 270, h: 66, label: "Host a game", fontSize: 30, primary: true, angle: 0.8, visible: idle, onClick: () => (this.choosingHost = true) });
    // after Host a game: listed for anyone, or code only
    menu.add({ x: W / 2 - 390, y, w: 130, h: 66, label: "‹ Back", fontSize: 22, angle: -1.2, visible: choosing, onClick: () => (this.choosingHost = false) });
    menu.add({ x: W / 2 - 120, y, w: 280, h: 76, label: "Public game", sub: "anyone can find it", fontSize: 28, primary: true, angle: -0.8, visible: choosing, onClick: host("public") });
    menu.add({ x: W / 2 + 190, y, w: 280, h: 76, label: "Private game", sub: "join code only", fontSize: 28, angle: 0.8, visible: choosing, onClick: host("private") });
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
    menu.add({ x: W / 2 + 130, y, w: 220, h: 66, label: "Disconnect", fontSize: 24, visible: () => pvp.active, onClick: () => pvp.leave() });
    // while hosting or joining there's nothing to do but wait, so Cancel sits alone
    menu.add({ x: W / 2, y, w: 240, h: 66, label: "Cancel", fontSize: 26, visible: pending, onClick: () => pvp.leave() });
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
    // arriving from "Play a friend by code": go straight to the join-code box
    // (a one-shot flag, not scene data: Phaser keeps a scene's last data for later visits)
    if (Duel.joinByCode && pvp.status === "off") openLobby(true);
    Duel.joinByCode = false;
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
        return this.choosingHost
          ? "Public: anyone can find it in Browse games. Private: only people with the code can join."
          : "Browse the open games (or join a friend's code), or host a game for someone to join.";
      case "searching": return "Looking for an opponent…";
      case "hosting":
        if (pvp.hostKind === "private") return pvp.joinCode ? `Private game. Your join code is ${pvp.joinCode}: share it with your friend. Waiting for them to join…` : "Opening a private game…";
        if (pvp.slot < 0) return "Opening a public game…";
        if (!pvp.joinCode) return `Your game is listed as “${pvp.name}”. Waiting for someone to join…`;
        return `Your game is listed as “${pvp.name}”, join code ${pvp.joinCode}. Waiting for someone to join…`;
      case "joining": return `Joining ${pvp.code}…`;
      case "reconnecting": return "Connection trouble: waiting for your opponent…";
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
    const recipes = spellRecipes(state.loadout, state.subjects[0]);
    set(this.spellNote, recipes.map(r => `${SPELLS[r.id].name}: ${r.steps.map(step => step.label).join(" > ")}`).join("\n") + "\nHold thumbs up, then finish the sequence. Casting slows your arena; mistakes cost mana.");
  }
}
