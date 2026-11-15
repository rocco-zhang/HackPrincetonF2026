import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@mediapipe/tasks-vision",()=>({FilesetResolver:{},GestureRecognizer:{}}));
import { observeHands, observationListeners, pinchDiagnostics, cancelHandStroke } from "../src/input/handTracker";
import { experiment } from "../src/input/pinchConfig";
import { calibrationRatio, type Observation } from "../src/input/pinchExperiment";
import { state } from "../src/state";

const original = {...experiment};
afterEach(() => {Object.assign(experiment,original);cancelHandStroke();});
function observation(ratio: number | null, t=0): Observation {
  const landmarks=Array.from({length:21},()=>({x:.4,y:.4,z:0}));
  landmarks[0].y=.7;landmarks[9].y=.5;
  landmarks[8].x+=.15*(ratio??0);
  return {t,landmarks:ratio===null?null:landmarks,world:null,width:640,height:480};
}

describe("live lab hand diagnostics",()=>{
  it("uses the visible right hand for distance, preview and calibration",()=>{
    experiment.use3d=false;experiment.depthVeto=false;
    const right=observation(.2);
    const sampled: Observation[]=[];
    const listener=(o:Observation)=>sampled.push(o);
    observationListeners.add(listener);
    try {
      observeHands(observation(null),right);
      const {hand,engine}=pinchDiagnostics();
      expect(hand).toBe(1);
      expect(engine.distancePx).toBeCloseTo(19.2);
      expect(engine.rawRatio).toBeCloseTo(.2);
      expect(state.landmarks).toBe(right.landmarks);
      expect(state.pinchRatio).toBeCloseTo(.2);
      expect(calibrationRatio(sampled[0])).toBeCloseTo(.2);
    } finally {observationListeners.delete(listener);}
  });
  it("refreshes measurements without processing strokes and clears them on tracking loss",()=>{
    observeHands(observation(.1),observation(null));
    cancelHandStroke(); // Gesture priority cancels drawing but must not block fresh measurements.
    observeHands(observation(.3,33),observation(null,33));
    expect(pinchDiagnostics().engine.rawRatio).toBeCloseTo(.3);
    expect(pinchDiagnostics().engine.inking).toBe(false);
    observeHands(observation(null,66),observation(null,66));
    expect(pinchDiagnostics().engine.distancePx).toBeNull();
    expect(state.handVisible).toBe(false);
  });
});
