import Phaser from "phaser";
import { ARENA } from "../../config";
import { pvp } from "../../net/pvp";
import { accessIcon, friendsIcon, gearIcon, trophyIcon } from "../icons";
import { FONT, HIGHLIGHTER, INK_CSS, MUTED_CSS, TITLE_FONT } from "../palette";
import { Menu } from "../systems/Menu";

/** The base screen: pick singleplayer (Classic) or multiplayer (Duel); friends, achievements and settings in the corner. */
export class Title extends Phaser.Scene {
  private menu!: Menu;
  private note!: Phaser.GameObjects.Text;

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
      const m = this.add.image(x, 190 + Math.floor(i / 2) * 180 + Phaser.Math.Between(-30, 30), `monster${i % 3}`).setFlipX(i % 2 === 0);
      this.tweens.add({ targets: m, x: m.x + Phaser.Math.Between(-30, 30), y: m.y + Phaser.Math.Between(-30, 30), duration: Phaser.Math.Between(3000, 5000), yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    }

    // a swipe of highlighter behind the title
    const hl = this.add.graphics({ x: W / 2, y: 208 }).setAngle(-1.6);
    hl.fillStyle(HIGHLIGHTER, 0.85);
    hl.fillRect(-300, -34, 600, 78);
    hl.fillStyle(HIGHLIGHTER, 0.5);
    hl.fillRect(-312, -26, 628, 20);
    this.add.text(W / 2, 200, "SPELLCAM", { fontFamily: TITLE_FONT, fontSize: "132px", color: INK_CSS }).setOrigin(0.5).setPadding(32).setAngle(-1.6);
    this.add
      .text(W / 2, 292, "You're a stick figure. The paper monsters want you. Draw them away.", { fontFamily: FONT, fontSize: "25px", color: INK_CSS, stroke: "#f9f5ea", strokeThickness: 6 })
      .setOrigin(0.5);

    const menu = (this.menu = new Menu(this));
    const go = (scene: string, data?: object) => () => this.scene.start(scene, data);

    // the two ways to play, side by side
    const modes = [
      { dx: -180, over: "singleplayer", label: "Classic", sub: "you against the waves", scene: "Classic", angle: -1.4 },
      { dx: 180, over: "multiplayer", label: "Duel", sub: "you against a friend", scene: "Duel", angle: 1.2 },
    ];
    for (const m of modes) {
      this.add.text(W / 2 + m.dx, 384, m.over, { fontFamily: FONT, fontSize: "24px", color: INK_CSS, stroke: "#f9f5ea", strokeThickness: 6 }).setOrigin(0.5);
      menu.add({ x: W / 2 + m.dx, y: 474, w: 300, h: 128, label: m.label, sub: m.sub, font: TITLE_FONT, fontSize: 58, angle: m.angle, primary: true, onClick: go(m.scene) });
    }

    // friends → achievements → accessibility → settings, top right
    const corner = [
      { name: "friends", icon: friendsIcon },
      { name: "achievements", icon: trophyIcon },
      { name: "accessibility", icon: accessIcon },
      { name: "settings", icon: gearIcon },
    ];
    corner.forEach((c, i) => {
      const x = W - 62 - (corner.length - 1 - i) * 104;
      menu.add({ x, y: 56, w: 68, h: 64, icon: c.icon, angle: i % 2 ? 1.5 : -1.5, onClick: go("Panel", { kind: c.name }) });
      this.add.text(x, 104, c.name, { fontFamily: FONT, fontSize: "15px", color: MUTED_CSS }).setOrigin(0.5);
    });

    this.note = this.add.text(W / 2, 592, "", { fontFamily: FONT, fontSize: "20px", color: INK_CSS, stroke: "#f9f5ea", strokeThickness: 6 }).setOrigin(0.5);
    this.add.text(W / 2, H - 28, "pinch or click a button   ·   C classic   ·   V duel   ·   G demo run", { fontFamily: FONT, fontSize: "15px", color: MUTED_CSS }).setOrigin(0.5);

    this.input.keyboard?.on("keydown-C", go("Classic"));
    this.input.keyboard?.on("keydown-V", go("Duel"));
  }

  update() {
    this.menu.update();
    const msg = pvp.active ? "You're connected to a friend: open Duel to play them." : "";
    if (this.note.text !== msg) this.note.setText(msg);
  }
}
