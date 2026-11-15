import defaults from "../../config/pinch.defaults.json" with { type: "json" };
type Settings = Omit<typeof defaults, "variant" | "anchor" | "timing"> & {
  variant: "C" | "E";
  anchor: "knuckle" | "tip" | "thumb" | "pinch";
  timing: "time" | "frames";
};

/** Local dev defaults only; reject invalid files rather than silently mixing settings. */
export function parsePinchSettings(value: unknown): Partial<Settings> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw Error("Pinch config must be an object");
  const v = value as Record<string, unknown>;
  const rules: Record<string, (x: unknown) => boolean> = {
    variant: x => x === "C" || x === "E",
    anchor: x => ["knuckle", "tip", "thumb", "pinch"].includes(String(x)),
    timing: x => x === "time" || x === "frames",
    on: x => typeof x === "number" && Number.isFinite(x) && x >= .05 && x <= .7,
    hysteresisGap: x => typeof x === "number" && Number.isFinite(x) && x >= .01 && x <= .3,
    off: x => typeof x === "number" && Number.isFinite(x) && x >= .06 && x <= .85,
    startFrames: x => Number.isInteger(x) && Number(x) >= 1 && Number(x) <= 30,
    endFrames: x => Number.isInteger(x) && Number(x) >= 1 && Number(x) <= 30,
    startMs: x => typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= 1000,
    releaseMs: x => typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= 1000,
    speedAssist: x => typeof x === "boolean",
    speedAssistRange: x => typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= .3,
    depthVeto: x => typeof x === "boolean",
    use3d: x => typeof x === "boolean",
    minStrokeLengthEnabled: x => typeof x === "boolean",
    minStrokePointsEnabled: x => typeof x === "boolean",
    recognitionThreshold: x => typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1,
    wantedRecognitionThreshold: x => typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1,
    lineStraightness: x => typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1,
    lineThinness: x => typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1,
    lineAngleTolerance: x => typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 45,
    lineAngleToleranceWanted: x => typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 90,
    thumbUpThreshold: x => typeof x === "number" && Number.isFinite(x) && x > 0 && x <= 1,
    thumbUpHoldMs: x => typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= 3000,
  };
  for (const [key, entry] of Object.entries(v)) if (!rules[key]?.(entry)) throw Error(`Invalid pinch config setting: ${key}`);
  const on = typeof v.on === "number" ? v.on : defaults.on;
  const off = typeof v.off === "number" ? v.off : defaults.off;
  const gap=typeof v.hysteresisGap === "number" ? v.hysteresisGap : defaults.hysteresisGap;
  if (off - on < gap - 1e-9) throw Error(`Pinch end ratio must be at least ${gap.toFixed(3)} above start ratio`);
  return v as Partial<Settings>;
}
