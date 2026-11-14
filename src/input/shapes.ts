// Ideal symbol shapes (unit square, y pointing down) and a jittered generator.
// Used to seed the recognizer so it works before anyone records real templates,
// and by the tests to synthesize strokes.
import type { SymbolName } from "./events";

export type XY = { x: number; y: number };
type V = [number, number];

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rev = (vs: V[]) => [...vs].reverse();

const V_SHAPE: V[] = [[0, 0], [0.5, 1], [1, 0]];
const CARET: V[] = [[0, 1], [0.5, 0], [1, 1]];
const ZIG_M: V[] = [[0, 1], [0.25, 0], [0.5, 1], [0.75, 0], [1, 1]];
const ZIG_W: V[] = [[0, 0], [0.25, 1], [0.5, 0], [0.75, 1], [1, 0]];
const ZIG_N: V[] = [[0, 1], [1 / 3, 0], [2 / 3, 1], [1, 0]];
const ZIG_U: V[] = [[0, 0], [1 / 3, 1], [2 / 3, 0], [1, 1]];

/** Base polylines per symbol, covering both drawing directions. */
export const BASE_SHAPES: Record<SymbolName, V[][]> = {
  hline: [[[0, 0.5], [1, 0.5]], [[1, 0.5], [0, 0.5]]],
  vline: [[[0.5, 0], [0.5, 1]], [[0.5, 1], [0.5, 0]]],
  v: [V_SHAPE, rev(V_SHAPE)],
  caret: [CARET, rev(CARET)],
  zigzag: [ZIG_M, rev(ZIG_M), ZIG_W, rev(ZIG_W), ZIG_N, rev(ZIG_N), ZIG_U, rev(ZIG_U)],
  circle: circleVariants(),
};

function circleVariants(): V[][] {
  const out: V[][] = [];
  for (let s = 0; s < 8; s++) {
    for (const dir of [1, -1]) {
      const start = (s / 8) * Math.PI * 2;
      const vs: V[] = [];
      const steps = 40;
      for (let i = 0; i <= steps; i++) {
        const a = start + dir * (i / steps) * Math.PI * 2;
        vs.push([0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)]);
      }
      out.push(vs);
    }
  }
  return out;
}

/** Evenly densify a polyline into ~n points. */
export function densify(vs: XY[], n = 48): XY[] {
  let total = 0;
  for (let i = 1; i < vs.length; i++) total += Math.hypot(vs[i].x - vs[i - 1].x, vs[i].y - vs[i - 1].y);
  const step = total / (n - 1);
  const out: XY[] = [vs[0]];
  let acc = 0;
  for (let i = 1; i < vs.length; i++) {
    const a = vs[i - 1];
    const b = vs[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    let d = step - acc;
    while (d <= seg) {
      const r = d / seg;
      out.push({ x: a.x + (b.x - a.x) * r, y: a.y + (b.y - a.y) * r });
      d += step;
    }
    acc = seg - (d - step);
  }
  if (out.length < n) out.push(vs[vs.length - 1]);
  return out;
}

export type JitterOpts = {
  size?: number; // output size in px
  scaleJitter?: number;
  rotJitterDeg?: number;
  vertexJitter?: number;
  pointNoise?: number;
  points?: number;
};

/** A jittered stroke for a base polyline, scaled into pixel space (origin 0,0). */
export function jitteredStroke(base: V[], rand: () => number, o: JitterOpts = {}): XY[] {
  const size = o.size ?? 200;
  const sj = o.scaleJitter ?? 0.2;
  const rj = ((o.rotJitterDeg ?? 6) * Math.PI) / 180;
  const vj = o.vertexJitter ?? 0.05;
  const pn = o.pointNoise ?? 0.01;
  const r = () => rand() * 2 - 1;
  const sx = 1 + r() * sj;
  const sy = 1 + r() * sj;
  const rot = r() * rj;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const verts = base.map(([x, y]) => {
    const jx = (x - 0.5 + r() * vj) * sx;
    const jy = (y - 0.5 + r() * vj) * sy;
    return { x: jx * cos - jy * sin, y: jx * sin + jy * cos };
  });
  return densify(verts, o.points ?? 48).map((p) => ({
    x: (p.x + r() * pn + 0.5) * size,
    y: (p.y + r() * pn + 0.5) * size,
  }));
}

/** Synthetic seed templates: `perShape` jittered copies of every base shape (lines excluded). */
export function syntheticTemplates(seed = 1337, perShape = 3): Partial<Record<SymbolName, XY[][]>> {
  const rand = mulberry32(seed);
  const out: Partial<Record<SymbolName, XY[][]>> = {};
  for (const name of Object.keys(BASE_SHAPES) as SymbolName[]) {
    if (name === "hline" || name === "vline") continue;
    const list: XY[][] = [];
    const per = name === "circle" ? 1 : perShape;
    for (const base of BASE_SHAPES[name]) {
      list.push(densify(base.map(([x, y]) => ({ x: x * 200, y: y * 200 })), 48));
      for (let i = 0; i < per; i++) list.push(jitteredStroke(base, rand));
    }
    out[name] = list;
  }
  return out;
}
