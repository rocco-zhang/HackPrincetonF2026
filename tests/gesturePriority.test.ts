import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Recorded observations exercise the input path without loading a camera or WASM runtime.
vi.mock("@mediapipe/tasks-vision",()=>({FilesetResolver:{},GestureRecognizer:{}}));
import { processObservation, setReplaying } from "../src/input/handTracker";
import { initCastPipeline } from "../src/input/castPipeline";
import { experiment, type Observation } from "../src/input/pinchExperiment";
import { onInput, type InputEvent } from "../src/input/events";
import { state } from "../src/state";

const original={...experiment};
beforeAll(()=>initCastPipeline());
afterEach(()=>{
  setReplaying(false);Object.assign(experiment,original);
  state.langActive=false;
  state.spellCastingActive=false;state.spellGesturesEnabled=false;state.thumbUpHolding=false;state.mode="mouse";
});
function observation(t:number,score:number):Observation{
  const x=.4+t*.0001;
  const landmarks=Array.from({length:21},()=>({x,y:.4,z:0}));
  landmarks[0]={x,y:.7,z:0};landmarks[9]={x,y:.5,z:0};
  landmarks[4]={x,y:.4,z:0};landmarks[8]={x:x+.015,y:.4,z:0};
  return {t,landmarks,world:null,width:640,height:480,thumbUpScore:score};
}
function setup(casting:boolean){
  Object.assign(experiment,{buffered:false,timing:"frames",startFrames:1,endFrames:1,on:.28,off:.5,thumbUpThreshold:.8,thumbUpHoldMs:500});
  state.mode="hand";state.spellGesturesEnabled=true;state.spellCastingActive=casting;
  setReplaying(true);
}
describe("gesture priority during spell input",()=>{
  it("allows spell strokes to continue despite high thumbs-up confidence",()=>{
    setup(true);const events:InputEvent[]=[];const off=onInput(e=>events.push(e));
    try{
      for(let t=0;t<=600;t+=100)processObservation(observation(t,.95));
      expect(events.filter(e=>e.type==="strokeStart")).toHaveLength(1);
      expect(events.some(e=>e.type==="strokePoint")).toBe(true);
      expect(events.some(e=>e.type==="strokeCancel"||e.type==="spellGesture")).toBe(false);
      expect(state.inking).toBe(true);
    }finally{off();}
  });
  it("protects the original starter hold until release, then ignores later detections during casting",()=>{
    setup(false);const events:InputEvent[]=[];const off=onInput(e=>{
      events.push(e);
      if(e.type==="spellGesture")state.spellCastingActive=true;
    });
    try{
      for(let t=0;t<=600;t+=100)processObservation(observation(t,.95));
      expect(events.filter(e=>e.type==="spellGesture")).toHaveLength(1);
      expect(events.some(e=>e.type==="strokeStart")).toBe(false);
      processObservation(observation(700,.95));
      expect(events.some(e=>e.type==="strokeStart")).toBe(false);
      expect(state.thumbUpHolding).toBe(true);
      processObservation(observation(800,0));
      expect(events.some(e=>e.type==="strokeStart")).toBe(false);
      processObservation(observation(950,0));
      expect(events.filter(e=>e.type==="strokeStart")).toHaveLength(1);
      expect(state.thumbUpHolding).toBe(false);
      const cancellations=events.filter(e=>e.type==="strokeCancel").length;
      processObservation(observation(1050,.95));
      expect(events.filter(e=>e.type==="strokeCancel")).toHaveLength(cancellations);
      expect(events.filter(e=>e.type==="spellGesture")).toHaveLength(1);
    }finally{off();}
  });
});


describe("language submit gesture", () => {
  it("finishes pending ink before reserving the submit pose", () => {
    setup(false);
    state.langActive = true;
    const events: InputEvent[] = [];
    const off = onInput(e => events.push(e));
    try {
      for (let t = 0; t <= 200; t += 100) processObservation({ ...observation(t, 0), loveScore: 0 });
      expect(state.inking).toBe(true);
      for (let t = 300; t <= 900; t += 100) processObservation({ ...observation(t, 0), loveScore: .95 });
      const completed = events.filter(e => e.type === "strokeEnd");
      expect(completed).toHaveLength(1);
      expect(completed[0].type === "strokeEnd" && completed[0].points.length).toBeGreaterThan(1);
      expect(events.findIndex(e => e.type === "strokeEnd")).toBeLessThan(events.findIndex(e => e.type === "languageSubmit"));
    } finally { off(); }
  });

  it("submits once per hold, reserves drawing, and rearms after release", () => {
    setup(false);
    state.langActive = true;
    const events: InputEvent[] = [];
    const off = onInput(e => events.push(e));
    const frame = (t: number, loveScore: number) => processObservation({ ...observation(t, 0), loveScore });
    try {
      for (let t = 0; t <= 1000; t += 100) frame(t, .95);
      expect(events.filter(e => e.type === "languageSubmit")).toHaveLength(1);
      expect(events.some(e => e.type === "strokeStart" || e.type === "spellGesture")).toBe(false);
      frame(1100, 0);
      frame(1250, 0);
      for (let t = 1300; t <= 1900; t += 100) frame(t, .95);
      expect(events.filter(e => e.type === "languageSubmit")).toHaveLength(2);
    } finally { off(); }
  });
});
