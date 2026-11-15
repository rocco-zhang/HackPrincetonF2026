import { afterEach, describe, expect, it } from "vitest";
import { experiment } from "../src/input/pinchConfig";
import { createDefaultRecognizer, lineCheck, measureLine } from "../src/input/recognizer";
import { isStrokeTooSmall } from "../src/input/strokeDetector";
import { BASE_SHAPES, densify, jitteredStroke, mulberry32 } from "../src/input/shapes";

const original = {...experiment};
afterEach(()=>Object.assign(experiment,original));

describe("recognition controls",()=>{
  it("can accept an endpoint hook by lowering the straightness threshold",()=>{
    const hooked=densify([{x:0,y:0},{x:300,y:0},{x:300,y:80}],48);
    const metrics=measureLine(hooked)!;
    expect(metrics.straightness).toBeLessThan(.86);
    expect(lineCheck(hooked)).toBeNull();
    experiment.lineStraightness=.75;
    expect(lineCheck(hooked)?.kind).toBe("hline");
    expect(createDefaultRecognizer().recognize(hooked).method).toBe("line");
  });
  it("controls thickness separately from straightness",()=>{
    const bent=densify([{x:0,y:0},{x:150,y:100},{x:300,y:0}],48);
    experiment.lineStraightness=.75;
    expect(measureLine(bent)!.thinness).toBeGreaterThan(.28);
    expect(lineCheck(bent)).toBeNull();
    experiment.lineThinness=.5;
    expect(lineCheck(bent)?.kind).toBe("hline");
  });
  it("uses the configured normal and wanted angle tolerances",()=>{
    const slanted=densify([{x:0,y:0},{x:300,y:300*Math.tan(40*Math.PI/180)}],48);
    expect(lineCheck(slanted)?.kind).toBe("diagonal");
    expect(lineCheck(slanted,["hline"])?.kind).toBe("hline");
    experiment.lineAngleToleranceWanted=30;
    expect(lineCheck(slanted,["hline"])?.kind).toBe("diagonal");
    experiment.lineAngleTolerance=45;
    expect(lineCheck(slanted)?.kind).toBe("hline");
  });
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
