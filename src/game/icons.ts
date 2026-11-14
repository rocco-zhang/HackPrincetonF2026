// Small pencil drawings for buttons, drawn around (0, 0).
import type Phaser from "phaser";
import { ACCENT, INK, SYMBOL_COLOR } from "./palette";

type G = Phaser.GameObjects.Graphics;

/** Two people, one a little behind the other. */
export function friendsIcon(g: G) {
  g.lineStyle(3, INK, 1);
  g.strokeCircle(9, -9, 6);
  g.beginPath();
  g.arc(9, 15, 12, Math.PI * 1.08, Math.PI * 1.92);
  g.strokePath();
  g.fillStyle(0xfffefa, 1);
  g.fillCircle(-6, -6, 8);
  g.strokeCircle(-6, -6, 8);
  g.beginPath();
  g.arc(-6, 20, 15, Math.PI * 1.08, Math.PI * 1.92);
  g.strokePath();
}

/** A trophy cup. */
export function trophyIcon(g: G) {
  g.lineStyle(3, INK, 1);
  g.fillStyle(0xffe95c, 1);
  g.beginPath();
  g.moveTo(-11, -16);
  g.lineTo(11, -16);
  g.lineTo(9, -2);
  g.arc(0, -2, 9, 0, Math.PI);
  g.lineTo(-11, -16);
  g.closePath();
  g.fillPath();
  g.strokePath();
  // handles
  g.beginPath();
  g.arc(-11, -8, 6, Math.PI * 0.5, Math.PI * 1.5);
  g.strokePath();
  g.beginPath();
  g.arc(11, -8, 6, Math.PI * 1.5, Math.PI * 0.5);
  g.strokePath();
  // stem and base
  g.lineBetween(0, 7, 0, 14);
  g.lineBetween(-9, 16, 9, 16);
}

/** A cog. */
export function gearIcon(g: G) {
  g.lineStyle(5, INK, 1);
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 + 0.2;
    g.lineBetween(Math.cos(a) * 11, Math.sin(a) * 11, Math.cos(a) * 17, Math.sin(a) * 17);
  }
  g.lineStyle(3, INK, 1);
  g.strokeCircle(0, 0, 11);
  g.strokeCircle(0, 0, 4);
}

/** Thumb and index finger meeting, with the line they have just drawn. */
export function pinchIcon(g: G) {
  // the drawn line
  g.lineStyle(6, SYMBOL_COLOR.zigzag, 1);
  g.beginPath();
  g.moveTo(-70, 10);
  g.lineTo(-48, -22);
  g.lineTo(-30, 12);
  g.lineTo(-8, -14);
  g.strokePath();
  // index finger and thumb, meeting at the end of the line
  g.lineStyle(13, INK, 1);
  g.lineBetween(-4, -12, 34, -40);
  g.lineBetween(-2, -6, 30, 22);
  g.lineStyle(8, 0xfffefa, 1);
  g.lineBetween(-4, -12, 34, -40);
  g.lineBetween(-2, -6, 30, 22);
  // the back of the hand
  g.lineStyle(3, INK, 1);
  g.beginPath();
  g.arc(44, -8, 34, Math.PI * 0.72, Math.PI * 1.28, true);
  g.strokePath();
  g.fillStyle(ACCENT, 1);
  g.fillCircle(-6, -10, 5);
}

/** A right-pointing pencil arrow between steps. */
export function arrowIcon(g: G) {
  g.lineStyle(3, INK, 0.6);
  g.lineBetween(-22, 0, 20, 0);
  g.beginPath();
  g.moveTo(10, -9);
  g.lineTo(21, 0);
  g.lineTo(10, 9);
  g.strokePath();
}
