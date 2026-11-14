import Phaser from "phaser";
import { onInput } from "../../input/events";
import { lobbyOpen } from "../../net/lobby";
import { FONT, HIGHLIGHTER, INK, INK_CSS, MUTED_CSS, PAPER } from "../palette";
import { sfx } from "../sfx";

type Dyn<T> = T | (() => T);
const val = <T>(d: Dyn<T>): T => (typeof d === "function" ? (d as () => T)() : d);

export type ButtonOpts = {
  x: number;
  y: number;
  w: number;
  h: number;
  label?: Dyn<string>;
  /** Small second line under the label. */
  sub?: Dyn<string>;
  /** Big character(s) above the label (subject chips). */
  glyph?: string;
  /** Pencil drawing above the label, or filling the button when there is no label. */
  icon?: (g: Phaser.GameObjects.Graphics) => void;
  fontSize?: number;
  font?: string;
  angle?: number;
  /** Highlighter fill even when not selected (the main action on a screen). */
  primary?: boolean;
  selected?: () => boolean;
  enabled?: () => boolean;
  visible?: () => boolean;
  onClick: () => void;
};

export type SliderOpts = { x: number; y: number; w: number; get: () => number; set: (v: number) => void; enabled?: () => boolean; onRelease?: () => void };
type Slider = { o: SliderOpts; g: Phaser.GameObjects.Graphics; shown: string };

type Button = {
  o: ButtonOpts;
  c: Phaser.GameObjects.Container;
  box: Phaser.GameObjects.Graphics;
  label?: Phaser.GameObjects.Text;
  sub?: Phaser.GameObjects.Text;
  shown: string;
};

type Src = "mouse" | "hand";
const HAND_STALE_MS = 400; // no hand events for this long: the hand has left the picture

// Whether each pointer is pressing right now, across scenes: a pinch or click that opened a
// screen must be let go before it can press anything on the next one.
const inkingNow: Record<Src, boolean> = { mouse: false, hand: false };
onInput((e) => {
  if (e.type === "cursor") inkingNow[e.src ?? "hand"] = e.inking;
});

/**
 * Paper buttons that work with the mouse and with a pinch at the same time. Each is its own
 * pointer: hovering highlights, and the moment a press starts on a button clicks it.
 */
export class Menu {
  private buttons: Button[] = [];
  private hover: Record<Src, Button | null> = { mouse: null, hand: null };
  private pressing: Record<Src, boolean> = { ...inkingNow };
  private sliders: Slider[] = [];
  private dragging: { s: Slider; src: Src } | null = null;
  private handSeen = 0;
  private dot: Phaser.GameObjects.Arc;

  constructor(private scene: Phaser.Scene) {
    this.buttons = [];
    // the hand's cursor; the mouse already has the system pointer
    this.dot = scene.add.circle(-100, -100, 14, 0xfffefa, 0.6).setStrokeStyle(3, INK, 0.9).setDepth(1000).setVisible(false);
    const off = onInput((e) => {
      if (e.type !== "cursor") return;
      const src: Src = e.src ?? "hand";
      if (src === "hand") {
        this.handSeen = performance.now();
        this.dot.setVisible(true).setPosition(e.p.x, e.p.y).setRadius(e.inking ? 10 : 14);
      }
      const over = (this.hover[src] = this.at(e.p.x, e.p.y));
      if (e.inking && !this.pressing[src] && !this.dragging) {
        if (over) this.click(over);
        else {
          const s = this.sliders.find((s) => (s.o.enabled?.() ?? true) && Math.abs(e.p.y - s.o.y) <= 22 && e.p.x >= s.o.x - 14 && e.p.x <= s.o.x + s.o.w + 14);
          if (s) this.dragging = { s, src };
        }
      }
      if (this.dragging?.src === src) {
        const { s } = this.dragging;
        if (e.inking) s.o.set(Math.min(1, Math.max(0, (e.p.x - s.o.x) / s.o.w)));
        else {
          this.dragging = null;
          s.o.onRelease?.();
        }
      }
      this.pressing[src] = e.inking;
    });
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, off);
  }

  add(o: ButtonOpts) {
    const scene = this.scene;
    const box = scene.add.graphics();
    const c = scene.add.container(o.x, o.y, [box]).setAngle(o.angle ?? 0);
    const b: Button = { o, c, box, shown: "" };
    const top = o.glyph || (o.icon && o.label !== undefined);
    if (o.icon) {
      const g = scene.add.graphics({ y: o.label !== undefined ? -o.h * 0.14 : 0 });
      o.icon(g);
      c.add(g);
    }
    if (o.glyph) c.add(scene.add.text(0, -o.h * 0.15, o.glyph, { fontFamily: FONT, fontSize: `${Math.round(o.h * 0.36)}px`, fontStyle: "bold", color: INK_CSS }).setOrigin(0.5).setPadding(6));
    if (o.label !== undefined) {
      const size = o.fontSize ?? 24;
      const y = top ? o.h * 0.29 : o.sub !== undefined ? -o.h * 0.13 : 0;
      b.label = scene.add.text(0, y, "", { fontFamily: o.font ?? FONT, fontSize: `${size}px`, fontStyle: o.font ? "" : "bold", color: INK_CSS }).setOrigin(0.5).setPadding(8);
      c.add(b.label);
    }
    if (o.sub !== undefined) {
      b.sub = scene.add.text(0, o.h * 0.26, "", { fontFamily: FONT, fontSize: "17px", color: MUTED_CSS }).setOrigin(0.5);
      c.add(b.sub);
    }
    this.buttons.push(b);
    this.paint(b);
    return c;
  }

  /** A 0–1 slider, x at its left end: press on it and drag (or pinch and move). */
  slider(o: SliderOpts) {
    this.sliders.push({ o, g: this.scene.add.graphics(), shown: "" });
  }

  private paintSlider(s: Slider) {
    const { o, g } = s;
    const v = o.get();
    const enabled = o.enabled?.() ?? true;
    const held = s === this.dragging?.s;
    const key = `${v.toFixed(3)}|${enabled}|${held}`;
    if (key === s.shown) return;
    s.shown = key;
    const kx = o.x + o.w * v;
    g.clear().setAlpha(enabled ? 1 : 0.4);
    // the track: a pencil line, highlighted up to the knob
    g.lineStyle(10, HIGHLIGHTER, 1);
    g.lineBetween(o.x, o.y, kx, o.y);
    g.lineStyle(3, INK, 0.8);
    g.lineBetween(o.x, o.y, o.x + o.w, o.y);
    g.fillStyle(INK, 0.35);
    g.fillCircle(kx + 2, o.y + 3, 13);
    g.fillStyle(held ? HIGHLIGHTER : PAPER, 1);
    g.fillCircle(kx, o.y, 13);
    g.lineStyle(3, INK, 1);
    g.strokeCircle(kx, o.y, 13);
  }

  private usable(b: Button) {
    return (b.o.visible?.() ?? true) && (b.o.enabled?.() ?? true);
  }

  /** The button under a point (a little generous, for a wobbly hand). */
  private at(x: number, y: number): Button | null {
    for (const b of this.buttons) {
      if (this.usable(b) && Math.abs(x - b.o.x) <= b.o.w / 2 + 6 && Math.abs(y - b.o.y) <= b.o.h / 2 + 6) return b;
    }
    return null;
  }

  private click(b: Button) {
    if (lobbyOpen()) return; // the room-code panel is on top
    sfx.hit();
    this.scene.tweens.add({ targets: b.c, scale: 1.08, duration: 80, yoyo: true });
    b.o.onClick();
  }

  private paint(b: Button) {
    const { o, box } = b;
    const visible = o.visible?.() ?? true;
    const enabled = o.enabled?.() ?? true;
    const on = o.selected?.() ?? false;
    const hover = (b === this.hover.mouse || b === this.hover.hand) && enabled;
    const label = o.label !== undefined ? val(o.label) : "";
    const sub = o.sub !== undefined ? val(o.sub) : "";
    const key = `${visible}|${enabled}|${on}|${hover}|${label}|${sub}`;
    if (key === b.shown) return;
    b.shown = key;
    b.c.setVisible(visible).setAlpha(enabled ? 1 : 0.45);
    b.label?.setText(label);
    b.sub?.setText(sub);
    const { w, h } = o;
    const r = Math.min(12, h / 4);
    box.clear();
    // offset ink shadow, then the paper card on top
    box.fillStyle(INK, on || hover ? 0.9 : 0.35);
    box.fillRoundedRect(-w / 2 + 4, -h / 2 + 5, w, h, r);
    box.fillStyle(on || o.primary ? HIGHLIGHTER : hover ? 0xfff6c2 : PAPER, 1);
    box.fillRoundedRect(-w / 2, -h / 2, w, h, r);
    box.lineStyle(on ? 4 : 2.5, INK, on || hover || o.primary ? 1 : 0.7);
    box.strokeRoundedRect(-w / 2, -h / 2, w, h, r);
    if (on && o.glyph) {
      // a tick in the corner of a picked chip
      box.lineStyle(4, INK, 1);
      box.beginPath();
      box.moveTo(w / 2 - 30, -h / 2 + 16);
      box.lineTo(w / 2 - 23, -h / 2 + 23);
      box.lineTo(w / 2 - 11, -h / 2 + 9);
      box.strokePath();
    }
  }

  /** Call every frame: repaints whatever changed (hover, selection, labels). */
  update() {
    if (this.dot.visible && performance.now() - this.handSeen > HAND_STALE_MS) {
      // the hand left: drop its cursor, hover, and anything it was holding
      this.dot.setVisible(false);
      this.hover.hand = null;
      this.pressing.hand = false;
      if (this.dragging?.src === "hand") this.dragging = null;
    }
    for (const b of this.buttons) this.paint(b);
    for (const s of this.sliders) this.paintSlider(s);
  }
}

/** A section heading with an optional quieter note after it, centred on x. */
export function heading(scene: Phaser.Scene, x: number, y: number, text: string, note = "") {
  const t = scene.add.text(0, y, text, { fontFamily: FONT, fontSize: "24px", fontStyle: "bold", color: INK_CSS }).setOrigin(0, 0.5);
  const n = scene.add.text(0, y + 2, note, { fontFamily: FONT, fontSize: "18px", color: MUTED_CSS }).setOrigin(0, 0.5);
  const total = t.width + (note ? 14 + n.width : 0);
  t.setX(x - total / 2);
  n.setX(x - total / 2 + t.width + 14);
  return { title: t, note: n };
}

/** The floor, the screen's name with a swipe of highlighter, and a Back button (also Esc). */
export function screenFrame(scene: Phaser.Scene, menu: Menu, name: string, back: () => void) {
  const W = scene.scale.width, H = scene.scale.height;
  scene.add.image(W / 2, H / 2, "floor");
  const title = scene.add.text(W / 2, 58, name, { fontFamily: '"Marker Felt", "Permanent Marker", "Patrick Hand", "Comic Sans MS", cursive', fontSize: "62px", color: INK_CSS }).setOrigin(0.5).setPadding(16).setAngle(-1.2);
  const hl = scene.add.graphics({ x: W / 2, y: 64 }).setAngle(-1.2);
  hl.fillStyle(HIGHLIGHTER, 0.85);
  hl.fillRect(-title.width / 2 - 2, -22, title.width + 4, 44);
  scene.children.moveBelow(hl, title);
  menu.add({ x: 92, y: 54, w: 124, h: 50, label: "‹ Back", fontSize: 22, angle: -1.5, onClick: back });
  scene.input.keyboard?.on("keydown-ESC", () => {
    if (!lobbyOpen()) back();
  });
}
