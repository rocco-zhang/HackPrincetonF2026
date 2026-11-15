import Phaser from "phaser";
import { ARENA, DIFFICULTY, type Difficulty } from "../../config";
import { state } from "../../state";
import { setMusicFast } from "../sfx";
import { FONT, INK, INK_CSS, MUTED_CSS, ORANGE_CSS } from "../palette";

const MANA_W = 210, MANA_H = 18, MANA_Y = 50;

export class Hud {
  private hearts: Phaser.GameObjects.Image[] = [];
  private scoreText: Phaser.GameObjects.Text;
  private multText: Phaser.GameObjects.Text;
  private waveText: Phaser.GameObjects.Text;
  private slotTexts: Phaser.GameObjects.Text[] = [];
  private starterTexts: Phaser.GameObjects.Text[] = [];
  private manaBar: Phaser.GameObjects.Graphics;
  private manaText: Phaser.GameObjects.Text;
  private mana = { now: 0, shown: 0, max: 1 };
  private slots: { name: string; glyph: string; cost: number; gesture: string }[] = [];
  private spellsOn = false;
  private hint: Phaser.GameObjects.Text;
  private warn: Phaser.GameObjects.Text;
  private shownScore = 0;

  constructor(
    private scene: Phaser.Scene,
    maxHearts: number,
    private difficulty: Difficulty = "medium",
  ) {
    const depth = 1000;
    for (let i = 0; i < maxHearts; i++) {
      this.hearts.push(scene.add.image(36 + i * 44, 36, "heart").setDepth(depth));
    }
    this.scoreText = scene.add
      .text(ARENA.width + 8, -16, "0", { fontFamily: FONT, fontSize: "40px", fontStyle: "bold", color: INK_CSS, stroke: "#f9f5ea", strokeThickness: 8 })
      .setOrigin(1, 0)
      .setPadding(32)
      .setDepth(depth);
    this.multText = scene.add
      .text(ARENA.width - 24, 62, "", { fontFamily: FONT, fontSize: "20px", fontStyle: "bold", color: ORANGE_CSS, stroke: "#f9f5ea", strokeThickness: 5 })
      .setOrigin(1, 0)
      .setDepth(depth);
    this.waveText = scene.add
      .text(ARENA.width / 2, 18, "", { fontFamily: FONT, fontSize: "22px", fontStyle: "bold", color: INK_CSS, stroke: "#f9f5ea", strokeThickness: 6 })
      .setOrigin(0.5, 0)
      .setDepth(depth);
    // Mana stays under the wave name; equipped spells form a stack below the score on the right.
    this.manaBar = scene.add.graphics().setDepth(depth);
    this.manaText = scene.add
      .text(ARENA.width / 2, MANA_Y + MANA_H / 2, "", { fontFamily: FONT, fontSize: "13px", fontStyle: "bold", color: INK_CSS })
      .setOrigin(0.5)
      .setDepth(depth);
    for (let slot=0;slot<2;slot++) {
      const y=112+slot*52;
      this.starterTexts.push(scene.add.text(ARENA.width-8,y+22,"",{fontFamily:FONT,fontSize:"15px",color:INK_CSS,stroke:"#f9f5ea",strokeThickness:4}).setOrigin(1,.5).setDepth(depth));
      this.slotTexts.push(
        scene.add
          .text(ARENA.width-8, y, "", { fontFamily: FONT, fontSize: "18px", fontStyle: "bold", color: INK_CSS, stroke: "#f9f5ea", strokeThickness: 5 })
          .setOrigin(1, 0.5)
          .setDepth(depth),
      );
    }
    this.hint = scene.add
      .text(18, ARENA.height - 14, "", { fontFamily: FONT, fontSize: "16px", color: MUTED_CSS })
      .setOrigin(0, 1)
      .setDepth(depth);
    this.warn = scene.add
      .text(ARENA.width / 2, ARENA.height - 40, "✋ Raise your hand so the camera can see it", {
        fontFamily: FONT,
        fontSize: "24px",
        fontStyle: "bold",
        color: "#ffffff",
        backgroundColor: "#d7372f",
        padding: { x: 14, y: 8 },
      })
      .setOrigin(0.5, 1)
      .setDepth(depth)
      .setVisible(false);
  }

  setHearts(n: number) {
    setMusicFast(n === 1); // last heart: the music hurries
    this.hearts.forEach((h, i) => {
      const was = h.texture.key === "heart";
      h.setTexture(i < n ? "heart" : "heart_empty");
      if (was && i >= n) {
        this.scene.tweens.add({ targets: h, scale: 1.8, duration: 120, yoyo: true });
      }
    });
  }

  setWave(n: number) {
    this.waveText.setText(this.difficulty === "medium" ? `Wave ${n}` : `Wave ${n}  ·  ${DIFFICULTY[this.difficulty].label}`);
  }

  /** Show or hide the mana bar and the two equipped spells. */
  showSpells(on: boolean) {
    this.manaBar.setVisible(on);
    this.manaText.setVisible(on);
    for (const t of this.slotTexts) t.setVisible(on);
    for (const t of this.starterTexts) t.setVisible(on);
  }

  /** The two spells in play, and whether they can be cast in this wave's subject. */
  setSpells(slots: { name: string; glyph: string; cost: number; gesture: string }[], on: boolean) {
    this.slots = slots;
    this.spellsOn = on;
    this.paintSpells();
  }

  setMana(now: number, max: number) {
    this.mana.now = now;
    this.mana.max = max;
    this.paintSpells();
  }

  private paintSpells() {
    this.slots.forEach((slot, i) => {
      const ready = this.spellsOn && this.mana.now >= slot.cost;
      const text=this.slotTexts[i];
      text?.setText(`${slot.glyph} ${slot.name} - ${slot.cost}`).setAlpha(ready ? 1 : 0.4);
      this.starterTexts[i]?.setText(slot.gesture).setAlpha(ready?1:.4);
    });
    this.manaText.setText(this.spellsOn ? `mana ${Math.round(this.mana.now)}` : "no spells this wave");
  }

  private paintMana() {
    const g = this.manaBar;
    const x = ARENA.width / 2 - MANA_W / 2;
    g.clear();
    g.fillStyle(0xfffefa, 0.9);
    g.fillRoundedRect(x, MANA_Y, MANA_W, MANA_H, 6);
    g.fillStyle(this.spellsOn ? 0x7fc4f5 : 0xcfcabd, 1);
    const w = (MANA_W * Math.max(0, Math.min(1, this.mana.shown / this.mana.max)));
    if (w > 2) g.fillRoundedRect(x, MANA_Y, w, MANA_H, Math.min(6, w / 2));
    // a tick where each spell becomes affordable
    g.lineStyle(2, INK, 0.45);
    for (const slot of this.slots) {
      const tx = x + (MANA_W * slot.cost) / this.mana.max;
      g.lineBetween(tx, MANA_Y + 2, tx, MANA_Y + MANA_H - 2);
    }
    g.lineStyle(2.5, INK, 0.85);
    g.strokeRoundedRect(x, MANA_Y, MANA_W, MANA_H, 6);
  }

  setMultiplier(m: number) {
    this.multText.setText(m > 1 ? `streak ×${m.toFixed(1)}` : "");
  }

  update(score: number) {
    // the bar slides to its new level
    const m = this.mana;
    if (Math.abs(m.shown - m.now) > 0.2) m.shown += (m.now - m.shown) * 0.2;
    else m.shown = m.now;
    this.paintMana();
    if (this.shownScore !== score) {
      this.shownScore += Math.ceil((score - this.shownScore) * 0.2);
      if (Math.abs(score - this.shownScore) < 2) this.shownScore = score;
      this.scoreText.setText(this.shownScore.toLocaleString());
    }
    const hand = state.mode === "hand";
    this.hint.setText(
      (state.langActive ? "draw the mark on the monster" : state.mathActive ? "draw each digit, then hold still" : state.aslActive ? "🤟 hold a letter's handshape" : hand ? "✋ pinch thumb + index to draw" : "drag to draw (mouse test mode)") + "   ·   D debug",
    );
    const lost = hand && performance.now() - state.lastHandSeen > 1000;
    this.warn.setVisible(lost).setY(state.aslActive ? ARENA.height - 160 : ARENA.height - 40); // clear of the ASL cards
  }
}
