import type { experiment } from "./pinchConfig";

/** Local dev defaults only; reject invalid files rather than silently mixing settings. */
export function parsePinchSettings(value: unknown): Partial<typeof experiment> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw Error("Pinch config must be an object");
  const v = value as Record<string, unknown>;
  const rules: Record<string, (x: unknown) => boolean> = {
    variant: x => x === "C" || x === "E",
    anchor: x => ["knuckle", "tip", "thumb", "pinch"].includes(String(x)),
    timing: x => x === "time" || x === "frames",
    on: x => typeof x === "number" && Number.isFinite(x) && x >= .05 && x <= .7,
    off: x => typeof x === "number" && Number.isFinite(x) && x >= .15 && x <= .85,
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
  };
  for (const [key, entry] of Object.entries(v)) if (!rules[key]?.(entry)) throw Error(`Invalid pinch config setting: ${key}`);
  const on = typeof v.on === "number" ? v.on : .28;
  const off = typeof v.off === "number" ? v.off : .5;
  if (off - on < .1 - 1e-9) throw Error("Pinch end ratio must be at least 0.10 above start ratio");
  return v as Partial<typeof experiment>;
}
