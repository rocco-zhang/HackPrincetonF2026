import Phaser from "phaser";
import { ARENA } from "../../config";
import { SYMBOLS, type SymbolName } from "../../input/events";
import { BASE_SHAPES, mulberry32 } from "../../input/shapes";
import { css, INK_CSS, MONSTER_PALETTES, PAPER_CSS, SYMBOL_COLOR } from "../palette";

type Ctx = CanvasRenderingContext2D;
type P = [number, number];

/**
 * Draws every texture procedurally — no external art.
 * Everything is paper and pencil: wobbly double-stroked lines, cut-out shapes with a drop shadow.
 */
export class Boot extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  private drawn: { key: string; canvas: HTMLCanvasElement }[] = [];
  private rnd = mulberry32(11); // seeded so the art is the same every run

  create() {
    this.makeSpark();
    this.makeStar();
    this.makeScrap();
    this.makeTape();
    this.makeFloor();
    this.makeIsland();
    this.makePlayer();
    MONSTER_PALETTES.forEach((_, i) => this.makeMonster(i));
    for (const s of SYMBOLS) this.makeSymbol(s);
    this.makeHeart("heart", true);
    this.makeHeart("heart_empty", false);

    // Register as decoded images, not canvas textures: browsers may evict
    // offscreen 2D canvases, and a WebGL context restore would then re-upload blanks.
    let pending = this.drawn.length;
    for (const { key, canvas } of this.drawn) {
      this.textures.once(`${Phaser.Textures.Events.ADD_KEY}${key}`, () => {
        if (--pending === 0) this.scene.start("Title");
      });
      this.textures.addBase64(key, canvas.toDataURL("image/png"));
    }
  }

  private canvas(key: string, w: number, h: number) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    this.drawn.push({ key, canvas });
    const ctx = canvas.getContext("2d")!;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    return ctx;
  }

  private j(amp: number) {
    return (this.rnd() - 0.5) * 2 * amp;
  }

  /** Trace a hand-drawn version of a polyline: extra points every ~9 px, each nudged a little. */
  private wobble(ctx: Ctx, pts: P[], closed = false, amp = 1) {
    const all = closed ? [...pts, pts[0]] : pts;
    ctx.beginPath();
    all.forEach(([x, y], i) => {
      if (i === 0) return ctx.moveTo(x + this.j(amp), y + this.j(amp));
      const [px, py] = all[i - 1];
      const steps = Math.max(1, Math.round(Math.hypot(x - px, y - py) / 9));
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        ctx.lineTo(px + (x - px) * t + this.j(amp), py + (y - py) * t + this.j(amp));
      }
    });
    if (closed) ctx.closePath();
  }

  /** Pencil stroke: the line drawn twice, slightly differently, like going over it again. */
  private sketch(ctx: Ctx, pts: P[], opts: { closed?: boolean; width?: number; color?: string; amp?: number; passes?: number } = {}) {
    const { closed = false, width = 2.5, color = INK_CSS, amp = 1, passes = 2 } = opts;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    for (let k = 0; k < passes; k++) {
      ctx.globalAlpha = k === 0 ? 0.95 : 0.55;
      this.wobble(ctx, pts, closed, amp);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** A cut-out piece of paper: soft drop shadow, fill, thin pencil edge. */
  private cutout(ctx: Ctx, pts: P[], fill: string, edge = "rgba(51,49,46,0.75)") {
    ctx.save();
    ctx.shadowColor = "rgba(40,30,10,0.3)";
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 3;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.restore();
    this.sketch(ctx, pts, { closed: true, width: 1.6, color: edge, amp: 0.5, passes: 1 });
  }

  private ring(cx: number, cy: number, rx: number, ry: number, n = 18): P[] {
    return Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry] as P;
    });
  }

  private dot(ctx: Ctx, x: number, y: number, r: number, color: string) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  /** Soft white dot, tinted grey for eraser dust. */
  private makeSpark() {
    const ctx = this.canvas("spark", 32, 32);
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.5, "rgba(255,255,255,0.85)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
  }

  /** Doodled star outline, tinted for spell bolts. */
  private makeStar() {
    const ctx = this.canvas("star", 36, 36);
    const pts: P[] = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? 14 : 6.5;
      pts.push([18 + Math.cos(a) * r, 18 + Math.sin(a) * r]);
    }
    this.sketch(ctx, pts, { closed: true, width: 3.2, color: "#ffffff", amp: 0.6 });
  }

  /** A torn scrap of paper, tinted for confetti. */
  private makeScrap() {
    const ctx = this.canvas("scrap", 24, 20);
    const pts: P[] = [[3, 5], [9, 2], [15, 4], [21, 3], [20, 10], [22, 16], [14, 17], [8, 15], [3, 17], [5, 10]];
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "rgba(90,85,75,0.55)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  /** A strip of masking tape with jagged ends. */
  private makeTape() {
    const ctx = this.canvas("tape", 48, 18);
    const pts: P[] = [[2, 2], [46, 2], [43, 5], [46, 8], [43, 11], [46, 16], [2, 16], [5, 12], [2, 9], [5, 6]];
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = "rgba(236,219,168,0.86)";
    ctx.fill();
    ctx.strokeStyle = "rgba(150,125,70,0.35)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  /** A plain sheet of sketchbook paper: grain, a few fibres, two fold creases. */
  private makeFloor() {
    const { width: W, height: H } = ARENA;
    const ctx = this.canvas("floor", W, H);
    // Slightly see-through so the webcam feed shows through like a faint pencil sketch.
    ctx.fillStyle = "rgba(249,245,234,0.86)";
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 14000; i++) {
      ctx.fillStyle = this.rnd() < 0.5 ? "rgba(90,70,40,0.05)" : "rgba(255,255,255,0.35)";
      ctx.fillRect(this.rnd() * W, this.rnd() * H, 1.2, 1.2);
    }
    ctx.lineWidth = 1;
    for (let i = 0; i < 320; i++) {
      const x = this.rnd() * W, y = this.rnd() * H, a = this.rnd() * Math.PI, l = 4 + this.rnd() * 10;
      ctx.strokeStyle = `rgba(110,90,55,${0.04 + this.rnd() * 0.06})`;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      ctx.stroke();
    }
    // creases where the sheet was folded in three
    for (const x of [W / 3, (2 * W) / 3]) {
      const g = ctx.createLinearGradient(x - 7, 0, x + 7, 0);
      g.addColorStop(0, "rgba(120,100,60,0)");
      g.addColorStop(0.46, "rgba(120,100,60,0.07)");
      g.addColorStop(0.54, "rgba(255,255,255,0.28)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - 7, 0, 14, H);
    }
    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.68);
    v.addColorStop(0, "rgba(120,95,55,0)");
    v.addColorStop(1, "rgba(120,95,55,0.16)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  }

  /** Pencil hatching under the stick figure's feet. (Key kept from the previous art set.) */
  private makeIsland() {
    const W = 170, H = 40;
    const ctx = this.canvas("island", W, H);
    ctx.strokeStyle = "rgba(51,49,46,0.38)";
    ctx.lineWidth = 1.6;
    for (let x = 12; x < W - 12; x += 5) {
      const half = 15 * Math.sqrt(Math.max(0, 1 - ((x - W / 2) / (W / 2 - 10)) ** 2));
      if (half < 2) continue;
      ctx.beginPath();
      ctx.moveTo(x + 4 + this.j(1.5), H / 2 - half + this.j(1.5));
      ctx.lineTo(x - 4 + this.j(1.5), H / 2 + half + this.j(1.5));
      ctx.stroke();
    }
  }

  /** You: a stick figure holding a pencil. */
  private makePlayer() {
    const W = 120, H = 132;
    const ctx = this.canvas("player", W, H);
    const cx = W / 2;
    const w = 4.2;
    // pencil in the raised hand
    ctx.save();
    ctx.translate(cx + 30, 44);
    ctx.rotate(0.55);
    ctx.fillStyle = "#f4c531";
    ctx.fillRect(-4, -26, 8, 24);
    ctx.fillStyle = "#f08a9b";
    ctx.fillRect(-4, -2, 8, 6);
    ctx.fillStyle = "#e9d3a6";
    ctx.beginPath();
    ctx.moveTo(-4, -26);
    ctx.lineTo(0, -36);
    ctx.lineTo(4, -26);
    ctx.closePath();
    ctx.fill();
    this.sketch(ctx, [[-4, 4], [-4, -26], [0, -36], [4, -26], [4, 4]], { closed: true, width: 1.8, amp: 0.3, passes: 1 });
    this.dot(ctx, 0, -34.5, 1.6, INK_CSS);
    ctx.restore();
    // body, legs, arms
    this.sketch(ctx, [[cx, 48], [cx + 1, 88]], { width: w });
    this.sketch(ctx, [[cx + 1, 88], [cx - 15, 121], [cx - 23, 122]], { width: w });
    this.sketch(ctx, [[cx + 1, 88], [cx + 16, 121], [cx + 24, 122]], { width: w });
    this.sketch(ctx, [[cx, 61], [cx - 22, 79]], { width: w });
    this.sketch(ctx, [[cx, 61], [cx + 27, 45]], { width: w });
    // head, filled with paper so anything behind doesn't show through the face
    const head = this.ring(cx, 29, 18, 18.5, 20);
    ctx.beginPath();
    head.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = PAPER_CSS;
    ctx.fill();
    this.sketch(ctx, head, { closed: true, width: w, amp: 0.9 });
    // three hairs
    this.sketch(ctx, [[cx - 5, 12], [cx - 9, 3]], { width: 2.4, passes: 1 });
    this.sketch(ctx, [[cx, 11], [cx + 1, 1]], { width: 2.4, passes: 1 });
    this.sketch(ctx, [[cx + 5, 12], [cx + 10, 4]], { width: 2.4, passes: 1 });
    // face
    this.dot(ctx, cx - 6.5, 26, 2.4, INK_CSS);
    this.dot(ctx, cx + 6.5, 26, 2.4, INK_CSS);
    ctx.beginPath();
    ctx.arc(cx, 31, 6.5, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.strokeStyle = INK_CSS;
    ctx.lineWidth = 2.4;
    ctx.stroke();
  }

  /** Doodled monster face: angry brows, dot eyes, a zigzag of teeth. */
  private face(ctx: Ctx, cx: number, cy: number, color: string, opts: { bigEye?: boolean } = {}) {
    const rL = 3.4, rR = opts.bigEye ? 5.6 : 3.4;
    if (opts.bigEye) {
      this.dot(ctx, cx + 10, cy, rR + 2.4, "#ffffff");
      this.sketch(ctx, this.ring(cx + 10, cy, rR + 2.4, rR + 2.4, 12), { closed: true, width: 1.8, color, amp: 0.4, passes: 1 });
    }
    this.dot(ctx, cx - 10, cy, rL, color);
    this.dot(ctx, cx + 10, cy, opts.bigEye ? 3 : rR, color);
    this.sketch(ctx, [[cx - 17, cy - 10], [cx - 5, cy - 5]], { width: 2.6, color, amp: 0.4 });
    this.sketch(ctx, [[cx + 18, cy - 11 - (opts.bigEye ? 3 : 0)], [cx + 5, cy - 5 - (opts.bigEye ? 3 : 0)]], { width: 2.6, color, amp: 0.4 });
    const my = cy + 13;
    this.sketch(ctx, [[cx - 12, my - 2], [cx - 8, my + 4], [cx - 4, my - 2], [cx, my + 4], [cx + 4, my - 2], [cx + 8, my + 4], [cx + 12, my - 2]], { width: 2.2, color, amp: 0.3, passes: 1 });
  }

  private stickLegs(ctx: Ctx, cx: number, top: number) {
    this.sketch(ctx, [[cx - 10, top], [cx - 12, 88], [cx - 19, 89]], { width: 2.8 });
    this.sketch(ctx, [[cx + 10, top], [cx + 12, 88], [cx + 19, 89]], { width: 2.8 });
  }

  private makeMonster(i: number) {
    const W = 84, H = 96;
    const ctx = this.canvas(`monster${i}`, W, H);
    const cx = W / 2;

    if (i === 0) {
      // a crumpled ball of paper
      this.stickLegs(ctx, cx, 70);
      const radii = [30, 27, 31, 26, 30, 28, 32, 27, 29, 31, 26, 30, 28, 31];
      const pts: P[] = radii.map((r, k) => {
        const a = (k / radii.length) * Math.PI * 2 + 0.2;
        return [cx + Math.cos(a) * r, 46 + Math.sin(a) * r * 0.93];
      });
      this.cutout(ctx, pts, "#fdfcf6");
      // facets and creases
      for (const [a, b, c] of [[0, 2, 5], [6, 8, 11], [3, 4, 9], [10, 12, 1]]) {
        ctx.beginPath();
        ctx.moveTo(...pts[a]);
        ctx.lineTo(...pts[b]);
        ctx.lineTo(cx + this.j(8), 46 + this.j(8));
        ctx.lineTo(...pts[c]);
        ctx.closePath();
        ctx.fillStyle = "rgba(70,60,40,0.07)";
        ctx.fill();
      }
      for (const k of [1, 4, 7, 9, 12]) {
        this.sketch(ctx, [pts[k], [cx + this.j(12), 46 + this.j(12)]], { width: 1.2, color: "rgba(51,49,46,0.4)", amp: 0.8, passes: 1 });
      }
      this.face(ctx, cx, 42, INK_CSS);
    } else if (i === 1) {
      // a torn page of lined notebook paper
      this.sketch(ctx, [[16, 44], [6, 56], [3, 50]], { width: 2.8 });
      this.sketch(ctx, [[68, 44], [78, 56], [81, 50]], { width: 2.8 });
      const pts: P[] = [[15, 10], [68, 8], [70, 74], [63, 84], [56, 75], [49, 86], [42, 76], [35, 85], [28, 75], [21, 84], [14, 76]];
      this.cutout(ctx, pts, "#fffefa");
      ctx.save();
      ctx.beginPath();
      pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.clip();
      ctx.strokeStyle = "#9fc0ea";
      ctx.lineWidth = 1.3;
      for (let y = 22; y < 86; y += 9) {
        ctx.beginPath();
        ctx.moveTo(10, y);
        ctx.lineTo(74, y - 1);
        ctx.stroke();
      }
      ctx.strokeStyle = "#e88d8d";
      ctx.beginPath();
      ctx.moveTo(25, 4);
      ctx.lineTo(24, 90);
      ctx.stroke();
      ctx.restore();
      for (const y of [20, 44, 66]) {
        this.dot(ctx, 19.5, y, 2.4, "#d9d2c0");
      }
      this.face(ctx, cx + 4, 40, "#2b4fb0");
    } else {
      // a sticky note with a curled corner
      this.stickLegs(ctx, cx, 72);
      ctx.save();
      ctx.translate(cx, 44);
      ctx.rotate(-0.07);
      const s = 29;
      this.cutout(ctx, [[-s, -s], [s, -s], [s, s - 13], [s - 13, s], [-s, s]], "#ffe66b", "rgba(120,100,20,0.6)");
      // the curl
      ctx.beginPath();
      ctx.moveTo(s, s - 13);
      ctx.lineTo(s - 13, s);
      ctx.lineTo(s - 12, s - 12);
      ctx.closePath();
      ctx.fillStyle = "#e3c843";
      ctx.fill();
      ctx.strokeStyle = "rgba(120,100,20,0.6)";
      ctx.lineWidth = 1.4;
      ctx.stroke();
      // sticky strip
      ctx.fillStyle = "rgba(190,160,20,0.16)";
      ctx.fillRect(-s, -s, s * 2, 10);
      this.face(ctx, -1, -3, INK_CSS, { bigEye: true });
      ctx.restore();
    }
  }

  /** Symbols are felt-tip marker strokes. */
  private makeSymbol(name: SymbolName) {
    const S = 64, pad = 13;
    const ctx = this.canvas(`sym_${name}`, S, S);
    const pts: P[] =
      name === "circle"
        ? [...this.ring(S / 2, S / 2, S / 2 - pad, S / 2 - pad, 22), [S / 2 + (S / 2 - pad), S / 2 + 3]]
        : BASE_SHAPES[name][0].map(([x, y]) => [pad + x * (S - 2 * pad), pad + y * (S - 2 * pad)] as P);
    this.sketch(ctx, pts, { width: 7.5, color: css(SYMBOL_COLOR[name]), amp: 0.7 });
  }

  /** Hearts are drawn in red pen and coloured in with hatching. */
  private makeHeart(key: string, filled: boolean) {
    const S = 40;
    const ctx = this.canvas(key, S, S);
    const heart = () => {
      ctx.beginPath();
      ctx.moveTo(20, 33);
      ctx.bezierCurveTo(4, 22, 4, 8, 13, 8);
      ctx.bezierCurveTo(17, 8, 20, 11, 20, 14);
      ctx.bezierCurveTo(20, 11, 23, 8, 27, 8);
      ctx.bezierCurveTo(36, 8, 36, 22, 20, 33);
      ctx.closePath();
    };
    if (filled) {
      ctx.save();
      heart();
      ctx.clip();
      ctx.strokeStyle = "#d7372f";
      ctx.lineWidth = 2.2;
      for (let x = -30; x < 50; x += 4.5) {
        ctx.beginPath();
        ctx.moveTo(x + this.j(1), 40);
        ctx.lineTo(x + 30 + this.j(1), 0);
        ctx.stroke();
      }
      ctx.restore();
    }
    heart();
    ctx.strokeStyle = filled ? "#d7372f" : "rgba(51,49,46,0.4)";
    ctx.lineWidth = filled ? 2.8 : 2.2;
    ctx.stroke();
  }
}
