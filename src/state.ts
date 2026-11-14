import { INPUT } from "./config";
import type { SymbolName } from "./input/events";
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
  wanted: [] as SymbolName[],
  recorder: { active: false, symbol: "circle" as SymbolName },
  demo: false,
};
