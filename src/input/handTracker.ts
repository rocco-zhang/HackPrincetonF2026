// MediaPipe HandLandmarker loop → smoothed cursor + pinch state → input events.
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { ARENA, INPUT } from "../config";
import { state, type Landmark } from "../state";
import { video } from "./camera";
import { emit, type Pt } from "./events";
import { OneEuro2D } from "./oneEuro";
import { PinchGate, StrokeDetector } from "./strokeDetector";

const LOCAL_WASM = "./mediapipe/wasm";
const LOCAL_MODEL = "./models/hand_landmarker.task";
const CDN_WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm";
const CDN_MODEL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

let landmarker: HandLandmarker | null = null;
const gate = new PinchGate();
const strokes = new StrokeDetector(INPUT.handTrimPoints);
const euro = new OneEuro2D(INPUT.euroMinCutoff, INPUT.euroBeta, INPUT.euroDCutoff);
let lastVideoTime = -1;
let lastP: Pt | null = null;
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
      numHands: 1,
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
  state.calibrating = true;
  return new Promise((resolve) => {
    calib = { until: performance.now() + ms, pts: [], done: resolve };
  });
}

function finishCalibration() {
  const c = calib!;
  calib = null;
  state.calibrating = false;
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

function dist(a: Landmark, b: Landmark, vw: number, vh: number) {
  return Math.hypot((a.x - b.x) * vw, (a.y - b.y) * vh);
}

function dist3(a: Landmark, b: Landmark) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function loop() {
  requestAnimationFrame(loop);
  const v = video();
  if (!landmarker || !state.cameraOn || v.readyState < 2) return;
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
  frames++;
  if (now - fpsStart > 500) {
    state.trackerFps = (frames * 1000) / (now - fpsStart);
    frames = 0;
    fpsStart = now;
  }

  const lm = res.landmarks?.[0] as Landmark[] | undefined;
  const handActive = state.mode === "hand";

  if (!lm) {
    state.landmarks = null;
    state.handVisible = false;
    state.pinchRatio = null;
    state.pinchRatio3d = null;
    state.inking = gate.update(null, now);
    if (!state.inking) strokes.finish(gate.releasedAt);
    else if (handActive && lastP) strokes.update(lastP, true);
    if (calib && now > calib.until) finishCalibration();
    return;
  }

  state.landmarks = lm;
  state.handVisible = true;
  state.lastHandSeen = now;
  const vw = v.videoWidth, vh = v.videoHeight;
  const handSize = dist(lm[0], lm[9], vw, vh);
  let ratio = handSize > 0 ? dist(lm[4], lm[8], vw, vh) / handSize : null;
  // 3D check: tips that overlap in the image but are apart in depth are not a pinch
  const wl = res.worldLandmarks?.[0] as Landmark[] | undefined;
  const size3 = wl ? dist3(wl[0], wl[9]) : 0;
  const ratio3 = wl && size3 > 0 ? dist3(wl[4], wl[8]) / size3 : null;
  state.pinchRatio3d = ratio3;
  if (ratio !== null && ratio3 !== null && ratio3 > INPUT.pinch3dMax) ratio = Math.max(ratio, ratio3);
  state.pinchRatio = ratio;
  state.inking = gate.update(ratio, now);
  // cut the stroke back to where the (debounced) release began
  if (!state.inking) strokes.finish(gate.releasedAt);

  // Cursor anchor: see INPUT.cursorAnchor. The same point is used whether or not the
  // hand is pinched, so the cursor doesn't jump when inking starts.
  const knuckle = INPUT.cursorAnchor === "knuckle";
  let nx = knuckle ? lm[5].x : (lm[4].x + lm[8].x) / 2;
  const ny = knuckle ? lm[5].y : (lm[4].y + lm[8].y) / 2;
  if (state.mirror) nx = 1 - nx;

  if (calib) {
    calib.pts.push({ x: nx, y: ny });
    if (now > calib.until) finishCalibration();
    return;
  }
  if (!handActive) return;

  const b = state.drawBox;
  const gx = Math.min(1, Math.max(0, (nx - b.x0) / (b.x1 - b.x0))) * ARENA.width;
  const gy = Math.min(1, Math.max(0, (ny - b.y0) / (b.y1 - b.y0))) * ARENA.height;
  const f = euro.filter(gx, gy, now / 1000);
  const p: Pt = { x: f.x, y: f.y, t: now };
  lastP = p;
  emit({ type: "cursor", p, inking: state.inking });
  strokes.update(p, state.inking);
}

export function cancelHandStroke() {
  strokes.finish();
  gate.reset();
  euro.reset();
}
