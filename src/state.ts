import { INPUT } from "./config";
import type { AslLetter } from "./asl/hand";
import type { CastName, SymbolName } from "./input/events";
import type { RecogResult } from "./input/recognizer";

export type Landmark = { x: number; y: number; z: number };

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
  /** Title-screen choice: monsters carry arithmetic, answered by drawn digits. */
  mathSelected: false,
  /** Title-screen choice: Korean, Japanese, and a few short words, drawn as easy marks. */
  langSelected: false,
  /** An ASL round is running: the tracker reads handshapes and strokes are ignored. */
  aslActive: false,
  /** An arithmetic round is running. */
  mathActive: false,
  /** A languages round is running. Each mark is drawn and casts on its own. */
  langActive: false,
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
