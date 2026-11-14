import { INPUT, RECOG } from "../config";

export type Variant = "A" | "B" | "C" | "D" | "E" | "F";
export const experiment = {
  version: "pinch-v1", variant: "A" as Variant, anchor: "knuckle" as "knuckle" | "tip" | "thumb" | "pinch",
  timing: "time" as "time" | "frames", startFrames: 2, endFrames: 3, calibrated: false,
  releaseMs: 80, startMs: 30, lostHandMs: 300, historyMs: 750, prefixMs: 80,
  minStrokeLengthEnabled: true, minStrokePointsEnabled: true,
  recognitionThreshold: RECOG.acceptScore, wantedRecognitionThreshold: RECOG.acceptScoreWanted,
  on: INPUT.pinchOn, off: INPUT.pinchOff, speedAssist: false, speedAssistRange: .08, depthVeto: true, use3d: false,
};
