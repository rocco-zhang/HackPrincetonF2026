// $1 Unistroke Recognizer (Wobbrock, Wilson & Li, 2007), adapted:
//  1. Orientation-sensitive: no rotate-to-indicative-angle, only a small
//     golden-section search within ±RECOG.rotationTolerance, so | ≠ — and V ≠ Λ.
//  2. Straight lines are classified by angle before $1, since $1's
//     scale-to-square blows up the noise of a 1D stroke.
import { RECOG } from "../config";
import { experiment } from "./pinchConfig";
import { STROKES, SYMBOLS, type StrokeName } from "./events";
import { syntheticTemplates, type XY } from "./shapes";
import { isStrokeTooSmall, pathLength } from "./strokeDetector";

export const N = 64;
const SIZE = 250;
const HALF_DIAG = 0.5 * Math.hypot(SIZE, SIZE);
const PHI = 0.5 * (-1 + Math.sqrt(5));
const MIN_ASPECT = 0.25;

export type RecogResult = {
  name: StrokeName | null;
  score: number;
  accepted: boolean;
  method: "tooSmall" | "line" | "diagonal" | "dollar";
  best?: { name: StrokeName; score: number };
  resampled: XY[]; // normalized candidate (for the debug overlay)
};

export function resample(pts: XY[], n = N): XY[] {
  const src = pts.map((p) => ({ x: p.x, y: p.y }));
  const I = pathLength(src) / (n - 1);
  if (I === 0) return Array.from({ length: n }, () => ({ ...src[0] }));
  let D = 0;
  const out: XY[] = [{ ...src[0] }];
  for (let i = 1; i < src.length; i++) {
    const a = src[i - 1];
    const b = src[i];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (D + d >= I && d > 0) {
      const t = (I - D) / d;
      const q = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
      out.push(q);
      src.splice(i, 0, q);
      D = 0;
    } else {
      D += d;
    }
  }
  while (out.length < n) out.push({ ...src[src.length - 1] });
  return out.slice(0, n);
}

function centroid(pts: XY[]): XY {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  return { x: x / pts.length, y: y / pts.length };
}

function bbox(pts: XY[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x0, y0, w: x1 - x0, h: y1 - y0 };
}

function scaleToSquare(pts: XY[]): XY[] {
  const b = bbox(pts);
  const m = Math.max(b.w, b.h, 1e-6);
  const w = Math.max(b.w, m * MIN_ASPECT);
  const h = Math.max(b.h, m * MIN_ASPECT);
  return pts.map((p) => ({ x: (p.x * SIZE) / w, y: (p.y * SIZE) / h }));
}

function translateToOrigin(pts: XY[]): XY[] {
  const c = centroid(pts);
  return pts.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
}

export function normalize(pts: XY[]): XY[] {
  return translateToOrigin(scaleToSquare(resample(pts)));
}

function rotateBy(pts: XY[], rad: number): XY[] {
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return pts.map((p) => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos }));
}

function pathDistance(a: XY[], b: XY[]) {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y);
  return d / a.length;
}

export function distanceAtBestAngle(pts: XY[], tmpl: XY[], tolDeg: number) {
  let a = (-tolDeg * Math.PI) / 180;
  let b = -a;
  const threshold = (2 * Math.PI) / 180;
  let x1 = PHI * a + (1 - PHI) * b;
  let f1 = pathDistance(rotateBy(pts, x1), tmpl);
  let x2 = (1 - PHI) * a + PHI * b;
  let f2 = pathDistance(rotateBy(pts, x2), tmpl);
  while (Math.abs(b - a) > threshold) {
    if (f1 < f2) {
      b = x2;
      x2 = x1;
      f2 = f1;
      x1 = PHI * a + (1 - PHI) * b;
      f1 = pathDistance(rotateBy(pts, x1), tmpl);
    } else {
      a = x1;
      x1 = x2;
      f1 = f2;
      x2 = (1 - PHI) * a + PHI * b;
      f2 = pathDistance(rotateBy(pts, x2), tmpl);
    }
  }
  return Math.min(f1, f2, pathDistance(pts, tmpl));
}

export type LineMetrics = { straightness:number; thinness:number; angle:number };

/** Measure the exact geometric checks, including when they fail. */
export function measureLine(pts: XY[]): LineMetrics | null {
  if(pts.length<2)return null;
  // coarse resample so per-frame jitter doesn't inflate the path length
  const L = pathLength(resample(pts, 12));
  if (L === 0) return null;
  const first = pts[0];
  const last = pts[pts.length - 1];
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const straightness = Math.hypot(dx, dy) / L;

  const c = centroid(pts);
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of pts) {
    const ux = p.x - c.x;
    const uy = p.y - c.y;
    sxx += ux * ux;
    syy += uy * uy;
    sxy += ux * uy;
  }
  const tr = sxx + syy;
  const det = sxx * syy - sxy * sxy;
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const l1 = tr / 2 + disc;
  const l2 = Math.max(0, tr / 2 - disc);
  if (l1 <= 0) return null;
  const thinness=Math.sqrt(l2/l1);

  const angle = (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI; // 0 = horizontal, 90 = vertical
  return {straightness,thinness,angle};
}

/** Straight-line check: high chord/path ratio and a thin principal-axis spread. */
export function lineCheck(
  pts: XY[], wanted: readonly StrokeName[] = [],
): { kind: "hline" | "vline" | "diagonal"; straightness: number } | null {
  const metrics=measureLine(pts);
  if(!metrics || metrics.straightness<experiment.lineStraightness || metrics.thinness>experiment.lineThinness)return null;
  const {straightness,angle}=metrics;
  // A slanted line is ambiguous on its own, but not when only one of dash / pillar is needed.
  const wantH = wanted.includes("hline");
  const wantV = wanted.includes("vline");
  const tolH = wantH && !wantV ? experiment.lineAngleToleranceWanted : wantH && wantV ? 45 : experiment.lineAngleTolerance;
  const tolV = wantV && !wantH ? experiment.lineAngleToleranceWanted : wantH && wantV ? 45 : experiment.lineAngleTolerance;
  const kind = angle <= tolH ? "hline" : angle >= 90 - tolV ? "vline" : "diagonal";
  return { kind, straightness };
}

type Template = { name: StrokeName; points: XY[]; source: "synthetic" | "recorded" };

export class Recognizer {
  templates: Template[] = [];

  addTemplate(name: StrokeName, raw: XY[], source: Template["source"] = "recorded") {
    if (raw.length < 2) return;
    this.templates.push({ name, points: normalize(raw), source });
  }

  addMany(set: Partial<Record<string, XY[][]>>, source: Template["source"] = "recorded") {
    for (const [name, strokes] of Object.entries(set)) {
      if (!STROKES.includes(name as StrokeName) || !strokes) continue;
      for (const s of strokes) this.addTemplate(name as StrokeName, s, source);
    }
  }

  count(name: StrokeName, source?: Template["source"]) {
    return this.templates.filter((t) => t.name === name && (!source || t.source === source)).length;
  }

  /**
   * `wanted` = symbols that would hit something right now. They are tried first with a
   * lower bar (experiment.wantedRecognitionThreshold); if none fits, the stroke is matched against everything.
   * `only` = the strokes that can be the answer at all: the six spell symbols by default, or the
   * marks one language uses, so a letter is never mistaken for a shape that language doesn't have.
   */
  recognize(raw: XY[], wanted: readonly StrokeName[] = [], accept = experiment.recognitionThreshold, only: readonly StrokeName[] = SYMBOLS): RecogResult {
    if (raw.length < 2 || isStrokeTooSmall(raw)) {
      return { name: null, score: 0, accepted: false, method: "tooSmall", resampled: [] };
    }
    const line = lineCheck(raw, wanted);
    if (line) {
      const resampled = resample(raw);
      if (line.kind === "diagonal") {
        return { name: null, score: 0, accepted: false, method: "diagonal", resampled };
      }
      if (!only.includes(line.kind)) return { name: null, score: 0, accepted: false, method: "line", resampled };
      const score = Math.min(1, 0.5 + line.straightness / 2);
      return { name: line.kind, score, accepted: true, method: "line", best: { name: line.kind, score }, resampled };
    }

    const cand = normalize(raw);
    const bestD = new Map<StrokeName, number>();
    for (const t of this.templates) {
      if (!only.includes(t.name)) continue;
      const d = distanceAtBestAngle(cand, t.points, RECOG.rotationTolerance);
      if (d < (bestD.get(t.name) ?? Infinity)) bestD.set(t.name, d);
    }
    const pick = (names: Iterable<StrokeName>) => {
      let name: StrokeName | null = null;
      let d = Infinity;
      for (const n of names) {
        const dn = bestD.get(n);
        if (dn !== undefined && dn < d) [name, d] = [n, dn];
      }
      return { name, score: Math.max(0, 1 - d / HALF_DIAG) };
    };
    const w = pick(wanted);
    const overall = pick(bestD.keys());
    if (w.name && w.score >= experiment.wantedRecognitionThreshold && w.score >= overall.score - RECOG.wantedMargin) {
      return { name: w.name, score: w.score, accepted: true, method: "dollar", best: { name: w.name, score: w.score }, resampled: cand };
    }
    const { name: bestName, score } = overall;
    if (!bestName) return { name: null, score: 0, accepted: false, method: "dollar", resampled: cand };
    const accepted = score >= accept;
    return {
      name: accepted ? bestName : null,
      score,
      accepted,
      method: "dollar",
      best: { name: bestName, score },
      resampled: cand,
    };
  }
}

export function createDefaultRecognizer(recorded: Partial<Record<string, XY[][]>>[] = []) {
  const r = new Recognizer();
  r.addMany(syntheticTemplates(), "synthetic");
  for (const set of recorded) r.addMany(set, "recorded");
  return r;
}
