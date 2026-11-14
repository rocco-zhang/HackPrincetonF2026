// Mouse / touch drag → the same events the hand tracker emits.
import { ARENA } from "../config";
import { state } from "../state";
import { emit, type Pt } from "./events";
import { StrokeDetector } from "./strokeDetector";

export function toGameCoords(clientX: number, clientY: number): { x: number; y: number } | null {
  const canvas = document.querySelector<HTMLCanvasElement>("#game canvas");
  if (!canvas) return null;
  const r = canvas.getBoundingClientRect();
  return {
    x: ((clientX - r.left) / r.width) * ARENA.width,
    y: ((clientY - r.top) / r.height) * ARENA.height,
  };
}

export function initMouseAdapter() {
  const strokes = new StrokeDetector(0);
  let down = false;

  const handle = (ev: PointerEvent, inking: boolean) => {
    if (state.mode !== "mouse") return;
    const g = toGameCoords(ev.clientX, ev.clientY);
    if (!g) return;
    const p: Pt = { x: g.x, y: g.y, t: performance.now() };
    emit({ type: "cursor", p, inking });
    strokes.update(p, inking);
  };

  const stage = document.getElementById("stage")!;
  stage.addEventListener("pointerdown", (ev) => {
    if (ev.button !== 0) return;
    // Capturing the pointer retargets the click to #stage, so the start-screen buttons would never get it.
    if ((ev.target as Element).closest?.("#gate")) return;
    down = true;
    try {
      stage.setPointerCapture(ev.pointerId);
    } catch {
      // synthetic or already-released pointers can't be captured
    }
    handle(ev, true);
  });
  stage.addEventListener("pointermove", (ev) => handle(ev, down));
  const up = (ev: PointerEvent) => {
    if (!down) return;
    down = false;
    handle(ev, false);
  };
  stage.addEventListener("pointerup", up);
  stage.addEventListener("pointercancel", up);

  return {
    /** End any stroke in progress (e.g. when switching modes). */
    cancel() {
      down = false;
      strokes.finish();
    },
  };
}
