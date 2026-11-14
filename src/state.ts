import { DIFFICULTIES, INPUT, type Difficulty } from "./config";
import type { AslLetter } from "./asl/hand";
import type { CastName, SymbolName } from "./input/events";
import type { RecogResult } from "./input/recognizer";

export type Landmark = { x: number; y: number; z: number };

const DIFFICULTY_KEY = "spellcam.difficulty";

function loadDifficulty(): Difficulty {
  try {
    const v = localStorage.getItem(DIFFICULTY_KEY) as Difficulty | null;
    if (v && DIFFICULTIES.includes(v)) return v;
  } catch {
    // storage blocked: fall back to the default
  }
  return "medium";
}

/** Remember the title-screen difficulty choice for next time. */
export function saveDifficulty(d: Difficulty) {
  state.difficulty = d;
  try {
    localStorage.setItem(DIFFICULTY_KEY, d);
  } catch {
    // storage blocked: the choice still lasts for this session
  }
}

/** Shared app state read by the debug overlay, HUD and input adapters. */
export const state = {
  mode: "mouse" as "mouse" | "hand",
  cameraOn: false,
  trackerReady: false,
  delegate: "" as "" | "GPU" | "CPU",
  modelSource: "" as "" | "local" | "cdn",
  mirror: true,
  debug: false,
  handVisible: false,
  lastHandSeen: 0,
  landmarks: null as Landmark[] | null,
  pinchRatio: null as number | null,
  pinchRatio3d: null as number | null,
  inking: false,
  /** Instruction shown in a banner while the drawing-area calibration (K) is running. */
  calibMessage: "",
  trackerFps: 0,
  drawBox: { ...INPUT.drawBox },
  calibrating: false,
  lastStroke: null as { x: number; y: number }[] | null,
  lastRecog: null as RecogResult | null,
  /** Symbols a monster currently needs; the recognizer favours these. Empty outside the arena. */
  wanted: [] as CastName[],
  /** Title-screen choice: play the ASL fingerspelling mode instead of drawing spells. */
  aslSelected: false,
  /** Title-screen choice (in versus, the host's). */
  difficulty: loadDifficulty(),
  /** Title-screen choice: monsters carry arithmetic, answered from the keyboard. */
  mathSelected: false,
  /** An ASL round is running: the tracker reads handshapes and strokes are ignored. */
  aslActive: false,
  /** An arithmetic round is running: drawing is ignored and answers are typed. */
  mathActive: false,
  /** Handshape read this frame, and how far through the hold-to-cast it is (0–1). */
  aslLetter: null as AslLetter | null,
  aslProgress: 0,
  /** Who decided that letter (your recorded examples or the trained model) and how sure it was. */
  aslSource: null as "yours" | "model" | null,
  aslConfidence: 0,
  /** The ASL trainer is open: handshapes are read but nothing is cast. */
  aslTraining: false,
  /** This frame's hand as classifier input (a new array per camera frame); the trainer records these. */
  aslFeat: null as number[] | null,
  recorder: { active: false, symbol: "circle" as SymbolName },
  demo: false,
};
