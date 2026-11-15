import { lineCheck } from "./recognizer";
import type { XY } from "./shapes";

/** How far a recognized line or circle is eased. The ends stay on the raw stroke. */
const NUDGE = 0.35;

/**
 * Ease a stroke toward a horizontal line, a vertical line, or a closed circle.
 * Open shapes such as a V are returned unchanged. Language mode skips this entirely.
 */
export function beautify(pts: XY[]): XY[] {
  if (pts.length < 8) return pts;
  const line = lineCheck(pts);
  if (line?.kind === "hline" || line?.kind === "vline") return nudge(pts, lineTarget(pts, line.kind));
  if (!isClosed(pts)) return pts;
  const round = circleTarget(pts);
  return round ? nudge(pts, round) : pts;
}

function nudge(raw: XY[], ideal: XY[]): XY[] {
  return raw.map((p, i) => {
    if (i === 0 || i === raw.length - 1) return { x: p.x, y: p.y };
    const q = ideal[i];
    return { x: p.x + (q.x - p.x) * NUDGE, y: p.y + (q.y - p.y) * NUDGE };
  });
}

function lineTarget(pts: XY[], kind: "hline" | "vline"): XY[] {
  if (kind === "hline") {
    const y = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    return pts.map((p) => ({ x: p.x, y }));
  }
  const x = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  return pts.map((p) => ({ x, y: p.y }));
}

/** A V or a U ends far apart. Only a loop that comes back to its start can be a circle. */
function isClosed(pts: XY[]): boolean {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const span = Math.max(maxX - minX, maxY - minY, 1);
  const end = pts[pts.length - 1];
  return Math.hypot(pts[0].x - end.x, pts[0].y - end.y) < span * 0.28;
}

function circleTarget(pts: XY[]): XY[] | null {
  const fit = fitCircle(pts);
  if (!fit || fit.err > 0.16 || fit.r < 24 || fit.r > 520) return null;
  if (sweptAngle(pts, fit) < Math.PI * 1.65) return null;
  return pts.map((p) => {
    const a = Math.atan2(p.y - fit.cy, p.x - fit.cx);
    return { x: fit.cx + Math.cos(a) * fit.r, y: fit.cy + Math.sin(a) * fit.r };
  });
}

function fitCircle(pts: XY[]): { cx: number; cy: number; r: number; err: number } | null {
  let mx = 0, my = 0;
  for (const p of pts) {
    mx += p.x;
    my += p.y;
  }
  mx /= pts.length;
  my /= pts.length;
  let sxx = 0, syy = 0, sxy = 0, sx = 0, sy = 0, sz = 0, sxz = 0, syz = 0;
  for (const p of pts) {
    const x = p.x - mx;
    const y = p.y - my;
    const z = x * x + y * y;
    sx += x;
    sy += y;
    sz += z;
    sxx += x * x;
    syy += y * y;
    sxy += x * y;
    sxz += x * z;
    syz += y * z;
  }
  const sol = solve3(
    [sxx, sxy, sx, sxy, syy, sy, sx, sy, pts.length],
    [sxz, syz, sz],
  );
  if (!sol) return null;
  const [d, e, f] = sol;
  const cx = mx + d / 2;
  const cy = my + e / 2;
  const r2 = (d * d + e * e) / 4 + f;
  if (r2 <= 1) return null;
  const r = Math.sqrt(r2);
  let err = 0;
  for (const p of pts) err += Math.abs(Math.hypot(p.x - cx, p.y - cy) - r);
  return { cx, cy, r, err: err / (pts.length * r) };
}

function sweptAngle(pts: XY[], c: { cx: number; cy: number }) {
  let prev = Math.atan2(pts[0].y - c.cy, pts[0].x - c.cx);
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = Math.atan2(pts[i].y - c.cy, pts[i].x - c.cx);
    let d = a - prev;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    total += d;
    prev = a;
  }
  return Math.abs(total);
}

/** Cramer's rule for a 3×3 system stored row-major. */
function solve3(m: number[], b: number[]): [number, number, number] | null {
  const det = det3(m);
  if (Math.abs(det) < 1e-6) return null;
  const dx = det3([b[0], m[1], m[2], b[1], m[4], m[5], b[2], m[7], m[8]]);
  const dy = det3([m[0], b[0], m[2], m[3], b[1], m[5], m[6], b[2], m[8]]);
  const dz = det3([m[0], m[1], b[0], m[3], m[4], b[1], m[6], m[7], b[2]]);
  return [dx / det, dy / det, dz / det];
}

function det3(m: number[]) {
  return m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
}
