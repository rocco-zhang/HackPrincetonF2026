import { describe, expect, it } from "vitest";
import { GestureGate } from "../src/input/gestureGate";

describe("held thumbs-up gate",()=>{
  it("supports an immediate zero-duration gate without repeating a held gesture",()=>{
    const gate=new GestureGate();
    expect(gate.update(.8,0,.8,0)).toBe(true);
    expect(gate.update(.9,100,.8,0)).toBe(false);
  });
  it("fires when time completes while the gesture is still held, without a release",()=>{
    const gate=new GestureGate();
    for(let t=0;t<500;t+=100)expect(gate.update(.9,t,.8,500)).toBe(false);
    expect(gate.update(.9,500,.8,500)).toBe(true);
    expect(gate.holding).toBe(true);expect(gate.progress).toBe(1);
  });
  it("pauses through brief confidence dips instead of losing the whole hold",()=>{
    const gate=new GestureGate();
    gate.update(.9,0,.8,200);gate.update(.9,100,.8,200);
    gate.update(.79,150,.8,200);expect(gate.progress).toBe(.5);
    expect(gate.update(.9,200,.8,200)).toBe(false);
    expect(gate.update(.9,250,.8,200)).toBe(true);
  });
  it("resets evidence after a sustained dip and never activates on a low-confidence frame",()=>{
    const gate=new GestureGate();
    gate.update(.9,0,.8,200);gate.update(.9,100,.8,200);
    expect(gate.update(.79,200,.8,200)).toBe(false);
    expect(gate.update(.79,300,.8,200)).toBe(false);
    expect(gate.update(.79,330,.8,200)).toBe(false);expect(gate.progress).toBe(0);
    expect(gate.update(.9,400,.8,200)).toBe(false);
    expect(gate.update(.9,500,.8,200)).toBe(false);
    expect(gate.update(.9,600,.8,200)).toBe(true);
  });
  it("fires only once per continuous hold and rearms after leaving the gesture",()=>{
    const gate=new GestureGate();
    gate.update(1,0,.8,100);expect(gate.update(1,100,.8,100)).toBe(true);
    for(let t=200;t<=1000;t+=100)expect(gate.update(1,t,.8,100)).toBe(false);
    gate.update(0,1100,.8,100);gate.update(0,1230,.8,100);gate.update(1,1300,.8,100);
    expect(gate.update(1,1400,.8,100)).toBe(true);
  });
  it("does not carry unobserved pending time across a tracking gap",()=>{
    const gate=new GestureGate();
    gate.update(.9,0,.8,200);gate.update(.9,100,.8,200);
    expect(gate.update(.9,600,.8,200)).toBe(false);
    expect(gate.update(.9,700,.8,200)).toBe(false);
    expect(gate.update(.9,800,.8,200)).toBe(true);
    // A gap after firing must not make the same held gesture fire again.
    expect(gate.update(.9,1400,.8,200)).toBe(false);
    expect(gate.update(.9,1500,.8,200)).toBe(false);
    expect(gate.update(.9,1600,.8,200)).toBe(false);
  });
  it("keeps the two hands' evidence separate",()=>{
    const left=new GestureGate(),right=new GestureGate();
    left.update(1,0,.8,200);right.update(0,0,.8,200);
    left.update(1,100,.8,200);right.update(0,100,.8,200);
    expect(left.update(0,200,.8,200)).toBe(false);
    expect(right.update(1,200,.8,200)).toBe(false);
    right.update(1,300,.8,200);expect(right.update(1,400,.8,200)).toBe(true);
  });
  it("uses edited thresholds and rejects invalid confidence",()=>{
    const gate=new GestureGate();
    expect(gate.update(.7,0,.8,100)).toBe(false);
    expect(gate.update(.7,100,.8,100)).toBe(false);
    expect(gate.update(.7,200,.6,100)).toBe(false);
    expect(gate.update(.7,300,.6,100)).toBe(true);
    expect(gate.update(NaN,400,.6,100)).toBe(false);expect(gate.holding).toBe(false);
  });
});
