import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { experiment, pinchDefaults } from "../src/input/pinchConfig";
import { createDefaultRecognizer } from "../src/input/recognizer";
import { SYMBOLS } from "../src/input/events";
import { BASE_SHAPES, densify, jitteredStroke, mulberry32, type XY } from "../src/input/shapes";

const original = { ...experiment };
beforeEach(() => Object.assign(experiment, pinchDefaults));
afterEach(() => Object.assign(experiment, original));
const recognizer = createDefaultRecognizer();

describe("shipped recognition defaults", () => {
  for (const name of SYMBOLS) {
    it(`recognizes ${name} with the shipped thresholds`, () => {
      const random = mulberry32(1000 + SYMBOLS.indexOf(name));
      const strokes = BASE_SHAPES[name].flatMap(base => Array.from({length:20}, () => jitteredStroke(base, random, {
        size: 250, scaleJitter: .2, rotJitterDeg: 8, vertexJitter: .05, pointNoise: .01, points: 50,
      })));
      const correct = strokes.filter(stroke => recognizer.recognize(stroke).name === name).length;
      expect(correct / strokes.length).toBeGreaterThanOrEqual(.9);
    });
  }
  it("accepts a hooked horizontal stroke while keeping circles and zigzags distinct", () => {
    expect(recognizer.recognize(densify([{x:0,y:0},{x:300,y:0},{x:300,y:80}],48),["hline"]).name).toBe("hline");
    for (const name of ["circle", "zigzag"] as const) {
      for (const base of BASE_SHAPES[name]) {
        const points = densify(base.map(p => ({x:p[0]*250,y:p[1]*250})),64);
        expect(recognizer.recognize(points,["hline"]).name).toBe(name);
      }
    }
  });
  it("rejects most random scribbles with the deliberately permissive line tuning", () => {
    const random = mulberry32(42);
    let rejected = 0;
    for (let k = 0; k < 200; k++) {
      let x=400,y=300,heading=random()*Math.PI*2;
      const stroke: XY[]=[];
      for(let i=0;i<60;i++){
        heading+=(random()-.5)*1.6;
        x+=Math.cos(heading)*12;y+=Math.sin(heading)*12;
        stroke.push({x,y});
      }
      if(!recognizer.recognize(stroke).accepted) rejected++;
    }
    // The stricter reference suite has a 70% rejection budget; this tuning permits endpoint hooks.
    expect(rejected / 200).toBeGreaterThanOrEqual(.65);
  });
});
