import Phaser from "phaser";
import "./style.css";
import { ARENA } from "./config";
import { applyMirror, nextCamera, startCamera } from "./input/camera";
import { exportTemplates, initCastPipeline, toast } from "./input/castPipeline";
import { initDebugOverlay } from "./input/debugOverlay";
import { bus, emit, SYMBOLS } from "./input/events";
import { cancelHandStroke, initHandTracker, startCalibration } from "./input/handTracker";
import { initMouseAdapter } from "./input/mouseAdapter";
import { Arena } from "./game/scenes/Arena";
import { Boot } from "./game/scenes/Boot";
import { GameOver } from "./game/scenes/GameOver";
import { Title } from "./game/scenes/Title";
import { toggleMute, unlockAudio } from "./game/sfx";
import { state } from "./state";

let game: Phaser.Game | null = null;

initCastPipeline();
const mouse = initMouseAdapter();
initDebugOverlay(() => game);

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
    scene: [Boot, Title, Arena, GameOver],
  });
  (window as unknown as { __spellcam: unknown }).__spellcam = { game, state, emit, bus, startArena, initHandTracker };
}

/** (Re)start the Arena from whatever scene is running. */
function startArena(demo: boolean) {
  const cur = game?.scene.getScenes(true).find((s) => s.scene.key !== "Boot");
  cur?.scene.start("Arena", { demo });
}

const gate = document.getElementById("gate")!;
const gateMsg = document.getElementById("gateMsg")!;
const enableBtn = document.getElementById("enable") as HTMLButtonElement;
const mouseBtn = document.getElementById("mouseOnly") as HTMLButtonElement;

function closeGate() {
  gate.classList.add("hidden");
  startGame();
}

/** Camera + hand tracker. Throws with a friendly message on failure. */
async function enableHands() {
  if (!state.cameraOn) await startCamera();
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
  const k = ev.key.toLowerCase();
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
    toast("Calibrating: sweep your pinch over the area you want to draw in (4 s)");
    const ok = await startCalibration();
    toast(ok ? "Drawing area set ✓" : "Calibration failed: keep your hand visible and move it more");
  } else if (k === "g" && game) {
    startArena(true);
  }
});
