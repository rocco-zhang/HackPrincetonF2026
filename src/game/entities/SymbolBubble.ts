import Phaser from "phaser";
import { GAME } from "../../config";
import type { CastName } from "../../input/events";
import { INK } from "../palette";

const GAP = GAME.iconSize - 2;

/** The row of symbols floating over a monster. The front (left) symbol is highlighted. */
export class SymbolBubble extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Graphics;
  private icons: Phaser.GameObjects.Image[] = [];
  private tape: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, y: number, symbols: CastName[]) {
    super(scene, 0, y);
    this.bg = scene.add.graphics();
    this.add(this.bg);
    this.tape = scene.add.image(0, -GAME.iconSize / 2 - 7, "tape").setAngle(Phaser.Math.Between(-9, 9));
    this.setAngle(Phaser.Math.Between(-4, 4));
    for (const s of symbols) {
      const img = scene.add.image(0, 0, `sym_${s}`).setDisplaySize(GAME.iconSize, GAME.iconSize);
      this.icons.push(img);
      this.add(img);
    }
    this.add(this.tape);
    this.layout(false);
  }

  get remaining() {
    return this.icons.length;
  }

  private layout(animate: boolean) {
    const n = this.icons.length;
    const w = Math.max(1, n) * GAP + 14;
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
    this.icons.forEach((img, i) => {
      const x = -((n - 1) * GAP) / 2 + i * GAP;
      const front = i === 0;
      const base = GAME.iconSize / 64;
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
