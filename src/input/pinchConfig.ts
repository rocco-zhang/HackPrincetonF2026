import defaults from "../../config/pinch.defaults.json";
import { parsePinchSettings } from "./pinchSettings";

// One checked, versioned baseline for both development and production.
parsePinchSettings(defaults);
export const pinchDefaults = Object.freeze({
  ...defaults,
  anchor: defaults.anchor as "knuckle" | "tip" | "thumb" | "pinch",
  timing: defaults.timing as "time" | "frames",
});

export const experiment = {
  version: "pinch-v1",
  ...pinchDefaults,
  calibrated: false,
  lostHandMs: 300, historyMs: 750, prefixMs: 80,
};
