import { afterEach, expect, it, vi } from "vitest";
vi.mock("@mediapipe/tasks-vision",()=>({FilesetResolver:{},GestureRecognizer:{}}));
import { processObservation, setReplaying } from "../src/input/handTracker";
import { missingHandTail } from "../src/input/pinchReplay";
import { experiment } from "../src/input/pinchConfig";
import { onInput, type InputEvent } from "../src/input/events";
import { state } from "../src/state";
import type { Observation } from "../src/input/pinchExperiment";

const original = { ...experiment };
afterEach(() => {
  setReplaying(false);
  Object.assign(experiment, original);
  state.spellGesturesEnabled = false;
  state.mode = "mouse";
});

it("ends a recording during a pending thumbs-up hold without inventing activation", () => {
  Object.assign(experiment, { thumbUpThreshold: .5, thumbUpHoldMs: 250 });
  state.mode = "hand";
  state.spellGesturesEnabled = true;
  setReplaying(true);
  const events: InputEvent[] = [];
  const off = onInput(e => events.push(e));
  const last: Observation = { t: 100, landmarks: null, world: null, width: 640, height: 480, thumbUpScore: .95 };
  try {
    processObservation({ ...last, t: 0 });
    processObservation(last);
    for (const o of missingHandTail(last, experiment.lostHandMs)) processObservation(o);
    expect(events.some(e => e.type === "spellGesture")).toBe(false);
    expect(state.thumbUpHolding).toBe(false);
    expect(state.thumbUpScore).toBe(0);
  } finally { off(); }
});
