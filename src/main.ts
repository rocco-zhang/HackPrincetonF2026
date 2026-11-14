import Phaser from "phaser";
// Bundled handwriting fonts, used when the macOS ones (Chalkboard SE, Marker Felt) are missing.
import "@fontsource/patrick-hand/latin-400.css";
import "@fontsource/permanent-marker/latin-400.css";
import "./style.css";
import { ARENA } from "./config";
import { applyMirror, listCameras, nextCamera, startCamera } from "./input/camera";
import { exportTemplates, initCastPipeline, toast } from "./input/castPipeline";
import { initDebugOverlay } from "./input/debugOverlay";
import { bus, emit, SYMBOLS } from "./input/events";
import { loadAslExamples } from "./asl/examples";
import { aslClassifier, cancelHandStroke, initHandTracker, startCalibration } from "./input/handTracker";
import { initMouseAdapter } from "./input/mouseAdapter";
import { Arena } from "./game/scenes/Arena";
import { AslTrainer } from "./game/scenes/AslTrainer";
import { Boot } from "./game/scenes/Boot";
import { GameOver } from "./game/scenes/GameOver";
import { Title } from "./game/scenes/Title";
import { toggleMute, unlockAudio } from "./game/sfx";
import { initLobby, lobbyOpen, openLobby } from "./net/lobby";
import { pvp } from "./net/pvp";
import { state } from "./state";
import { experiment, type Variant } from "./input/pinchExperiment";

if (import.meta.env.DEV) {
  Object.assign(experiment, __PINCH_LOCAL_CONFIG__);
  try {
    const response=await fetch("/__pinch-config",{cache:"no-store"});
    if(!response.ok)throw Error("Could not load saved pinch settings");
    Object.assign(experiment,await response.json());
  } catch(err) {console.warn("Using startup pinch defaults",err);}
  const params = new URLSearchParams(location.search);
  if (params.get("drawbox") === "wide") state.drawBox={x0:.14,y0:.125,x1:.86,y1:.665};
  const variant = params.get("pinch");
  if (variant && /^[A-F]$/.test(variant)) experiment.variant = variant as Variant;
  const anchor = params.get("anchor");
  if (anchor === "knuckle" || anchor === "tip" || anchor === "thumb" || anchor === "pinch") experiment.anchor = anchor;
  const release = Number(params.get("release"));
  if ([50,80,120,180].includes(release)) experiment.releaseMs = release;
  if (params.get("timing") === "frames" || params.get("timing") === "time") {
    experiment.timing=params.get("timing") as typeof experiment.timing;
    for(const key of ["begin","end"]){
      const value=Number(params.get(key)),frames=experiment.timing==="frames";
      if(params.has(key)&&Number.isInteger(value)&&value>=(frames?1:0)&&value<=(frames?30:1000)){
        if(frames){if(key==="begin")experiment.startFrames=value;else experiment.endFrames=value;}
        else {if(key==="begin")experiment.startMs=value;else experiment.releaseMs=value;}
      }
    }
  }
  for(const key of ["recognitionThreshold","wantedRecognitionThreshold"] as const){
    const value=Number(params.get(key));
    if(params.has(key)&&Number.isFinite(value)&&value>=0&&value<=1)experiment[key]=value;
  }
  // Only explicit lab calibration is carried into gameplay; never infer thresholds from a match.
  if (params.has("speedAssist")) experiment.speedAssist=params.get("speedAssist")==="true";
  const speedRange=Number(params.get("speedRange"));
  if(params.has("speedRange")&&Number.isFinite(speedRange)&&speedRange>=0&&speedRange<=.3)experiment.speedAssistRange=speedRange;
  if (params.has("depthVeto")) experiment.depthVeto=params.get("depthVeto")!=="false";
  if (params.has("minStrokePointsEnabled")) experiment.minStrokePointsEnabled=params.get("minStrokePointsEnabled")!=="false";
  if (params.has("minStrokeLengthEnabled")) experiment.minStrokeLengthEnabled=params.get("minStrokeLengthEnabled")!=="false";
  if (params.has("use3d")) experiment.use3d=params.get("use3d")==="true";
  const on = Number(params.get("on")), off = Number(params.get("off"));
  if (on >= .05 && on <= .7 && off >= on + .1 && off <= .85) {experiment.on=on;experiment.off=off;experiment.calibrated=params.get("calibrated")==="true";}
}
if (import.meta.env.DEV && location.pathname.replace(/\/$/, "") === "/dev/pinch") {
  initCastPipeline();
  void import("./input/pinchLab").then(({initPinchLab}) => initPinchLab());
} else {
let game: Phaser.Game | null = null;

// Left over from a removed pinch-calibration feature; nothing reads it any more.
try {
  localStorage.removeItem("spellcam.pinch.v1");
} catch {
  // storage unavailable
}

initCastPipeline();
// your recorded ASL examples (data/asl-examples.json, or this browser) override the trained model
void loadAslExamples((e) => aslClassifier.setExamples(e));
const mouse = initMouseAdapter();
initDebugOverlay(() => game);
initLobby(() => game);

function startGame() {
  if (game) return;
  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    width: ARENA.width,
    height: ARENA.height,
    transparent: true,
    audio: { noAudio: true },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [Boot, Title, Arena, GameOver, AslTrainer],
  });
  (window as unknown as { __spellcam: unknown }).__spellcam = { game, state, emit, bus, startArena, initHandTracker, pvp };
}

/** (Re)start the Arena from whatever scene is running. */
function startArena(demo: boolean) {
  const cur = game?.scene.getScenes(true).find((s) => s.scene.key !== "Boot");
  cur?.scene.start("Arena", { demo });
}

const gate = document.getElementById("gate")!;
if (import.meta.env.DEV) {
  const labButton=document.createElement("button");
  labButton.textContent="Input lab / pinch settings";labButton.className="secondary";
  labButton.onclick=()=>{location.href="/dev/pinch";};
  gate.insertBefore(labButton,document.getElementById("gateMsg"));
}
const gateMsg = document.getElementById("gateMsg")!;
const enableBtn = document.getElementById("enable") as HTMLButtonElement;
const mouseBtn = document.getElementById("mouseOnly") as HTMLButtonElement;
const camPick = document.getElementById("camPick") as HTMLLabelElement;
const camSelect = document.getElementById("camSelect") as HTMLSelectElement;

/** Fill the camera picker. Browsers only reveal camera names once permission is granted. */
async function refreshCameras() {
  const cams = await listCameras();
  const chosen = camSelect.value;
  camSelect.replaceChildren(
    ...cams.map((c, i) => {
      const o = document.createElement("option");
      o.value = c.deviceId;
      o.textContent = c.label || `Camera ${i + 1}`;
      return o;
    }),
  );
  if (cams.some((c) => c.deviceId === chosen)) camSelect.value = chosen;
  camPick.hidden = cams.length < 2;
}
void refreshCameras();
navigator.mediaDevices?.addEventListener?.("devicechange", () => void refreshCameras());
camSelect.addEventListener("change", async () => {
  if (!state.cameraOn) return; // used when the camera is first started
  try {
    await startCamera(camSelect.value);
  } catch (err) {
    gateMsg.textContent = (err as Error).message;
  }
});

// Canvas text is drawn once, so the fallback fonts have to be loaded before the game starts.
const fontsReady = Promise.race([
  Promise.allSettled(['32px "Patrick Hand"', '32px "Permanent Marker"'].map((f) => document.fonts.load(f))),
  new Promise((r) => setTimeout(r, 1500)),
]);

function closeGate() {
  gate.classList.add("hidden");
  void fontsReady.then(startGame);
}

/** Camera + hand tracker. Throws with a friendly message on failure. */
async function enableHands() {
  if (!state.cameraOn) {
    try {
      await startCamera(camSelect.value || undefined);
    } finally {
      void refreshCameras(); // names are available now, and a denied prompt may have changed the list
    }
  }
  if (!state.trackerReady) {
    try {
      await initHandTracker();
    } catch (err) {
      console.error(err);
      throw new Error("Hand tracking failed to load. You can still play with the mouse.");
    }
  }
}

enableBtn.addEventListener("click", async () => {
  unlockAudio();
  enableBtn.disabled = mouseBtn.disabled = true;
  gateMsg.textContent = "Starting camera…";
  try {
    await enableHands();
    gateMsg.textContent = "";
    state.mode = "hand";
    closeGate();
  } catch (err) {
    gateMsg.textContent = (err as Error).message;
    enableBtn.textContent = "Try camera again";
    enableBtn.disabled = mouseBtn.disabled = false;
  }
});

mouseBtn.addEventListener("click", () => {
  unlockAudio();
  state.mode = "mouse";
  closeGate();
});

if (new URLSearchParams(location.search).has("mouse")) {
  state.mode = "mouse";
  closeGate();
}

async function setMode(mode: "mouse" | "hand") {
  if (mode === state.mode) return;
  mouse.cancel();
  cancelHandStroke();
  if (mode === "hand") {
    try {
      toast("Starting hand tracking…");
      await enableHands();
    } catch (err) {
      toast((err as Error).message);
      return;
    }
  }
  state.mode = mode;
  toast(mode === "hand" ? "✋ Hand input" : "🖱 Mouse input");
}

window.addEventListener("keydown", async (ev) => {
  if (!gate.classList.contains("hidden") || ev.repeat || ev.metaKey || ev.ctrlKey) return;
  if (lobbyOpen()) return; // typing a room code
  const k = ev.key.toLowerCase();
  if (k === "v") {
    // versus lobby, from the title screen only
    if (game?.scene.isActive("Title")) {
      ev.preventDefault();
      openLobby();
    }
    return;
  }
  if (k === "d") state.debug = !state.debug;
  else if (k === "m") void setMode(state.mode === "hand" ? "mouse" : "hand");
  else if (k === "n") toast(toggleMute() ? "Sound off" : "Sound on");
  else if (k === "t") {
    state.recorder.active = !state.recorder.active;
    toast(state.recorder.active ? `Recording templates: draw "${state.recorder.symbol}" (1-6 to switch)` : "Template recording off");
  } else if (state.recorder.active && /^[1-6]$/.test(k)) {
    state.recorder.symbol = SYMBOLS[Number(k) - 1];
    toast(`Recording "${state.recorder.symbol}"`);
  } else if (state.recorder.active && k === "e") exportTemplates();
  else if (k === "f") {
    state.mirror = !state.mirror;
    applyMirror();
    toast(state.mirror ? "Mirror on" : "Mirror off");
  } else if (k === "c") {
    try {
      toast(`Camera: ${await nextCamera()}`);
    } catch (err) {
      toast((err as Error).message);
    }
  } else if (k === "k") {
    if (!state.trackerReady || !state.cameraOn) return toast("Turn on hand input first (M)");
    if (state.calibrating) return;
    toast("Calibrating: sweep your pinch over the area you want to draw in (4 s)");
    const ok = await startCalibration();
    toast(ok ? "Drawing area set ✓" : "Calibration failed: keep your hand visible and move it more");
  } else if (k === "g" && game && !pvp.active) {
    startArena(true);
  }
});

}
