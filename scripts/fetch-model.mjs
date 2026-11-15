// Copies the MediaPipe wasm runtime out of node_modules and downloads the hand
// landmarker model into public/, so the game never needs a CDN at runtime.
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const wasmSrc = join(root, "node_modules/@mediapipe/tasks-vision/wasm");
const wasmDst = join(root, "public/mediapipe/wasm");

if (existsSync(wasmSrc)) {
  mkdirSync(wasmDst, { recursive: true });
  for (const f of readdirSync(wasmSrc)) copyFileSync(join(wasmSrc, f), join(wasmDst, f));
  console.log("[fetch-model] copied wasm ->", wasmDst);
} else {
  console.warn("[fetch-model] @mediapipe/tasks-vision not installed yet; skipping wasm copy");
}

for (const name of ["hand_landmarker", "gesture_recognizer"]) {
  const modelDst=join(root,`public/models/${name}.task`);
  const modelUrl=`https://storage.googleapis.com/mediapipe-models/${name}/${name}/float16/1/${name}.task`;
  if (existsSync(modelDst) && !process.argv.includes("--force")) {
    console.log(`[fetch-model] ${name} already present`);
    continue;
  }
  try {
    const res = await fetch(modelUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    mkdirSync(dirname(modelDst), { recursive: true });
    writeFileSync(modelDst, Buffer.from(await res.arrayBuffer()));
    console.log("[fetch-model] downloaded model ->", modelDst);
  } catch (err) {
    console.warn("[fetch-model] model download failed (game will fall back to CDN):", err.message);
  }
}
