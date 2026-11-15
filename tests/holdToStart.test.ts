import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Phaser from "phaser";
vi.mock("phaser", () => ({ default: { Scenes: { Events: { SHUTDOWN: "shutdown" } } } }));
import { HoldToStart } from "../src/game/systems/HoldToStart";
import { emit } from "../src/input/events";
import { PinchExperiment, type Observation } from "../src/input/pinchExperiment";
import { experiment } from "../src/input/pinchConfig";
import { INPUT } from "../src/config";

const original = { ...experiment };
let shutdown: () => void;
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(performance, "now").mockImplementation(() => Date.now());
});
afterEach(() => {
  shutdown();
  Object.assign(experiment, original);
  vi.restoreAllMocks();
  vi.useRealTimers();
});
function setup() {
  const graphic = { setDepth() { return this; }, setStrokeStyle() { return this; }, setPosition() { return this; }, setRadius() { return this; }, setVisible() { return this; }, clear() {}, lineStyle() {}, beginPath() {}, arc() {}, strokePath() {} };
  const scene = { add: { graphics: () => graphic, circle: () => graphic }, events: { once: (_event: string, fn: () => void) => { shutdown = fn; } }, input: {} } as unknown as Phaser.Scene;
  const done = vi.fn();
  return { hold: new HoldToStart(scene, 600, null, done), done };
}
function cursor(inking: boolean, mouse = false) {
  emit({ type: "cursor", p: { x: 300, y: 300, t: performance.now() }, inking, ...(mouse ? { src: "mouse" as const } : {}) });
}
describe("rematch hold", () => {
  it("requires fresh hand evidence throughout the hold", () => {
    const {hold, done} = setup();
    cursor(true);
    vi.advanceTimersByTime(650); hold.update();
    expect(done).not.toHaveBeenCalled();
    for (let i = 0; i <= 6; i++) { cursor(true); hold.update(); vi.advanceTimersByTime(100); }
    expect(done).toHaveBeenCalledTimes(1);
  });
  it("cancels when the live pinch pipeline loses a hand", () => {
    const {hold, done} = setup();
    Object.assign(experiment, { startFrames: 1, timing: "frames", buffered: false });
    const engine = new PinchExperiment();
    const landmarks = Array.from({length:21}, () => ({x:.4,y:.4,z:0}));
    landmarks[0].y = .7; landmarks[9].y = .5; landmarks[8].x = .41;
    const observation: Observation = {t:0,landmarks,world:null,width:640,height:480};
    engine.process(observation,true,INPUT.drawBox);
    vi.advanceTimersByTime(100);
    engine.process({...observation,t:100,landmarks:null},true,INPUT.drawBox);
    vi.advanceTimersByTime(600); hold.update();
    expect(done).not.toHaveBeenCalled();
  });
  it("keeps a mouse hold valid without repeated pointer movement", () => {
    const {hold,done} = setup(); cursor(true,true);
    vi.advanceTimersByTime(650); hold.update();
    expect(done).toHaveBeenCalledTimes(1);
  });
  it("cancels a hand hold on stroke cancellation", () => {
    const {hold,done} = setup(); cursor(true);
    emit({type:"strokeCancel",hand:0});
    vi.advanceTimersByTime(650); hold.update();
    expect(done).not.toHaveBeenCalled();
  });
  it("keeps the holding hand independent of the other hand's release", () => {
    const {hold,done} = setup();
    for (let i = 0; i <= 6; i++) {
      cursor(true);
      emit({type:"cursor",p:{x:500,y:300,t:performance.now()},inking:false,hand:1});
      emit({type:"strokeCancel",hand:1});
      hold.update();vi.advanceTimersByTime(100);
    }
    expect(done).toHaveBeenCalledTimes(1);
  });
});
