// Copies the MediaPipe wasm runtime out of node_modules and downloads the hand
// landmarker model into public/, so the game never needs a CDN at runtime.
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const wasmSrc = join(root, "node_modules/@mediapipe/tasks-vision/wasm");
const wasmDst = join(root, "public/mediapipe/wasm");
const modelDst = join(root, "public/models/hand_landmarker.task");
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

if (existsSync(wasmSrc)) {
  mkdirSync(wasmDst, { recursive: true });
  for (const f of readdirSync(wasmSrc)) copyFileSync(join(wasmSrc, f), join(wasmDst, f));
  console.log("[fetch-model] copied wasm ->", wasmDst);
} else {
  console.warn("[fetch-model] @mediapipe/tasks-vision not installed yet; skipping wasm copy");
}

if (existsSync(modelDst) && !process.argv.includes("--force")) {
  console.log("[fetch-model] model already present");
} else {
  try {
    const res = await fetch(MODEL_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    mkdirSync(dirname(modelDst), { recursive: true });
    writeFileSync(modelDst, Buffer.from(await res.arrayBuffer()));
    console.log("[fetch-model] downloaded model ->", modelDst);
  } catch (err) {
    console.warn("[fetch-model] model download failed (game will fall back to CDN):", err.message);
  }
}
