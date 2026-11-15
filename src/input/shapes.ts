// Ideal symbol shapes (unit square, y pointing down) and a jittered generator.
// Used to seed the recognizer so it works before anyone records real templates,
// and by the tests to synthesize strokes.
import type { LangShape, StrokeName, SymbolName } from "./events";

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

// Letter strokes for the language subjects, in the direction they are written (and reversed, for
// anyone who draws them the other way round).
const GIYEOK: V[] = [[0, 0], [1, 0], [1, 1]]; // ㄱ: across, then down
const GIYEOK_SLANT: V[] = [[0, 0], [1, 0], [0.7, 1]]; // …with the downstroke leaning in, as in 가
const NIEUN: V[] = [[0, 0], [0, 1], [1, 1]]; // ㄴ: down, then across
const KU: V[] = [[1, 0], [0, 0.5], [1, 1]]; // く: an angle pointing left
const SHI: V[] = [[0.15, 0], [0.15, 0.62], [0.24, 0.88], [0.5, 1], [0.8, 0.93], [1, 0.7]]; // し: down, then a hook up to the right

export const LANG_BASE_SHAPES: Record<LangShape, V[][]> = {
  giyeok: [GIYEOK, rev(GIYEOK), GIYEOK_SLANT, rev(GIYEOK_SLANT)],
  nieun: [NIEUN, rev(NIEUN)],
  ku: [KU, rev(KU)],
  shi: [SHI, rev(SHI)],
  no: [[[0.55, 0.08], [0.42, 0.40], [0.15, 0.80], [0.04, 0.65], [0.06, 0.37], [0.28, 0.16], [0.60, 0.12], [0.88, 0.30], [0.98, 0.60], [0.84, 0.86], [0.58, 0.98]]],
  he: [[[0, 0.65], [0.36, 0.2], [0.62, 0.42], [1, 0.72]]],
  tsu: [[[0.05, 0.2], [0.45, 0.1], [0.8, 0.1], [1, 0.3], [0.92, 0.58], [0.65, 0.82], [0.22, 1]]],
  so: [[[0.15, 0], [0.8, 0.03], [0.3, 0.35], [1, 0.28], [0.55, 0.53], [0.4, 0.75], [0.55, 0.94], [0.9, 1]]],
  te: [[[0, 0.1], [0.9, 0], [0.55, 0.25], [0.35, 0.55], [0.4, 0.82], [0.65, 1], [0.95, 1]]],
  hi: [[[0, 0.22], [0.26, 0.1], [0.18, 0.55], [0.23, 0.86], [0.45, 1], [0.7, 0.9], [0.78, 0.6], [0.73, 0.08], [0.85, 0.35], [1, 0.5]]],
  ro: [[[0.08, 0.05], [0.85, 0], [0.25, 0.52], [0.55, 0.4], [0.85, 0.48], [1, 0.72], [0.85, 0.94], [0.5, 1], [0.15, 0.92]]],
  ru: [[[0.08, 0.05], [0.85, 0], [0.25, 0.52], [0.55, 0.4], [0.85, 0.48], [1, 0.72], [0.8, 1], [0.5, 0.98], [0.35, 0.82], [0.45, 0.7], [0.63, 0.78], [0.65, 0.98]]],
  n: [[[0.65, 0], [0.1, 1], [0.4, 0.5], [0.58, 0.48], [0.62, 0.9], [0.78, 1], [1, 0.7]]],
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
export function syntheticTemplates(seed = 1337, perShape = 3): Partial<Record<StrokeName, XY[][]>> {
  const rand = mulberry32(seed);
  const out: Partial<Record<StrokeName, XY[][]>> = {};
  const all: Record<StrokeName, V[][]> = { ...BASE_SHAPES, ...LANG_BASE_SHAPES };
  for (const name of Object.keys(all) as StrokeName[]) {
    if (name === "hline" || name === "vline") continue;
    const list: XY[][] = [];
    const per = name === "circle" ? 1 : perShape;
    for (const base of all[name]) {
      list.push(densify(base.map(([x, y]) => ({ x: x * 200, y: y * 200 })), 48));
      for (let i = 0; i < per; i++) list.push(jitteredStroke(base, rand));
    }
    out[name] = list;
  }
  return out;
}
