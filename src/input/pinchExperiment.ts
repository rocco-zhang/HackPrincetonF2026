import { ARENA, INPUT } from "../config";
import type { Landmark } from "../state";
import { emit, type InputEvent, type Pt } from "./events";
import { OneEuro2D } from "./oneEuro";
import { PinchGate, StrokeDetector } from "./strokeDetector";
import type { RecogResult } from "./recognizer";

import { experiment } from "./pinchConfig";
export { experiment, type Variant } from "./pinchConfig";
export type Observation = { t: number; landmarks: Landmark[] | null; world: Landmark[] | null; width: number; height: number };

/** Same normalized signal for live segmentation and explicit calibration. No 2D fallback in 3D mode. */
export function calibrationRatio(o: Observation): number | null {
  const points=experiment.use3d?o.world:o.landmarks;
  if(!o.landmarks || !points)return null;
  const d=(a:number,b:number)=>experiment.use3d
    ?Math.hypot(points[a].x-points[b].x,points[a].y-points[b].y,points[a].z-points[b].z)
    :Math.hypot((points[a].x-points[b].x)*o.width,(points[a].y-points[b].y)*o.height);
  const size=d(0,9);return size>0?d(4,8)/size:null;
}
export function calibratePinch(closed: number[], open: number[]) {
  const q = (a: number[], p: number) => [...a].sort((a, b) => a - b)[Math.floor((a.length - 1) * p)];
  if (closed.length < 20 || open.length < 20 || [...closed, ...open].some(x => !Number.isFinite(x))) return false;
  const c = q(closed, .9), o = q(open, .1);
  if (o - c < .18) return false;
  const on = Math.max(.12, Math.min(.45, c + (o - c) * .25));
  const off = Math.max(on + .12, Math.min(.85, c + (o - c) * .65));
  if (c >= on || o <= off) return false;
  experiment.on = on; experiment.off = off;
  return true;
}

type Sample = { p: Pt; raw: Pt; ratio: number; ratio3: number | null };
export class PinchExperiment {
  private gate = new PinchGate();
  private filter = new OneEuro2D(INPUT.euroMinCutoff, INPUT.euroBeta, INPUT.euroDCutoff);
  private detector: StrokeDetector;
  private history: Sample[] = [];
  private points: Sample[] = [];
  private since: number | null = null;
  private evidenceFrames = 0;
  private evidence: "closed" | "open" | "lost" | null = null;
  private lastT = -Infinity;
  private consumed = -Infinity;
  private lastP: Pt | null = null;
  private key = "";
  private speedPoint: {x:number;y:number;t:number;size:number} | null = null;
  normalizedSpeed: number | null = null;
  effectiveOff = INPUT.pinchOff;
  effectiveTrend = INPUT.pinchOn + .1;
  gateReason = "Waiting for observations";
  inking = false;
  ratio: number | null = null;
  ratio3: number | null = null;
  rawRatio: number | null = null;
  distancePx: number | null = null;
  handSizePx: number | null = null;
  phase = "hover";
  decision = "";
  components: { shape: number; pinch: number; adjustment: number; total: number }[] = [];
  preview: RecogResult | null = null;
  constructor(private send: (e: InputEvent) => void = emit,
    private recognize?: (p: Pt[]) => RecogResult) {
    this.detector = new StrokeDetector(INPUT.handTrimPoints, send);
  }
  reset() {
    this.speedPoint = null; this.normalizedSpeed = null; this.gateReason = "Waiting for observations";
    this.gate.reset(); this.filter.reset(); this.history = []; this.points = [];
    // Discard unfinished input when switching variants; never turn a configuration change into a cast.
    this.detector = new StrokeDetector(INPUT.handTrimPoints, this.send);
    this.inking = false; this.evidenceFrames = 0; this.since = null; this.evidence = null; this.lastP = null;
    this.lastT = -Infinity; this.consumed = -Infinity; this.preview = null; this.phase = "hover";
  }
  process(o: Observation, mirror: boolean, box: typeof INPUT.drawBox) {
    const key = JSON.stringify(experiment) + JSON.stringify(box) + mirror;
    if (key !== this.key) { this.reset(); this.key = key; }
    if (o.t <= this.lastT) return;
    const gap = o.t - this.lastT;
    this.lastT = o.t;
    const lm = o.landmarks;
    const dist = (a: Landmark, b: Landmark) => Math.hypot((a.x-b.x)*o.width, (a.y-b.y)*o.height);
    const d3 = (a: Landmark, b: Landmark) => Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
    const size = lm ? dist(lm[0],lm[9]) : 0;
    this.distancePx = lm ? dist(lm[4],lm[8]) : null;
    this.handSizePx = lm && size > 0 ? size : null;
    this.rawRatio = this.distancePx !== null && size > 0 ? this.distancePx/size : null;
    const w = o.world, s3 = w ? d3(w[0],w[9]) : 0;
    this.ratio3 = w && s3 > 0 ? d3(w[4],w[8])/s3 : null;
    this.ratio = experiment.use3d ? (lm ? this.ratio3 : null) : this.rawRatio;
    if (!experiment.use3d && experiment.depthVeto && this.ratio !== null && this.ratio3 !== null && this.ratio3 > INPUT.pinch3dMax) this.ratio = Math.max(this.ratio,this.ratio3);
    const variant = experiment.variant, control = variant === "A", buffered = variant === "E" || variant === "F";
    let sample: Sample | null = null;
    if (lm) {
      const a = experiment.anchor === "knuckle" ? lm[5] : experiment.anchor === "tip" ? lm[8] : experiment.anchor === "thumb" ? lm[4] : {x:(lm[4].x+lm[8].x)/2,y:(lm[4].y+lm[8].y)/2};
      const previousSpeedPoint=this.speedPoint;
      const speedPoint={x:a.x*o.width,y:a.y*o.height,t:o.t,size};
      if(previousSpeedPoint && gap<=200 && size>0 && previousSpeedPoint.size>0){
        const speed=Math.hypot(speedPoint.x-previousSpeedPoint.x,speedPoint.y-previousSpeedPoint.y)/((size+previousSpeedPoint.size)/2)/(gap/1000);
        const alpha=1-Math.exp(-gap/80);
        this.normalizedSpeed=this.normalizedSpeed===null?speed:this.normalizedSpeed+alpha*(speed-this.normalizedSpeed);
      }else this.normalizedSpeed=null;
      this.speedPoint=speedPoint;
      const nx = mirror ? 1-a.x : a.x;
      const raw = {x: Math.max(0,Math.min(1,(nx-box.x0)/(box.x1-box.x0)))*ARENA.width,
        y: Math.max(0,Math.min(1,(a.y-box.y0)/(box.y1-box.y0)))*ARENA.height,t:o.t};
      const p = {...this.filter.filter(raw.x,raw.y,o.t/1000),t:o.t};
      sample = {p,raw,ratio:this.ratio ?? Infinity,ratio3:this.ratio3}; this.lastP = p;
    }
    if(!sample){this.speedPoint=null;this.normalizedSpeed=null;}
    if (control || variant === "B") {
      this.effectiveOff=INPUT.pinchOff;
      this.gate.isolateLossEvidence = !control;
      this.gate.releaseMs = control ? INPUT.releaseMs : experiment.releaseMs;
      this.inking = this.gate.update(this.ratio,o.t);
      if (!this.inking) this.detector.finish(this.gate.releasedAt);
      if (sample) { this.send({type:"cursor",p:sample.p,inking:this.inking}); this.detector.update(sample.p,this.inking); }
      else if (this.inking && this.lastP) this.detector.update(this.lastP,true);
    } else {
      const on = experiment.on;
      // Speed in hand lengths/second, smoothed over 80 ms; fixed bounded assistance only at release.
      const adjustment=experiment.speedAssist && this.normalizedSpeed!==null ? experiment.speedAssistRange*(2*Math.min(1,this.normalizedSpeed/2)-1) : 0;
      const off = Math.max(on+.10,Math.min(.85,experiment.off+adjustment));
      this.effectiveOff=off;
      this.effectiveTrend=Math.max(on+.1,on+.1+adjustment);
      if (gap > 200) {
        if (this.inking) this.finish(this.lastP?.t ?? o.t, "frame gap");
        this.since = null; this.evidenceFrames = 0; this.evidence = null; this.history = []; this.filter.reset();
      }
      const previous = this.history.at(-1);
      // Buffered variants allow a rising, partial opening to propose a boundary.
      const opening = this.ratio !== null && (this.ratio > off || (buffered && this.ratio > this.effectiveTrend && ((!!previous && this.ratio-previous.ratio > .06) || this.evidence === "open")));
      const evidence = this.ratio === null ? "lost" : this.inking ? opening ? "open" : null : this.ratio < on ? "closed" : null;
      if (evidence !== this.evidence) { this.since = evidence ? o.t : null; this.evidence = evidence; this.evidenceFrames = 0; }
      this.evidenceFrames = evidence ? this.evidenceFrames + 1 : 0;
      const elapsed = this.since === null ? 0 : o.t-this.since;
      if (!this.inking && evidence === "closed" && (experiment.timing === "frames" ? this.evidenceFrames >= experiment.startFrames : elapsed >= experiment.startMs) && sample) {
        this.inking = true;
        const prefix = buffered ? this.history.filter(s => s.p.t > this.consumed && s.p.t >= this.since! - experiment.prefixMs && s.ratio < off) : [];
        this.points = [...prefix];
        this.send({type:"strokeStart",p:prefix[0]?.p ?? sample.p});
        for (const s of prefix.slice(1)) this.send({type:"strokePoint",p:s.p});
        this.decision = buffered ? `confirmed start; recovered ${prefix.length} samples` : "confirmed timed start";
        this.since = null; this.evidence = null;
      }
      if (this.inking && ((evidence === "open" && (experiment.timing === "frames" ? this.evidenceFrames >= experiment.endFrames : elapsed >= experiment.releaseMs)) || (evidence === "lost" && elapsed >= experiment.lostHandMs))) {
        this.finish(this.since!, evidence === "lost" ? "tracking loss" : "observed opening");
        this.since = null; this.evidence = null;
      }
      if (sample) {
        this.send({type:"cursor",p:sample.p,inking:this.inking});
        if (this.inking) { this.points.push(sample); this.send({type:"strokePoint",p:sample.p}); }
      }
      if (this.inking && this.recognize && this.points.length >= INPUT.minStrokePoints && o.t % 120 < 40) this.preview = this.recognize(this.points.map(s=>s.p));
    }
    if (sample) this.history.push(sample);
    this.history = this.history.filter(s=>s.p.t >= o.t-experiment.historyMs);
    this.phase = this.inking ? this.evidence === "open" ? "release pending" : this.evidence === "lost" ? "tracking lost (grace)" : "drawing" : this.evidence === "closed" ? "tentative" : "hover";
    const on=control||variant==="B"?INPUT.pinchOn:experiment.on;
    const progress=experiment.timing==="frames"?`${this.evidenceFrames}/${experiment.startFrames} frames`:`${Math.round(this.since===null?0:o.t-this.since)}/${experiment.startMs} ms`;
    this.gateReason=this.ratio===null?(experiment.use3d && lm ? "3D landmarks unavailable: closing evidence unavailable (no 2D fallback)" : "No tracked hand: closing evidence unavailable"):this.inking?this.evidence==="open"?"Opening detected: waiting for End confirmation":"Pinch confirmed: drawing":!experiment.use3d && experiment.depthVeto && this.rawRatio!==null && this.rawRatio<on && this.ratio>=on?`3D depth veto: raw 2D is closed, effective ratio ${this.ratio.toFixed(3)} is not below ${on.toFixed(3)}`:this.ratio<on?`Start pending: ${progress} of consecutive closing evidence`:`Waiting: effective ratio ${this.ratio.toFixed(3)} must be strictly below ${on.toFixed(3)} (noise above it resets confirmation)`;

  }
  private finish(end: number, reason: string) {
    let samples = this.points.filter(s=>s.p.t <= end && s.p.t > this.consumed);
    this.components = [];
    if (experiment.variant === "F" && this.recognize && samples.length >= 8) {
      let best = -Infinity, chosen = samples;
      // Only nearby closed-hand samples may be excluded, never arbitrary interior windows.
      for (const start of [0,1,2]) for (const tail of [0,1,2]) {
        const candidate = samples.slice(start, tail ? -tail : undefined);
        if (candidate.length < 8 || (candidate[0].p.t-samples[0].p.t)>80 || (samples.at(-1)!.p.t-candidate.at(-1)!.p.t)>80) continue;
        const r = this.recognize(candidate.map(s=>s.p));
        const shape = r.accepted ? r.score : 0;
        const pinch = candidate.filter(s=>s.ratio < INPUT.pinchOff).length/candidate.length;
        const adjustment = .025*(start+tail);
        const total = shape + .15*pinch-adjustment;
        this.components.push({shape,pinch,adjustment,total});
        if (total > best) {best=total; chosen=candidate;}
      }
      samples = chosen;
    }
    this.consumed = this.lastT;
    this.inking = false; this.points = []; this.preview = null;
    this.decision = `${reason}; end ${Math.round(end)}ms; commit ${Math.round(this.lastT)}ms`;
    let points = samples.map(s=>s.p);
    if (experiment.variant !== "E" && experiment.variant !== "F" && points.length > INPUT.handTrimPoints*2+INPUT.minStrokePoints) points = points.slice(INPUT.handTrimPoints,-INPUT.handTrimPoints);
    this.send({type:"strokeEnd",points});
  }
}
