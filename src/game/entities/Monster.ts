import Phaser from "phaser";
import { GAME } from "../../config";
import type { CastName } from "../../input/events";
import { SymbolBubble } from "./SymbolBubble";

export class Monster extends Phaser.GameObjects.Container {
  /** Logical symbol queue; the visual bubble catches up when spells land. */
  queue: CastName[];
  speed: number;
  dying = false;
  palette: number;
  sprite: Phaser.GameObjects.Image;
  bubble: SymbolBubble;
  private shadow: Phaser.GameObjects.Ellipse;

  /** The question taped above this monster, when it is carrying math. */
  prompts: string[];

  constructor(scene: Phaser.Scene, x: number, y: number, symbols: CastName[], speed: number, palette: number, labels?: string[]) {
    super(scene, x, y);
    this.queue = [...symbols];
    this.prompts = labels ? [...labels] : [];
    this.speed = speed;
    this.palette = palette;
    this.shadow = scene.add.ellipse(0, 44, 50, 10, 0x281e0a, 0.14);
    this.sprite = scene.add.image(0, 0, `monster${palette}`);
    this.bubble = new SymbolBubble(scene, labels ? -92 : -78, symbols, labels);
    this.add([this.shadow, this.sprite, this.bubble]);
    this.setSize(GAME.monsterRadius * 2, GAME.monsterRadius * 2);
    scene.add.existing(this);

    // face the center
    this.sprite.setFlipX(x > scene.scale.width / 2);
    scene.tweens.add({
      targets: this.sprite,
      y: -8,
      duration: 700 + Math.random() * 300,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    this.setScale(0.2).setAlpha(0);
    scene.tweens.add({ targets: this, scale: 1, alpha: 1, duration: 350, ease: "Back.easeOut" });
  }

  get front(): CastName | undefined {
    return this.queue[0];
  }

  step(dt: number, cx: number, cy: number) {
    if (this.dying) return;
    const dx = cx - this.x;
    const dy = cy - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) return;
    const s = Math.min(d, this.speed * dt);
    this.x += (dx / d) * s;
    this.y += (dy / d) * s;
    this.setDepth(this.y);
  }

  distanceTo(x: number, y: number) {
    return Math.hypot(this.x - x, this.y - y);
  }

  flashHit() {
    this.sprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(70, () => this.sprite.clearTint());
    this.scene.tweens.add({ targets: this.sprite, scaleX: 1.25, scaleY: 0.8, duration: 70, yoyo: true });
  }
}
