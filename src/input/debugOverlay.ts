import type Phaser from "phaser";
import { INPUT, RECOG } from "../config";
import { state } from "../state";
import { video } from "./camera";
import { SYMBOLS } from "./events";
import { localTemplateCount, recognizer } from "./castPipeline";

const BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];

export function initDebugOverlay(getGame: () => Phaser.Game | null) {
  const canvas = document.getElementById("debug") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;

  const resize = () => {
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.round(r.width * devicePixelRatio);
    canvas.height = Math.round(r.height * devicePixelRatio);
  };
  window.addEventListener("resize", resize);
  resize();

  const draw = () => {
    requestAnimationFrame(draw);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!state.debug && !state.recorder.active && !state.calibrating) return;
    const s = devicePixelRatio;
    ctx.scale(s, s);
    const W = canvas.width / s;

    if (state.calibrating) {
      ctx.font = "bold 20px system-ui";
      const bw = Math.min(W - 24, ctx.measureText(state.calibMessage).width + 48);
      ctx.fillStyle = "rgba(0,0,0,0.72)";
      ctx.fillRect(W / 2 - bw / 2, 20, bw, 60);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.fillText(state.calibMessage, W / 2, 56, bw - 24);
      ctx.textAlign = "left";
    }

    if (state.recorder.active) {
      const name = state.recorder.symbol;
      ctx.fillStyle = "rgba(200,30,60,0.85)";
      ctx.fillRect(12, 12, 470, 54);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 16px system-ui";
      ctx.fillText(`● RECORDING "${name}" (${localTemplateCount(name)} recorded here)`, 22, 34);
      ctx.font = "13px system-ui";
      ctx.fillText(`1-6 pick symbol (${SYMBOLS.join(", ")}) · E export · T stop`, 22, 54);
    }
    if (!state.debug) return;

    // camera preview with skeleton + drawing box
    const pw = 256, ph = 192, px = W - pw - 12, py = 12;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(px - 4, py - 4, pw + 8, ph + 8);
    const v = video();
    if (state.cameraOn && v.readyState >= 2) {
      ctx.save();
      if (state.mirror) {
        ctx.translate(px + pw, py);
        ctx.scale(-1, 1);
        ctx.drawImage(v, 0, 0, pw, ph);
      } else ctx.drawImage(v, px, py, pw, ph);
      ctx.restore();
    }
    const mx = (x: number) => px + (state.mirror ? 1 - x : x) * pw;
    const b = state.drawBox;
    ctx.strokeStyle = "rgba(255,255,0,0.8)";
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(px + b.x0 * pw, py + b.y0 * ph, (b.x1 - b.x0) * pw, (b.y1 - b.y0) * ph);
    ctx.setLineDash([]);
    const lm = state.landmarks;
    if (lm) {
      ctx.strokeStyle = state.inking ? "#ff5ca8" : "#4de8ff";
      ctx.lineWidth = 2;
      for (const [a, c] of BONES) {
        ctx.beginPath();
        ctx.moveTo(mx(lm[a].x), py + lm[a].y * ph);
        ctx.lineTo(mx(lm[c].x), py + lm[c].y * ph);
        ctx.stroke();
      }
      for (let i = 0; i < lm.length; i++) {
        ctx.fillStyle = i === 4 || i === 8 ? "#ffe14d" : "#fff";
        ctx.beginPath();
        ctx.arc(mx(lm[i].x), py + lm[i].y * ph, i === 4 || i === 8 ? 4 : 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // stats
    const game = getGame();
    const r = state.lastRecog;
    const lines = [
      `mode: ${state.mode}   camera: ${state.cameraOn ? "on" : "off"}   tracker: ${state.trackerReady ? `${state.delegate} / model ${state.modelSource}` : "not loaded"}`,
      `tracker fps: ${state.trackerFps.toFixed(0)}   game fps: ${game ? game.loop.actualFps.toFixed(0) : "-"}`,
      `hand: ${state.handVisible ? "yes" : "no"}   pinch: ${state.pinchRatio?.toFixed(2) ?? "-"} (on < ${INPUT.pinchOn}, off > ${INPUT.pinchOff})   3D: ${state.pinchRatio3d?.toFixed(2) ?? "-"} (veto > ${INPUT.pinch3dMax})   inking: ${state.inking}`,
      `ASL: ${state.aslActive || state.aslTraining ? `reading ${state.aslLetter ?? "-"} (${state.aslSource ?? "-"} ${(state.aslConfidence * 100).toFixed(0)}%)  hold ${(state.aslProgress * 100).toFixed(0)}%` : "off (pick ASL as a subject)"}`,
      r
        ? `last: ${r.name ?? "FIZZLE"}  score ${r.score.toFixed(2)} (accept ≥ ${RECOG.acceptScore}, ≥ ${RECOG.acceptScoreWanted} if needed: ${state.wanted.join(",") || "-"})  via ${r.method}${r.best && !r.accepted ? `  best guess ${r.best.name} ${r.best.score.toFixed(2)}` : ""}`
        : "last: -",
      `templates: ${SYMBOLS.filter((n) => n !== "hline" && n !== "vline").map((n) => `${n} ${recognizer?.count(n) ?? 0}`).join("  ")}  (lines: angle rule)`,
      `keys: D debug · T record · K calibrate · C camera · F mirror · G demo`,
    ];
    ctx.font = "12px ui-monospace, Menlo, monospace";
    const tw = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 16;
    const ty = state.recorder.active ? 76 : 12;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(12, ty, tw, lines.length * 17 + 10);
    ctx.fillStyle = "#e8f6ff";
    lines.forEach((l, i) => ctx.fillText(l, 20, ty + 20 + i * 17));

    // resampled 64 points of the last stroke
    if (r && r.resampled.length) {
      const bx = W - 140, by = py + ph + 16, bs = 128;
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(bx - 4, by - 4, bs + 8, bs + 8);
      const xs = r.resampled.map((p) => p.x), ys = r.resampled.map((p) => p.y);
      const minX = Math.min(...xs), minY = Math.min(...ys);
      const span = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY, 1);
      r.resampled.forEach((p, i) => {
        ctx.fillStyle = i === 0 ? "#9dff5c" : "#ffffff";
        ctx.fillRect(bx + ((p.x - minX) / span) * bs - 1.5, by + ((p.y - minY) / span) * bs - 1.5, 3, 3);
      });
    }
  };
  requestAnimationFrame(draw);
}
