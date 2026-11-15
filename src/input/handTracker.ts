// MediaPipe HandLandmarker loop → smoothed cursor + pinch state → input events.
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { ARENA, INPUT } from "../config";
import { state, type Landmark } from "../state";
import { video } from "./camera";
import { aslFeatures } from "../asl/features";
import { AslCaster, AslClassifier } from "../asl/hand";
import { aslName, emit, type InputEvent } from "./events";
import { drawingHandId } from "./hands";
import { experiment, PinchExperiment, type Observation } from "./pinchExperiment";
import { recognizer } from "./castPipeline";

const LOCAL_WASM = `${import.meta.env.BASE_URL}mediapipe/wasm`;
const LOCAL_MODEL = `${import.meta.env.BASE_URL}models/hand_landmarker.task`;
const CDN_WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm";
const CDN_MODEL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

let landmarker: HandLandmarker | null = null;
function withHand(hand: number, e: InputEvent): InputEvent {
  if (e.type === "cursor" || e.type === "strokeStart" || e.type === "strokePoint" || e.type === "strokeEnd") return { ...e, hand };
  return e;
}
export const pinchEngine = new PinchExperiment((e) => emit(withHand(0, e)), (p) => recognizer.recognize(p));
const otherEngine = new PinchExperiment((e) => emit(withHand(1, e)), (p) => recognizer.recognize(p));
export let replaying = false;
export const observationListeners = new Set<(o: Observation) => void>();
export let inferenceMs = 0;
export function setReplaying(value: boolean) { replaying = value; cancelHandStroke(); }
export function processObservation(o: Observation) {
  state.landmarks = o.landmarks;
  state.handVisible = !!o.landmarks;
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

/** True if `url` is served as a real file (Vite's dev server answers missing files with index.html). */
async function hasFile(url: string) {
  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.ok && !(res.headers.get("content-type") ?? "").includes("text/html");
  } catch {
    return false;
  }
}

export async function initHandTracker() {
  if (landmarker) return;
  const local = (await hasFile(`${LOCAL_WASM}/vision_wasm_internal.js`)) && (await hasFile(LOCAL_MODEL));
  state.modelSource = local ? "local" : "cdn";
  const vision = await FilesetResolver.forVisionTasks(local ? LOCAL_WASM : CDN_WASM);
  const make = (delegate: "GPU" | "CPU") =>
    HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: local ? LOCAL_MODEL : CDN_MODEL, delegate },
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
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
    res = landmarker.detectForVideo(v, now);
  } catch (err) {
    console.warn("detectForVideo failed", err);
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
  hands.forEach((lm, i) => {
    const id = drawingHandId(labels[i], i);
    if (found[id]) return;
    found[id] = lm;
    foundWorld[id] = worlds[i] ?? null;
  });
  const lm = found[0] ?? found[1];
  state.landmarks = lm;
  state.handVisible = !!lm;
  const width = v.videoWidth, height = v.videoHeight;
  const primary: Observation = { t: now, landmarks: found[0], world: foundWorld[0], width, height };
  for (const listener of observationListeners) listener(primary);
  const asl = state.mode === "hand" && (state.aslActive || state.aslTraining);
  if (asl) {
    pinchEngine.reset();
    otherEngine.reset();
    state.inking = false;
    stepAsl(lm ?? undefined, width / height, now);
  } else if (state.mode === "hand") {
    state.aslLetter = null;
    state.aslFeat = null;
    state.aslProgress = 0;
    if (!calib) {
      processObservation(primary);
      otherEngine.process({ t: now, landmarks: found[1], world: foundWorld[1], width, height }, state.mirror, state.drawBox);
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
