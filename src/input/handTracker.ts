// One MediaPipe GestureRecognizer pass supplies landmarks plus the thumbs-up score.
import { FilesetResolver, GestureRecognizer } from "@mediapipe/tasks-vision";
import { ARENA, INPUT } from "../config";
import { state, type Landmark } from "../state";
import { video } from "./camera";
import { aslFeatures } from "../asl/features";
import { AslCaster, AslClassifier } from "../asl/hand";
import { aslName, emit, type InputEvent } from "./events";
import { drawingHandId } from "./hands";
import { experiment, PinchExperiment, type Observation } from "./pinchExperiment";
import { recognizer } from "./castPipeline";
import { GestureGate } from "./gestureGate";

const submitGates = [new GestureGate(), new GestureGate()];
const gestureGates=[new GestureGate(),new GestureGate()];
let starterHeldHand: number | null = null;

const ASSET_BASE = import.meta.env.DEV ? "/" : import.meta.env.BASE_URL;
const LOCAL_WASM = `${ASSET_BASE}mediapipe/wasm`;
const LOCAL_MODEL = `${ASSET_BASE}models/gesture_recognizer.task`;
const CDN_WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm";
const CDN_MODEL =
  "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task";

let landmarker: GestureRecognizer | null = null;
function withHand(hand: number, e: InputEvent): InputEvent {
  if (e.type === "cursor" || e.type === "strokeStart" || e.type === "strokePoint" || e.type === "strokeEnd") return { ...e, hand };
  return e;
}
export const pinchEngine = new PinchExperiment((e) => emit(withHand(0, e)), (p) => recognizer.recognize(p));
const otherEngine = new PinchExperiment((e) => emit(withHand(1, e)), (p) => recognizer.recognize(p));
let diagnosticHand: 0 | 1 = 0;
export function pinchDiagnostics() { return {hand:diagnosticHand,engine:diagnosticHand === 0 ? pinchEngine : otherEngine}; }
/** The lab preview, sampling and metrics must refer to the same visible hand. */
export function observeHands(primary: Observation, secondary: Observation) {
  diagnosticHand = primary.landmarks ? 0 : secondary.landmarks ? 1 : diagnosticHand;
  pinchEngine.observe(primary); otherEngine.observe(secondary);
  const selected = diagnosticHand === 0 ? primary : secondary;
  state.landmarks = selected.landmarks;
  state.handVisible = !!selected.landmarks;
  state.pinchRatio = pinchDiagnostics().engine.ratio;
  state.pinchRatio3d = pinchDiagnostics().engine.ratio3;
  for (const listener of observationListeners) listener(selected);
}
export let replaying = false;
export const observationListeners = new Set<(o: Observation) => void>();
export let inferenceMs = 0;
export function setReplaying(value: boolean) { replaying = value; cancelHandStroke();submitGates.forEach(g=>g.reset());gestureGates.forEach(g=>g.reset());starterHeldHand=null;state.thumbUpHolding=false; }
export function processObservation(o: Observation) {
  diagnosticHand = 0;
  pinchEngine.observe(o);
  state.landmarks = o.landmarks;
  state.handVisible = !!o.landmarks;
  if(replaying && stepLanguageSubmit([o.loveScore??0,0],o.t))return;
  if(replaying && stepThumbsUp([o.thumbUpScore??0,0],o.t))return;
  pinchEngine.process(o, state.mirror, state.drawBox);
  state.pinchRatio = pinchEngine.ratio;
  state.pinchRatio3d = pinchEngine.ratio3;
  state.inking = pinchEngine.inking;
}
const aslCaster = new AslCaster();
/** Trained model + your recorded examples (main.ts loads those into it). */
export const aslClassifier = new AslClassifier();
let lastVideoTime = -1;
let frames = 0;
let fpsStart = performance.now();
let calib: { until: number; pts: { x: number; y: number }[]; done?: (ok: boolean) => void } | null = null;

/** Gesture evidence reserves input before the hold completes, so it cannot also cast an ASL letter. */
function stepThumbsUp(scores: readonly number[], now: number): boolean {
  const wasHolding=state.thumbUpHolding;
  state.thumbUpScore=Math.max(...scores);
  const enabled=state.mode==="hand" && state.spellGesturesEnabled && !calib;
  let triggeredHand=-1;
  gestureGates.forEach((gate,hand)=>{
    const fired=gate.update(enabled?scores[hand]??0:0,now,experiment.thumbUpThreshold,experiment.thumbUpHoldMs);
    if(fired && triggeredHand<0)triggeredHand=hand;
  });
  state.thumbUpProgress=Math.max(...gestureGates.map(g=>g.progress));
  if(!enabled || (starterHeldHand!==null && !gestureGates[starterHeldHand].holding))starterHeldHand=null;
  // Only the original starter hold survives into casting. After release, later gesture
  // classifications cannot cancel the spell's strokes or be substituted for its ASL letters.
  state.thumbUpHolding=enabled && (state.spellCastingActive?starterHeldHand!==null:gestureGates.some(g=>g.holding));
  if(!state.thumbUpHolding)return false;
  cancelHandStroke();resetAslHold();
  if(!wasHolding){emit({type:"strokeCancel",hand:0});emit({type:"strokeCancel",hand:1});}
  state.aslLetter=null;state.aslFeat=null;state.aslConfidence=0;
  if(triggeredHand>=0 && !state.spellCastingActive){
    starterHeldHand=triggeredHand;
    emit({type:"spellGesture",name:"thumbs_up",score:scores[triggeredHand],hand:triggeredHand});
  }
  return true;
}

/** Reserve the submit pose so it cannot also become a drawn stroke. */
function stepLanguageSubmit(scores: readonly number[], now: number): boolean {
  const enabled = state.mode === "hand" && state.langActive && !calib;
  let held = false;
  let triggeredHand = -1;
  submitGates.forEach((gate, hand) => {
    const fired = gate.update(enabled ? scores[hand] ?? 0 : 0, now, experiment.thumbUpThreshold, experiment.thumbUpHoldMs);
    if (gate.holding) held = true;
    if (fired && triggeredHand < 0) triggeredHand = hand;
  });
  if (held) {
    pinchEngine.finishForSubmission();
    otherEngine.finishForSubmission();
    cancelHandStroke();
    emit({ type: "strokeCancel", hand: 0 });
    emit({ type: "strokeCancel", hand: 1 });
  }
  if (triggeredHand >= 0) emit({ type: "languageSubmit", hand: triggeredHand });
  return held;
}

/** True if `url` is served as a real file (Vite's dev server answers missing files with index.html). */
async function hasFile(url: string) {
  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.ok && !(res.headers.get("content-type") ?? "").includes("text/html");
  } catch {
    return false;
  }
}

let trackerLoading: Promise<void> | null = null;

export function initHandTracker(): Promise<void> {
  if (landmarker) return Promise.resolve();
  if (!trackerLoading) {
    trackerLoading = loadHandTracker().catch(err => {
      trackerLoading = null;
      throw err;
    });
  }
  return trackerLoading;
}

async function loadHandTracker() {
  const local = (await hasFile(`${LOCAL_WASM}/vision_wasm_internal.js`)) && (await hasFile(LOCAL_MODEL));
  state.modelSource = local ? "local" : "cdn";
  const vision = await FilesetResolver.forVisionTasks(local ? LOCAL_WASM : CDN_WASM);
  const make = (delegate: "GPU" | "CPU") =>
    GestureRecognizer.createFromOptions(vision, {
      baseOptions: { modelAssetPath: local ? LOCAL_MODEL : CDN_MODEL, delegate },
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      cannedGesturesClassifierOptions:{categoryAllowlist:["Thumb_Up", "ILoveYou"],scoreThreshold:0,maxResults:2},
    });
  try {
    landmarker = await make("GPU");
    state.delegate = "GPU";
  } catch (err) {
    console.warn("GPU delegate failed, falling back to CPU", err);
    landmarker = await make("CPU");
    state.delegate = "CPU";
  }
  state.trackerReady = true;
  requestAnimationFrame(loop);
}

/** Record where the player's hand moves for `ms`, then fit the drawing box to it. */
export function startCalibration(ms = 4000): Promise<boolean> {
  cancelHandStroke();
  state.calibrating = true;
  state.calibMessage = "Calibrating: sweep your pinch across the area you want to draw in";
  return new Promise((resolve) => {
    calib = { until: performance.now() + ms, pts: [], done: resolve };
  });
}

function finishCalibration() {
  const c = calib!;
  calib = null;
  state.calibrating = false;
  state.calibMessage = "";
  if (c.pts.length < 20) return c.done?.(false);
  const v = video();
  const vw = v.videoWidth || INPUT.videoWidth;
  const vh = v.videoHeight || INPUT.videoHeight;
  let x0 = Math.min(...c.pts.map((p) => p.x)), x1 = Math.max(...c.pts.map((p) => p.x));
  let y0 = Math.min(...c.pts.map((p) => p.y)), y1 = Math.max(...c.pts.map((p) => p.y));
  // pad, then grow the short side so the box has the arena's aspect in camera pixels
  const padX = (x1 - x0) * 0.1, padY = (y1 - y0) * 0.1;
  x0 -= padX; x1 += padX; y0 -= padY; y1 += padY;
  const target = ARENA.width / ARENA.height;
  const wPx = (x1 - x0) * vw, hPx = (y1 - y0) * vh;
  if (wPx / hPx < target) {
    const grow = (hPx * target - wPx) / vw / 2;
    x0 -= grow; x1 += grow;
  } else {
    const grow = (wPx / target - hPx) / vh / 2;
    y0 -= grow; y1 += grow;
  }
  if (x1 - x0 < 0.15 || y1 - y0 < 0.1) return c.done?.(false);
  state.drawBox = { x0, y0, x1, y1 };
  c.done?.(true);
}

/** ASL: read the handshape; during a round, cast its letter once it has been held long enough. */
function stepAsl(image: Landmark[] | undefined, aspect: number, now: number) {
  const f = image ? aslFeatures(image, aspect) : null;
  const r = f ? aslClassifier.classify(f) : { letter: null, confidence: 0, source: null };
  state.aslFeat = f;
  state.aslLetter = r.letter;
  state.aslSource = r.source;
  state.aslConfidence = r.confidence;
  if (!state.aslActive) {
    aslCaster.reset();
    state.aslProgress = 0;
    return;
  }
  const cast = aslCaster.update(r.letter, now);
  state.aslProgress = aslCaster.progress(now);
  if (cast) emit({ type: "symbol", name: aslName(cast), score: 1, points: [] });
}

function loop() {
  requestAnimationFrame(loop);
  const v = video();
  if (replaying || !landmarker || !state.cameraOn || v.readyState < 2) return;
  if (state.mode !== "hand" && !state.debug && !calib) return;
  if (v.currentTime === lastVideoTime) return;
  lastVideoTime = v.currentTime;

  const now = performance.now();
  let res;
  try {
    res = landmarker.recognizeForVideo(v, now);
  } catch (err) {
    console.warn("recognizeForVideo failed", err);
    return;
  }
  inferenceMs = performance.now() - now;
  frames++;
  if (now - fpsStart > 500) {
    state.trackerFps = (frames * 1000) / (now - fpsStart);
    frames = 0;
    fpsStart = now;
  }

  const hands = (res.landmarks ?? []) as Landmark[][];
  const worlds = (res.worldLandmarks ?? []) as Landmark[][];
  const labels = ((res as { handednesses?: { categoryName?: string }[][] }).handednesses ?? []).map((h) => h[0]?.categoryName);
  const found: (Landmark[] | null)[] = [null, null];
  const foundWorld: (Landmark[] | null)[] = [null, null];
  const thumbScores=[0,0];
  const loveScores=[0,0];
  hands.forEach((lm, i) => {
    const id = drawingHandId(labels[i], i);
    if (found[id]) return;
    found[id] = lm;
    foundWorld[id] = worlds[i] ?? null;
    loveScores[id]=res.gestures[i]?.find(g=>g.categoryName==="ILoveYou")?.score??0;
    thumbScores[id]=res.gestures[i]?.find(g=>g.categoryName==="Thumb_Up")?.score??0;
  });
  const lm = found[0] ?? found[1];
  state.landmarks = lm;
  state.handVisible = !!lm;
  const width = v.videoWidth, height = v.videoHeight;
  const primary: Observation = { t: now, landmarks: found[0], world: foundWorld[0], width, height, thumbUpScore:thumbScores[0], loveScore:loveScores[0] };
  const secondary: Observation = {t:now,landmarks:found[1],world:foundWorld[1],width,height,thumbUpScore:thumbScores[1], loveScore:loveScores[1]};
  observeHands(primary, secondary);
  if(lm)state.lastHandSeen=now;
  if(stepLanguageSubmit(loveScores, now))return;
  if(stepThumbsUp(thumbScores,now))return;
  const asl = state.mode === "hand" && (state.aslActive || state.aslTraining);
  if (asl) {
    pinchEngine.reset();otherEngine.reset();state.inking=false;
    stepAsl(lm ?? undefined, width / height, now);
  } else if (state.mode === "hand") {
    state.aslLetter = null;
    state.aslFeat = null;
    state.aslProgress = 0;
    if (!calib) {
      pinchEngine.process(primary, state.mirror, state.drawBox);
      otherEngine.process(secondary, state.mirror, state.drawBox);
      state.landmarks = found[0] ?? found[1];
      state.handVisible = !!(found[0] || found[1]);
      state.inking = pinchEngine.inking || otherEngine.inking;
    }
  }
  if (lm) state.lastHandSeen = now;
  if (calib) {
    if (lm) {
      const a = experiment.anchor === "knuckle" ? lm[5] : experiment.anchor === "tip" ? lm[8] : experiment.anchor === "thumb" ? lm[4] : { x: (lm[4].x + lm[8].x) / 2, y: (lm[4].y + lm[8].y) / 2 };
      calib.pts.push({ x: state.mirror ? 1 - a.x : a.x, y: a.y });
    }
    if (now > calib.until) finishCalibration();
  }
}

export function cancelHandStroke() {
  pinchEngine.reset();
  otherEngine.reset();
  state.inking = false;
}

export function resetAslHold() {
  aslCaster.reset();
  state.aslProgress=0;
}
