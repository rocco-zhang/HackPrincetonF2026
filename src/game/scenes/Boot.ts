import Phaser from "phaser";
import { ARENA } from "../../config";
import { SYMBOLS, type SymbolName } from "../../input/events";
import { BASE_SHAPES } from "../../input/shapes";
import { css, MONSTER_PALETTES, SYMBOL_COLOR } from "../palette";

/** Draws every texture procedurally — no external art. */
export class Boot extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  private drawn: { key: string; canvas: HTMLCanvasElement }[] = [];

  create() {
    this.makeSpark();
    this.makeGlow();
    this.makeFloor();
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
    return canvas.getContext("2d")!;
  }

  private makeSpark() {
    const ctx = this.canvas("spark", 32, 32);
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.3, "rgba(255,255,255,0.8)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
  }

  private makeGlow() {
    const ctx = this.canvas("glow", 256, 256);
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, "rgba(255,255,255,0.9)");
    g.addColorStop(0.25, "rgba(255,255,255,0.35)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  }

  private makeFloor() {
    const { width: W, height: H } = ARENA;
    const ctx = this.canvas("floor", W, H);
    const g = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.62);
    g.addColorStop(0, "rgba(60,30,110,0.35)");
    g.addColorStop(0.5, "rgba(14,8,32,0.55)");
    g.addColorStop(1, "rgba(3,2,10,0.92)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // faint rune rings
    ctx.strokeStyle = "rgba(180,150,255,0.10)";
    ctx.lineWidth = 2;
    for (const r of [140, 260, 400]) {
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    for (let i = 0; i < 90; i++) {
      ctx.globalAlpha = Math.random() * 0.4;
      ctx.fillRect(Math.random() * W, Math.random() * H, 1.5, 1.5);
    }
  }

  private makePlayer() {
    const S = 112;
    const ctx = this.canvas("player", S, S);
    const c = S / 2;
    const g = ctx.createRadialGradient(c, c - 6, 2, c, c, 40);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.35, "#ffe9a8");
    g.addColorStop(0.7, "#ffb43b");
    g.addColorStop(1, "rgba(255,120,40,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c, c, 40, 0, Math.PI * 2);
    ctx.fill();
    // four-point star
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? 30 : 7;
      ctx.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  }

  private makeMonster(i: number) {
    const p = MONSTER_PALETTES[i];
    const W = 84, H = 96;
    const ctx = this.canvas(`monster${i}`, W, H);
    const cx = W / 2;
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(cx - 30, 44);
      ctx.arc(cx, 44, 30, Math.PI, 0);
      ctx.lineTo(cx + 30, 80);
      for (let k = 0; k < 4; k++) {
        const x0 = cx + 30 - k * 15;
        ctx.quadraticCurveTo(x0 - 7.5, k % 2 ? 72 : 90, x0 - 15, 80);
      }
      ctx.closePath();
    };
    ctx.shadowColor = p.rim;
    ctx.shadowBlur = 12;
    const g = ctx.createLinearGradient(0, 14, 0, 90);
    g.addColorStop(0, p.body[0]);
    g.addColorStop(1, p.body[1]);
    ctx.fillStyle = g;
    path();
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = p.rim;
    path();
    ctx.stroke();
    // eyes
    ctx.shadowColor = p.eye;
    ctx.shadowBlur = 14;
    ctx.fillStyle = p.eye;
    for (const ex of [cx - 11, cx + 11]) {
      ctx.beginPath();
      ctx.ellipse(ex, 46, 5, 8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ffffff";
    for (const ex of [cx - 11, cx + 11]) {
      ctx.beginPath();
      ctx.arc(ex - 1.5, 43, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private makeSymbol(name: SymbolName) {
    const S = 64, pad = 13;
    const ctx = this.canvas(`sym_${name}`, S, S);
    const color = css(SYMBOL_COLOR[name]);
    const tracePath = () => {
      ctx.beginPath();
      if (name === "circle") {
        ctx.arc(S / 2, S / 2, S / 2 - pad, 0, Math.PI * 2);
        return;
      }
      const shape = name === "zigzag" ? BASE_SHAPES.zigzag[0] : BASE_SHAPES[name][0];
      shape.forEach(([x, y], i) => {
        const px = pad + x * (S - 2 * pad);
        const py = pad + y * (S - 2 * pad);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
    };
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.strokeStyle = color;
    ctx.lineWidth = 7;
    tracePath();
    ctx.stroke();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 2.5;
    tracePath();
    ctx.stroke();
  }

  private makeHeart(key: string, filled: boolean) {
    const S = 40;
    const ctx = this.canvas(key, S, S);
    ctx.beginPath();
    ctx.moveTo(20, 33);
    ctx.bezierCurveTo(4, 22, 4, 8, 13, 8);
    ctx.bezierCurveTo(17, 8, 20, 11, 20, 14);
    ctx.bezierCurveTo(20, 11, 23, 8, 27, 8);
    ctx.bezierCurveTo(36, 8, 36, 22, 20, 33);
    ctx.closePath();
    if (filled) {
      ctx.shadowColor = "#ff3b6b";
      ctx.shadowBlur = 10;
      ctx.fillStyle = "#ff4d79";
      ctx.fill();
    } else {
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}
