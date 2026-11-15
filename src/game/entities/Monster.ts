import Phaser from "phaser";
import { cardScale } from "../../a11y";
import { ARENA, GAME } from "../../config";
import type { CastName } from "../../input/events";
import { BOSS } from "../bosses";
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

  /** A boss: bigger, slower, with a long row of cards. Spells only chip at it. */
  boss: boolean;
  private bubbleY = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, symbols: CastName[], speed: number, palette: number, labels?: string[], boss = false) {
    super(scene, x, y);
    this.queue = [...symbols];
    this.prompts = labels ? [...labels] : [];
    this.speed = speed;
    this.palette = palette;
    this.boss = boss;
    const big = boss ? BOSS.scale : 1;
    this.shadow = scene.add.ellipse(0, 44 * big, 50 * big, 10 * big, 0x281e0a, 0.14);
    this.sprite = scene.add.image(0, 0, `monster${palette}`).setScale(big);
    // bigger cards (accessibility setting) grow upwards, away from the monster
    const s = cardScale();
    this.bubbleY = (labels ? -92 : -78) * big - (s - 1) * 34;
    this.bubble = new SymbolBubble(scene, this.bubbleY, symbols, labels).setScale(s);
    this.add([this.shadow, this.sprite, this.bubble]);
    this.setSize(GAME.monsterRadius * 2, GAME.monsterRadius * 2);
    scene.add.existing(this);

    // face the center
    this.sprite.setFlipX(x > ARENA.width / 2);
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
    if (this.boss) this.keepCardsInView();
  }

  /** A boss's long row of cards stays readable while the boss itself is still at the edge of the page. */
  private keepCardsInView() {
    const half = (this.bubble.rowWidth * this.bubble.scaleX) / 2 + 12;
    const top = 64 * this.bubble.scaleY; // room for the card and its tape, under the HUD
    this.bubble.x = Phaser.Math.Clamp(this.x, half, ARENA.width - half) - this.x;
    this.bubble.y = Math.max(this.y + this.bubbleY, 78 + top) - this.y;
  }

  distanceTo(x: number, y: number) {
    return Math.hypot(this.x - x, this.y - y);
  }

  flashHit() {
    this.sprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(70, () => this.sprite.clearTint());
    const big = this.boss ? BOSS.scale : 1;
    this.scene.tweens.add({ targets: this.sprite, scaleX: 1.25 * big, scaleY: 0.8 * big, duration: 70, yoyo: true });
  }
}
