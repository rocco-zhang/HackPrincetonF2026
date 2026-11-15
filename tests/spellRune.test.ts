import { describe, expect, it } from "vitest";
import { isInfinityRune } from "../src/input/spellRune";
import { BASE_SHAPES, LANG_BASE_SHAPES, jitteredStroke, mulberry32 } from "../src/input/shapes";
import { DIGIT_SHAPES } from "../src/input/digits";

function infinity(phase=0,direction=1){
  return Array.from({length:81},(_,i)=>{
    const t=phase+direction*i*Math.PI*2/80;
    return {x:400+110*Math.sin(t),y:300+45*Math.sin(2*t)};
  });
}

describe("reserved infinity starter",()=>{
  it("accepts a horizontal infinity in either direction and at different starting points",()=>{
    for(let phase=0;phase<12;phase++)for(const direction of [-1,1]){
      expect(isInfinityRune(infinity(phase*Math.PI/6,direction)),`${phase} / ${direction}`).toBe(true);
    }
  });
  it("accepts modest tracking jitter",()=>{
    const random=mulberry32(21);
    const points=infinity().map(p=>({x:p.x+(random()-.5)*3,y:p.y+(random()-.5)*3}));
    expect(isInfinityRune(points)).toBe(true);
  });
  it("rejects ordinary monster shapes, language marks, and upright math digits",()=>{
    const random=mulberry32(9);
    for(const [name,shapes] of Object.entries({...BASE_SHAPES,...LANG_BASE_SHAPES,...DIGIT_SHAPES})){
      for(const shape of shapes)for(let i=0;i<4;i++){
        const sample=jitteredStroke(shape,random,{size:220,points:64,rotJitterDeg:8,pointNoise:.01,scaleJitter:.1});
        expect(isInfinityRune(sample),name).toBe(false);
      }
    }
  });
  it("rejects prefixes, tiny loops, and insufficient samples",()=>{
    const points=infinity();
    expect(isInfinityRune(points.slice(0,42))).toBe(false);
    expect(isInfinityRune(points.slice(0,16))).toBe(false);
    expect(isInfinityRune(points.map(p=>({x:p.x*.1,y:p.y*.1})))).toBe(false);
  });
});
