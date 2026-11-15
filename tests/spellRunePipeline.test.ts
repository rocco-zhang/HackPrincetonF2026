import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { initCastPipeline } from "../src/input/castPipeline";
import { emit, onInput, type InputEvent } from "../src/input/events";
import { state } from "../src/state";

beforeAll(()=>initCastPipeline());
afterEach(()=>{state.aslActive=false;state.spellRunesEnabled=false;state.spellCastingActive=false;state.mathActive=false;});
const rune=()=>Array.from({length:65},(_,i)=>{
  const t=i*Math.PI*2/64;return {x:400+110*Math.sin(t),y:300+45*Math.sin(2*t),t:i*33};
});

describe("reserved rune routing",()=>{
  it("recognizes runes during ASL and retains the originating hand",async()=>{
    state.aslActive=true;state.spellRunesEnabled=true;
    const events:InputEvent[]=[];const off=onInput(e=>events.push(e));
    try{
      emit({type:"strokeEnd",points:rune(),hand:1});await Promise.resolve();
      expect(events.filter(e=>e.type==="spellRune")).toHaveLength(1);
      expect(events.find(e=>e.type==="spellRune")).toMatchObject({hand:1,name:"infinity"});
      expect(events.some(e=>e.type==="symbol"||e.type==="fizzle")).toBe(false);
    }finally{off();}
  });
  it("marks the full rune synchronously so math cannot also consume it as a digit",async()=>{
    state.spellRunesEnabled=true;state.mathActive=true;
    const points=rune(),event:InputEvent={type:"strokeEnd",points:points.slice(3,-3),rawPoints:points};
    const events:InputEvent[]=[];const off=onInput(e=>events.push(e));
    try{
      emit(event);expect(event.rune).toBe("infinity");await Promise.resolve();
      expect(events.filter(e=>e.type==="spellRune")).toHaveLength(1);
      expect(events.some(e=>e.type==="symbol"||e.type==="fizzle")).toBe(false);
    }finally{off();}
  });
  it("cannot rearm a spell from another rune while already casting",async()=>{
    state.aslActive=true;state.spellRunesEnabled=true;state.spellCastingActive=true;
    const events:InputEvent[]=[];const off=onInput(e=>events.push(e));
    try{emit({type:"strokeEnd",points:rune()});await Promise.resolve();expect(events.some(e=>e.type==="spellRune")).toBe(false);}
    finally{off();}
  });
});
