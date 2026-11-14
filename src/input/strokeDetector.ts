import { INPUT } from "../config";
import { experiment } from "./pinchConfig";
import { emit, type InputEvent, type Pt } from "./events";

/**
 * Pinch on/off with hysteresis + frame debounce. `ratio` is null when no hand is visible.
 * When `now` (ms) is passed, a release must also last `releaseMs` (`lostHandMs` if the hand
 * vanished) before inking stops; `releasedAt` is then when that release began.
 */
export class PinchGate {
  inking = false;
  releasedAt: number | null = null;
  private streak = 0;
  private since: number | null = null;
  /** Experiments may distinguish observed opening from missing-hand evidence. Control stays unchanged. */
  isolateLossEvidence = false;
  private lastEvidence: "lost" | "observed" | null = null;

  constructor(
    public onRatio = INPUT.pinchOn,
    public offRatio = INPUT.pinchOff,
    public framesToStart = INPUT.framesToStart,
    public framesToStop = INPUT.framesToStop,
    public releaseMs = INPUT.releaseMs,
    public lostHandMs = INPUT.lostHandMs,
  ) {}

  update(ratio: number | null, now?: number): boolean {
    const evidence = ratio === null ? "lost" : "observed";
    if (this.isolateLossEvidence && this.inking && evidence !== this.lastEvidence) {
      this.streak = 0;
      this.since = null;
    }
    this.lastEvidence = evidence;
    const wantsChange = this.inking
      ? ratio === null || ratio > this.offRatio
      : ratio !== null && ratio < this.onRatio;
    if (!wantsChange) {
      this.streak = 0;
      this.since = null;
      return this.inking;
    }
    this.streak++;
    if (this.since === null) this.since = now ?? null;
    if (this.inking) {
      const waited = now === undefined || this.since === null ? Infinity : now - this.since;
      if (this.streak >= this.framesToStop && waited >= (ratio === null ? this.lostHandMs : this.releaseMs)) {
        this.inking = false;
        this.releasedAt = this.since;
        this.streak = 0;
        this.since = null;
      }
    } else if (this.streak >= this.framesToStart) {
      this.inking = true;
      this.releasedAt = null;
      this.streak = 0;
      this.since = null;
    }
    return this.inking;
  }

  reset() {
    this.inking = false;
    this.releasedAt = null;
    this.streak = 0;
    this.since = null;
    this.lastEvidence = null;
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
    if (this.trim > 0 && pts.length > this.trim * 2 + INPUT.minStrokePoints) {
      pts = pts.slice(this.trim, pts.length - this.trim);
    }
    this.send({ type: "strokeEnd", points: pts });
  }
}

export function isStrokeTooSmall(pts: { x: number; y: number }[]) {
  return pts.length < 2 || (experiment.minStrokePointsEnabled && pts.length < INPUT.minStrokePoints) || (experiment.minStrokeLengthEnabled && pathLength(pts) < INPUT.minStrokeLength);
}
