// Turns MediaPipe's 21 image landmarks into the 63 numbers the ASL classifier works on.
// The same maths is in scripts/asl/train.py (feats); the two must stay in step.

export type Lm = { x: number; y: number; z: number };

// wrist → each knuckle, and knuckle → knuckle: the rigid part of the hand, used as its size
const PALM: [number, number][] = [[0, 5], [0, 9], [0, 13], [0, 17], [5, 9], [9, 13], [13, 17]];

/**
 * `lm` = image landmarks (x, y normalized to the frame, z relative to the wrist on x's scale).
 * `aspect` = frame width / height.
 * Result: wrist at the origin, one unit = the hand's palm size, and mirrored if needed so a left
 * hand and a mirrored camera both look like the same hand. Rotation is kept on purpose:
 * which way the hand points is part of some letters (G and H point sideways, P and Q down).
 */
export function aslFeatures(lm: Lm[], aspect: number): number[] {
  const p = lm.map((q) => ({ x: (q.x - lm[0].x) * aspect, y: q.y - lm[0].y, z: (q.z - lm[0].z) * aspect }));
  let size = 0;
  for (const [a, b] of PALM) size += Math.hypot(p[a].x - p[b].x, p[a].y - p[b].y, p[a].z - p[b].z);
  size = size / PALM.length || 1;
  const flip = p[5].x * p[17].y - p[5].y * p[17].x < 0 ? -1 : 1;
  const out: number[] = [];
  for (const q of p) out.push((q.x * flip) / size, q.y / size, q.z / size);
  return out;
}

/** The same hand turned in the image plane by `deg` (about the wrist). */
export function rotateFeatures(f: number[], deg: number): number[] {
  const c = Math.cos((deg * Math.PI) / 180), s = Math.sin((deg * Math.PI) / 180);
  const out = f.slice();
  for (let i = 0; i < f.length; i += 3) {
    out[i] = f[i] * c - f[i + 1] * s;
    out[i + 1] = f[i] * s + f[i + 1] * c;
  }
  return out;
}

/** Typical per-landmark distance between two hands, in palm sizes. */
export function featureDistance(a: number[], b: number[]): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += (a[i] - b[i]) ** 2;
  return Math.sqrt(d / (a.length / 3));
}
