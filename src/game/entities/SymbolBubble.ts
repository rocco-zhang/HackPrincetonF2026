import Phaser from "phaser";
import { GAME } from "../../config";
import type { CastName } from "../../input/events";
import { FONT, INK, INK_CSS } from "../palette";

const GAP = 8;

type Chip = Phaser.GameObjects.Image | Phaser.GameObjects.Text;

/** The row of symbols floating over a monster. The front (left) one is highlighted. */
export class SymbolBubble extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Graphics;
  private icons: Chip[] = [];
  private tape: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, y: number, symbols: CastName[], labels?: string[]) {
    super(scene, 0, y);
    this.bg = scene.add.graphics();
    this.add(this.bg);
    this.tape = scene.add.image(0, -GAME.iconSize / 2 - 7, "tape").setAngle(Phaser.Math.Between(-9, 9));
    this.setAngle(Phaser.Math.Between(-4, 4));
    symbols.forEach((s, i) => {
      const label = labels?.[i];
      const chip: Chip = label
        ? scene.add.text(0, 0, label, { fontFamily: FONT, fontSize: "30px", fontStyle: "bold", color: INK_CSS }).setOrigin(0.5)
        : scene.add.image(0, 0, `sym_${s}`);
      this.icons.push(chip);
      this.add(chip);
    });
    this.add(this.tape);
    this.layout(false);
  }

  get remaining() {
    return this.icons.length;
  }

  private chipWidth(chip: Chip): number {
    return chip instanceof Phaser.GameObjects.Text ? chip.width + 18 : GAME.iconSize;
  }

  private layout(animate: boolean) {
    const n = this.icons.length;
    const widths = this.icons.map((chip) => this.chipWidth(chip));
    const w = Math.max(GAME.iconSize, widths.reduce((sum, width) => sum + width, 0) + GAP * Math.max(0, n - 1)) + 16;
    this.bg.clear();
    this.tape.setVisible(n > 0);
    if (n > 0) {
      const top = -GAME.iconSize / 2 - 6, h = GAME.iconSize + 12;
      this.bg.fillStyle(0x281e0a, 0.18);
      this.bg.fillRect(-w / 2 + 2, top + 3, w, h);
      this.bg.fillStyle(0xfffefa, 1);
      this.bg.fillRect(-w / 2, top, w, h);
      this.bg.lineStyle(1.5, INK, 0.6);
      this.bg.strokeRect(-w / 2, top, w, h);
    }
    let cursor = -widths.reduce((sum, width) => sum + width, 0) / 2 - (GAP * Math.max(0, n - 1)) / 2;
    this.icons.forEach((img, i) => {
      const x = cursor + widths[i] / 2;
      cursor += widths[i] + GAP;
      const front = i === 0;
      const text = img instanceof Phaser.GameObjects.Text;
      const base = text ? 1 : GAME.iconSize / 64;
      this.scene.tweens.killTweensOf(img);
      if (animate) this.scene.tweens.add({ targets: img, x, duration: 140, ease: "Quad.easeOut" });
      else img.x = x;
      img.setAlpha(front ? 1 : 0.4);
      img.setScale(base * (front ? 1.12 : 0.88));
      if (front) {
        this.scene.tweens.add({
          targets: img,
          scaleX: base * 1.25,
          scaleY: base * 1.25,
          duration: 420,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
      }
    });
  }

  /** Visually pop the front symbol (the logical queue lives on the Monster). */
  popFront() {
    const img = this.icons.shift();
    if (!img) return;
    this.scene.tweens.killTweensOf(img);
    const wp = img.getWorldTransformMatrix();
    this.remove(img);
    img.setPosition(wp.tx, wp.ty).setDepth(50);
    this.scene.add.existing(img);
    this.scene.tweens.add({
      targets: img,
      scale: img.scale * 2.2,
      alpha: 0,
      duration: 260,
      ease: "Quad.easeOut",
      onComplete: () => img.destroy(),
    });
    this.layout(true);
  }
}
