import { afterEach, describe, expect, it } from "vitest";
import { experiment } from "../src/input/pinchConfig";
import { createDefaultRecognizer } from "../src/input/recognizer";
import { isStrokeTooSmall } from "../src/input/strokeDetector";
import { BASE_SHAPES, jitteredStroke, mulberry32 } from "../src/input/shapes";

const original = {...experiment};
afterEach(()=>Object.assign(experiment,original));

describe("recognition controls",()=>{
  it("can disable either stroke minimum while keeping the two-point requirement",()=>{
    const short=Array.from({length:8},(_,i)=>({x:i,y:0}));
    expect(isStrokeTooSmall(short)).toBe(true);
    experiment.minStrokeLengthEnabled=false;
    expect(isStrokeTooSmall(short)).toBe(false);
    expect(isStrokeTooSmall(short.slice(0,3))).toBe(true);
    experiment.minStrokePointsEnabled=false;
    expect(isStrokeTooSmall(short.slice(0,3))).toBe(false);
    expect(isStrokeTooSmall([])).toBe(true);
    expect(isStrokeTooSmall(short.slice(0,1))).toBe(true);
    expect(createDefaultRecognizer().recognize(short.slice(0,3)).accepted).toBe(true);
  });
  it("honors normal and wanted template thresholds independently",()=>{
    const recognizer=createDefaultRecognizer();
    const stroke=jitteredStroke(BASE_SHAPES.circle[0],mulberry32(42),{size:200,points:40,pointNoise:.03});
    const baseline=recognizer.recognize(stroke,[],0);
    expect(baseline.method).toBe("dollar");expect(baseline.score).toBeLessThan(1);
    experiment.recognitionThreshold=1;experiment.wantedRecognitionThreshold=1;
    expect(recognizer.recognize(stroke).accepted).toBe(false);
    experiment.recognitionThreshold=0;
    expect(recognizer.recognize(stroke).accepted).toBe(true);
    experiment.recognitionThreshold=1;experiment.wantedRecognitionThreshold=0;
    expect(recognizer.recognize(stroke,[baseline.best!.name]).accepted).toBe(true);
    experiment.wantedRecognitionThreshold=1;
    expect(recognizer.recognize(stroke,[baseline.best!.name]).accepted).toBe(false);
  });
});
