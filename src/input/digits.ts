// Handwritten digits for math mode. A straight stick is 1, a closed round stroke is 0,
// and the rest are $1 templates. Drawing direction does not matter.
import { densify, type XY } from "./shapes";
import { pathLength } from "./strokeDetector";
import { distanceAtBestAngle, lineCheck, normalize } from "./recognizer";

type V = [number, number];

export const DIGIT_SHAPES: Record<string, V[][]> = {
  "0": circles(),
  "1": [
    [[0.5, 0.02], [0.5, 0.98]],
    [[0.32, 0.16], [0.58, 0.02], [0.56, 0.98]],
  ],
  "2": [[[0.16, 0.3], [0.3, 0.08], [0.64, 0.04], [0.9, 0.24], [0.74, 0.46], [0.2, 0.8], [0.12, 0.98], [0.92, 0.98]]],
  "3": [[[0.16, 0.14], [0.55, 0.02], [0.86, 0.2], [0.68, 0.4], [0.4, 0.48], [0.78, 0.6], [0.9, 0.78], [0.58, 0.98], [0.18, 0.88]]],
  "4": [[[0.15, 0.58], [0.88, 0.58], [0.55, 0.06], [0.55, 0.98]]],
  "5": [[[0.84, 0.06], [0.2, 0.1], [0.16, 0.44], [0.5, 0.36], [0.86, 0.55], [0.76, 0.86], [0.4, 0.98], [0.14, 0.8]]],
  "6": [six(1), six(-1)],
  "7": [[[0.06, 0.1], [0.94, 0.06], [0.26, 0.98]]],
  "8": [eight(1), eight(-1)],
  "9": [nine(1), nine(-1)],
};

const TEMPLATES = Object.entries(DIGIT_SHAPES).flatMap(([digit, shapes]) =>
  shapes.flatMap((shape) => {
    const forward = normalize(densify(shape.map(([x, y]) => ({ x: x * 200, y: y * 200 })), 48));
    const backward = normalize(forward.slice().reverse());
    return [
      { digit, points: forward },
      { digit, points: backward },
    ];
  }),
);

const ACCEPT = 0.7;

export function recognizeDigit(raw: XY[]): { digit: string; score: number } | null {
  if (raw.length < 2) return null;
  const line = lineCheck(raw);
  if (line?.kind === "vline") return { digit: "1", score: Math.min(1, 0.5 + line.straightness / 2) };
  if (line?.kind === "hline") return null;
  if (isRoundLoop(raw)) return { digit: "0", score: 0.92 };

  const cand = normalize(raw);
  let digit = "";
  let best = Infinity;
  for (const template of TEMPLATES) {
    const distance = distanceAtBestAngle(cand, template.points, 25);
    if (distance < best) {
      best = distance;
      digit = template.digit;
    }
  }
  const score = Math.max(0, 1 - best / (0.5 * Math.hypot(250, 250)));
  if (!digit || score < ACCEPT) return null;
  return { digit, score };
}

function isRoundLoop(pts: XY[]): boolean {
  const length = pathLength(pts);
  if (length < 1) return false;
  const gap = Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) / length;
  if (gap > 0.2) return false;
  let cx = 0;
  let cy = 0;
  for (const p of pts) {
    cx += p.x;
    cy += p.y;
  }
  cx /= pts.length;
  cy /= pts.length;
  const radii = pts.map((p) => Math.hypot(p.x - cx, p.y - cy));
  const mean = radii.reduce((sum, r) => sum + r, 0) / radii.length;
  if (mean < 1) return false;
  const variance = radii.reduce((sum, r) => sum + (r - mean) ** 2, 0) / radii.length;
  return Math.sqrt(variance) / mean < 0.18;
}

function circles(): V[][] {
  const out: V[][] = [];
  for (let s = 0; s < 4; s++) {
    for (const dir of [1, -1]) {
      const start = (s / 4) * Math.PI * 2;
      const vs: V[] = [];
      for (let i = 0; i <= 36; i++) {
        const a = start + dir * (i / 36) * Math.PI * 2;
        vs.push([0.5 + 0.42 * Math.cos(a), 0.5 + 0.42 * Math.sin(a)]);
      }
      out.push(vs);
    }
  }
  return out;
}

function six(dir: number): V[] {
  const vs: V[] = [[0.74, 0.08], [0.38, 0.16], [0.22, 0.4]];
  const start = Math.PI;
  for (let i = 0; i <= 28; i++) {
    const a = start + dir * (i / 28) * Math.PI * 1.75;
    vs.push([0.5 + 0.28 * Math.cos(a), 0.68 + 0.28 * Math.sin(a)]);
  }
  return vs;
}

function nine(dir: number): V[] {
  const vs: V[] = [];
  const start = Math.PI / 2;
  for (let i = 0; i <= 28; i++) {
    const a = start + dir * (i / 28) * Math.PI * 2;
    vs.push([0.5 + 0.26 * Math.cos(a), 0.3 + 0.26 * Math.sin(a)]);
  }
  vs.push([0.64, 0.68], [0.56, 0.98]);
  return vs;
}

function eight(dir: number): V[] {
  const vs: V[] = [];
  for (let i = 0; i <= 24; i++) {
    const a = Math.PI / 2 + dir * (i / 24) * Math.PI * 2;
    vs.push([0.5 + 0.24 * Math.cos(a), 0.3 + 0.24 * Math.sin(a)]);
  }
  for (let i = 1; i <= 24; i++) {
    const a = -Math.PI / 2 + dir * (i / 24) * Math.PI * 2;
    vs.push([0.5 + 0.24 * Math.cos(a), 0.72 + 0.24 * Math.sin(a)]);
  }
  return vs;
}
