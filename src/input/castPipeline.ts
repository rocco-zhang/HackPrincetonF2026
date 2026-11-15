// strokeEnd → recognizer → symbol / fizzle (or → template recorder when recording).
import { state } from "../state";
import { emit, isSymbol, onInput, type SymbolName } from "./events";
import { createDefaultRecognizer, type Recognizer } from "./recognizer";
import type { XY } from "./shapes";
import { isStrokeTooSmall } from "./strokeDetector";
import bundled from "./templates.json";

const STORAGE_KEY = "spellcam.templates.v1";

type TemplateSet = Partial<Record<SymbolName, XY[][]>>;

function loadLocal(): TemplateSet {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export let recognizer: Recognizer;
let local: TemplateSet = {};

export function initCastPipeline() {
  local = loadLocal();
  recognizer = createDefaultRecognizer([bundled as TemplateSet, local]);

  onInput((e) => {
    if (e.type !== "strokeEnd" || state.aslActive) return;
    const pts = e.points;
    state.lastStroke = pts;
    if (isStrokeTooSmall(pts)) {
      state.lastRecog = recognizer.recognize(pts);
      return; // too small to be intentional: ignore silently
    }

    if (state.recorder.active) {
      const name = state.recorder.symbol;
      const clean = pts.map((p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }));
      (local[name] ??= []).push(clean);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(local));
      recognizer.addTemplate(name, clean, "recorded");
      state.lastRecog = recognizer.recognize(pts);
      toast(`Recorded ${name} (#${local[name]!.length} local)`);
      return;
    }

    const r = recognizer.recognize(pts, state.wanted.filter(isSymbol));
    state.lastRecog = r;
    // after every listener has seen this strokeEnd
    queueMicrotask(() => {
      if (r.accepted && r.name) emit({ type: "symbol", name: r.name, score: r.score, points: pts, hand: e.hand });
      else emit({ type: "fizzle", points: pts, best: r.best, hand: e.hand });
    });
  });
}

/** Download bundled + locally recorded templates, to paste over src/input/templates.json. */
export function exportTemplates() {
  const merged: TemplateSet = structuredClone(bundled as TemplateSet);
  for (const [k, v] of Object.entries(local) as [SymbolName, XY[][]][]) (merged[k] ??= []).push(...v);
  const blob = new Blob([JSON.stringify(merged)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "templates.json";
  a.click();
  URL.revokeObjectURL(a.href);
  toast("Exported templates.json — replace src/input/templates.json with it");
}

export function clearLocalTemplates() {
  local = {};
  localStorage.removeItem(STORAGE_KEY);
  recognizer = createDefaultRecognizer([bundled as TemplateSet]);
  toast("Cleared locally recorded templates");
}

export function localTemplateCount(name: SymbolName) {
  return local[name]?.length ?? 0;
}

let toastTimer = 0;
export function toast(msg: string) {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el!.classList.remove("show"), 2200);
}
