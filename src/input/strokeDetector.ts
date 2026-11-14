import { INPUT } from "../config";
import { emit, type InputEvent, type Pt } from "./events";

/** Pinch on/off with hysteresis + frame debounce. `ratio` is null when no hand is visible. */
export class PinchGate {
  inking = false;
  private streak = 0;

  constructor(
    public onRatio = INPUT.pinchOn,
    public offRatio = INPUT.pinchOff,
    public framesToStart = INPUT.framesToStart,
    public framesToStop = INPUT.framesToStop,
  ) {}

  update(ratio: number | null): boolean {
    const wantsChange = this.inking
      ? ratio === null || ratio > this.offRatio
      : ratio !== null && ratio < this.onRatio;
    if (wantsChange) {
      this.streak++;
      if (this.streak >= (this.inking ? this.framesToStop : this.framesToStart)) {
        this.inking = !this.inking;
        this.streak = 0;
      }
    } else {
      this.streak = 0;
    }
    return this.inking;
  }

  reset() {
    this.inking = false;
    this.streak = 0;
  }
}

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

  finish() {
    if (!this.active) return;
    this.active = false;
    let pts = this.points;
    this.points = [];
    if (this.trim > 0 && pts.length > this.trim * 2 + INPUT.minStrokePoints) {
      pts = pts.slice(this.trim, pts.length - this.trim);
    }
    this.send({ type: "strokeEnd", points: pts });
  }
}

export function isStrokeTooSmall(pts: { x: number; y: number }[]) {
  return pts.length < INPUT.minStrokePoints || pathLength(pts) < INPUT.minStrokeLength;
}
