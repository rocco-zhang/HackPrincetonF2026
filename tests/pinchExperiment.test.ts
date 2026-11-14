import { describe, expect, it, beforeEach } from "vitest";
import { INPUT } from "../src/config";
import { calibrationRatio, calibratePinch, experiment, PinchExperiment, type Observation, type Variant } from "../src/input/pinchExperiment";
import type { InputEvent } from "../src/input/events";
import { createDefaultRecognizer } from "../src/input/recognizer";

function observation(t:number, ratio:number|null, x=.4):Observation {
  const lm=Array.from({length:21},()=>({x,y:.4,z:0}));
  lm[0]={x,y:.7,z:0};lm[9]={x,y:.5,z:0};
  lm[4]={x,y:.4,z:0};lm[8]={x:x+(ratio??0)*.15,y:.4,z:0};
  return {t,landmarks:ratio===null?null:lm,world:null,width:640,height:480};
}
function setup(variant:Variant) {
  experiment.variant=variant;
  const events:InputEvent[]=[];
  const engine=new PinchExperiment(e=>events.push(e));
  const step=(t:number,r:number|null)=>engine.process(observation(t,r,.3+t*.0001),true,INPUT.drawBox);
  return {events,engine,step};
}
beforeEach(()=>Object.assign(experiment,{variant:"A",timing:"time",startFrames:2,endFrames:3,calibrated:false,speedAssist:false,speedAssistRange:.08,depthVeto:true,use3d:false,anchor:"knuckle",releaseMs:80,startMs:30,lostHandMs:300,on:.28,off:.5}));
describe("pinch experiment replay",()=>{
  it("keeps A's 180ms control delay and lets B split an observed 100ms opening",()=>{
    for(const variant of ["A","B"] as const){
      const {step,events}=setup(variant);
      for(let t=0;t<=300;t+=20)step(t,.1);
      for(let t=320;t<=420;t+=20)step(t,.8);
      for(let t=440;t<=600;t+=20)step(t,.1);
      expect(events.filter(e=>e.type==="strokeEnd")).toHaveLength(variant==="A"?0:1);
    }
  });
  it("uses configurable frame evidence without also waiting for milliseconds",()=>{
    const {step,engine,events}=setup("C");
    experiment.timing="frames";experiment.startFrames=3;experiment.endFrames=2;
    step(0,.1);step(10,.1);expect(engine.inking).toBe(false);
    step(20,.1);expect(engine.inking).toBe(true);
    step(30,.8);expect(engine.inking).toBe(true);
    step(40,.8);expect(engine.inking).toBe(false);
    expect(events.filter(e=>e.type==="strokeEnd")).toHaveLength(1);
  });
  it("applies personal thresholds with buffering on or off",()=>{
    for(const variant of ["C","E"] as const){
      const {step,engine}=setup(variant);
      experiment.calibrated=true;experiment.on=.4;experiment.off=.7;
      step(0,.35);step(40,.35);expect(engine.inking).toBe(true);
    }
  });
  it("uses a manually edited start ratio without requiring calibration",()=>{
    const {step,engine}=setup("C");experiment.on=.38;
    step(0,.35);step(40,.35);expect(engine.inking).toBe(true);
  });
  it("shows closing confirmation progress and the actual depth-veto blocker",()=>{
    const {step,engine}=setup("C");step(0,.1);
    expect(engine.gateReason).toContain("Start pending");
    const o=observation(40,.1);o.world=structuredClone(o.landmarks);o.world![8].z=.3;
    engine.process(o,true,INPUT.drawBox);
    expect(engine.gateReason).toContain("3D depth veto");expect(engine.inking).toBe(false);
  });
  it("can disable depth veto while retaining the 3D measurement",()=>{
    const {engine}=setup("C");experiment.depthVeto=false;
    for(const t of [0,40]){
      const o=observation(t,.1);o.world=structuredClone(o.landmarks);o.world![8].z=.3;
      engine.process(o,true,INPUT.drawBox);
    }
    expect(engine.ratio3).toBeGreaterThan(.5);expect(engine.ratio).toBeCloseTo(.1);
    expect(engine.inking).toBe(true);expect(engine.gateReason).not.toContain("veto");
  });
  it("uses normalized 3D as the primary signal with the same timing controls",()=>{
    const {engine}=setup("C");experiment.use3d=true;
    for(const t of [0,40]){
      const o=observation(t,.8);o.world=structuredClone(o.landmarks);
      o.world![0]={x:0,y:.1,z:0};o.world![9]={x:0,y:0,z:0};
      o.world![4]={x:0,y:0,z:0};o.world![8]={x:0,y:0,z:.01};
      expect(calibrationRatio(o)).toBeCloseTo(.1);
      engine.process(o,true,INPUT.drawBox);
    }
    expect(engine.rawRatio).toBeCloseTo(.8);expect(engine.ratio).toBeCloseTo(.1);
    expect(engine.inking).toBe(true);expect(engine.gateReason).not.toContain("veto");
  });
  it("does not silently use 2D when 3D is unavailable",()=>{
    const {engine,step}=setup("C");experiment.use3d=true;
    step(0,.1);step(40,.1);
    expect(engine.inking).toBe(false);expect(engine.ratio).toBeNull();
    expect(calibrationRatio(observation(60,.1))).toBeNull();
    expect(engine.gateReason).toContain("3D landmarks unavailable");
  });
  it("3D calibration ratio cancels shared scale and can reject a 2D overlap",()=>{
    experiment.use3d=true;const {engine}=setup("C");
    const o=observation(0,.1);o.world=structuredClone(o.landmarks);
    o.world![0]={x:0,y:.1,z:0};o.world![9]={x:0,y:0,z:0};
    o.world![4]={x:0,y:0,z:0};o.world![8]={x:0,y:0,z:.08};
    expect(calibrationRatio(o)).toBeCloseTo(.8);
    engine.process(o,true,INPUT.drawBox);
    const scaled={...o,t:40,world:o.world!.map(p=>({x:p.x*3,y:p.y*3,z:p.z*3}))};
    expect(calibrationRatio(scaled)).toBeCloseTo(.8);
    engine.process(scaled,true,INPUT.drawBox);expect(engine.inking).toBe(false);
  });
  it("low-speed assistance lowers release threshold but never releases a stationary closed pinch",()=>{
    for(const assist of [false,true]){
      experiment.variant="C";experiment.speedAssist=assist;
      const engine=new PinchExperiment(()=>{});
      for(let t=0;t<=200;t+=20)engine.process(observation(t,.1),true,INPUT.drawBox);
      expect(engine.inking).toBe(true);
      for(let t=220;t<=400;t+=20)engine.process(observation(t,.46),true,INPUT.drawBox);
      expect(engine.inking).toBe(!assist);
      expect(engine.effectiveOff).toBeCloseTo(assist?.42:.5);
    }
  });
  it("uses the configurable assistance range and respects hysteresis limits",()=>{
    for(const range of [0,.04,.3]){
      experiment.variant="C";experiment.speedAssist=true;experiment.speedAssistRange=range;
      const engine=new PinchExperiment(()=>{});
      engine.process(observation(0,.1),true,INPUT.drawBox);
      engine.process(observation(20,.1),true,INPUT.drawBox);
      expect(engine.effectiveOff).toBeCloseTo(Math.max(.38,.5-range));
      engine.process(observation(40,.1,.8),true,INPUT.drawBox);
      expect(engine.effectiveOff).toBeCloseTo(.5+range);
    }
  });
  it("bounds speed assistance and resets velocity on tracking loss",()=>{
    experiment.variant="C";experiment.speedAssist=true;
    const engine=new PinchExperiment(()=>{});
    engine.process(observation(0,.1,.2),true,INPUT.drawBox);
    engine.process(observation(20,.1,.4),true,INPUT.drawBox);
    expect(engine.normalizedSpeed).toBeGreaterThan(2);
    expect(engine.effectiveOff).toBeCloseTo(.58);
    engine.process(observation(40,null),true,INPUT.drawBox);
    expect(engine.normalizedSpeed).toBeNull();expect(engine.effectiveOff).toBeCloseTo(.5);
  });
  it("uses elapsed evidence rather than frame count for C",()=>{
    const {step,engine}=setup("C");step(0,.1);step(10,.1);expect(engine.inking).toBe(false);
    step(35,.1);expect(engine.inking).toBe(true);step(45,.8);step(120,.8);expect(engine.inking).toBe(true);
    step(130,.8);expect(engine.inking).toBe(false);
  });
  it("does not borrow missing-hand time for B's observed release",()=>{
    const {step,engine}=setup("B");step(0,.1);step(30,.1);
    step(60,null);step(130,null);step(200,null);
    step(220,.8);step(240,.8);step(260,.8);
    expect(engine.inking).toBe(true);step(300,.8);expect(engine.inking).toBe(false);
  });
  it("does not treat lost detections as a brief intentional opening",()=>{
    const {step,events,engine}=setup("C");step(0,.1);step(40,.1);step(80,null);step(160,null);
    expect(engine.inking).toBe(true);step(200,.1);expect(events.filter(e=>e.type==="strokeEnd")).toHaveLength(0);
  });
  it("terminates across long unobserved gaps without carrying start evidence",()=>{
    const {step,engine,events}=setup("C");step(0,.1);step(40,.1);step(400,.1);
    expect(engine.inking).toBe(false);expect(events.filter(e=>e.type==="strokeEnd")).toHaveLength(1);
    step(440,.1);expect(engine.inking).toBe(true);
  });
  it("never commits a matching prefix and consumes each released segment once",()=>{
    const {step,events}=setup("F");
    for(let t=0;t<=400;t+=20)step(t,.1);
    expect(events.filter(e=>e.type==="strokeEnd")).toHaveLength(0);
    for(let t=420;t<=900;t+=20)step(t,.8);
    const ends=events.filter(e=>e.type==="strokeEnd");expect(ends).toHaveLength(1);
    for(let t=920;t<=1200;t+=20)step(t,.1);
    for(let t=1220;t<=1400;t+=20)step(t,.8);
    const all=events.filter(e=>e.type==="strokeEnd");expect(all).toHaveLength(2);
    if(all[0].type==="strokeEnd"&&all[1].type==="strokeEnd")expect(Math.min(...all[1].points.map(p=>p.t))).toBeGreaterThan(Math.max(...all[0].points.map(p=>p.t)));
  });
  it("does not emit a cast when changing algorithms mid-stroke",()=>{
    const {step,events}=setup("A");step(0,.1);step(40,.1);experiment.variant="C";step(80,.1);
    expect(events.filter(e=>e.type==="strokeEnd")).toHaveLength(0);
  });
  it("retains the world-landmark depth veto",()=>{
    const {engine}=setup("C");
    for(const t of [0,40,80]) {
      const o=observation(t,.1);o.world=structuredClone(o.landmarks);o.world![8].z=.3;
      engine.process(o,true,INPUT.drawBox);
    }
    expect(engine.ratio3).toBeGreaterThan(.5);expect(engine.inking).toBe(false);
  });
  it("runs F's bounded scoring through the real recognizer only after release",()=>{
    experiment.variant="F";
    const r=createDefaultRecognizer([]), events:InputEvent[]=[];
    const engine=new PinchExperiment(e=>events.push(e),p=>r.recognize(p));
    for(let t=0;t<=500;t+=20)engine.process(observation(t,.1,.3+t*.0005),true,INPUT.drawBox);
    expect(engine.components).toHaveLength(0);
    for(let t=520;t<=650;t+=20)engine.process(observation(t,.8,.55),true,INPUT.drawBox);
    expect(engine.components.length).toBeGreaterThan(0);expect(engine.components.length).toBeLessThanOrEqual(9);
    expect(events.filter(e=>e.type==="strokeEnd")).toHaveLength(1);
    expect(engine.components.every(c=>Number.isFinite(c.total))).toBe(true);
  });
  it("rejects overlapping calibration distributions and bounds accepted thresholds",()=>{
    expect(calibratePinch(Array(30).fill(.3),Array(30).fill(.35))).toBe(false);
    expect(calibratePinch(Array(30).fill(.15),Array(30).fill(.8))).toBe(true);
    expect(experiment.on).toBeGreaterThan(.15);expect(experiment.off).toBeGreaterThan(experiment.on+.1);
    expect(experiment.off).toBeLessThanOrEqual(.85);
  });
});
