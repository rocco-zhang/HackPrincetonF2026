import { INPUT } from "../config";
import { experiment } from "./pinchConfig";
import { emit, type InputEvent, type Pt } from "./events";

export function pathLength(pts: { x: number; y: number }[]) {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return d;
}

/** Turns an inking on/off signal plus cursor positions into strokeStart/Point/End events. */
export class StrokeDetector {
  private points: Pt[] = [];
  private active = false;

  constructor(
    private trim = 0,
    private send: (e: InputEvent) => void = emit,
  ) {}

  get isActive() {
    return this.active;
  }

  update(p: Pt, inking: boolean) {
    if (inking && !this.active) {
      this.active = true;
      this.points = [p];
      this.send({ type: "strokeStart", p });
    } else if (inking && this.active) {
      const last = this.points[this.points.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) < 0.5) return;
      this.points.push(p);
      this.send({ type: "strokePoint", p });
    } else if (!inking && this.active) {
      this.finish();
    }
  }

  /** End the stroke. `cutoffT` drops points drawn after that time (the start of a debounced release). */
  finish(cutoffT?: number | null) {
    if (!this.active) return;
    this.active = false;
    let pts = this.points;
    this.points = [];
    if (cutoffT != null) {
      const kept = pts.filter((p) => p.t <= cutoffT);
      if (kept.length >= 2) pts = kept;
    }
    const rawPoints=pts;
    if (this.trim > 0 && pts.length > this.trim * 2 + INPUT.minStrokePoints) {
      pts = pts.slice(this.trim, pts.length - this.trim);
    }
    this.send({ type: "strokeEnd", points: pts, rawPoints });
  }
}

export function isStrokeTooSmall(pts: { x: number; y: number }[]) {
  return pts.length < 2 || (experiment.minStrokePointsEnabled && pts.length < INPUT.minStrokePoints) || (experiment.minStrokeLengthEnabled && pathLength(pts) < INPUT.minStrokeLength);
}
