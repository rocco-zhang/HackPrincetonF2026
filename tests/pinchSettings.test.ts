import { describe, expect, it } from "vitest";
import { parsePinchSettings } from "../src/input/pinchSettings";
import personal from "../config/pinch.local.example.json";

describe("local pinch config", () => {
  it("accepts the requested personal settings including the exact 0.10 hysteresis gap", () => {
    expect(parsePinchSettings(personal)).toMatchObject({on:.15,off:.25,anchor:"thumb",timing:"frames",startFrames:1,endFrames:1,use3d:false,depthVeto:false,speedAssist:true,speedAssistRange:.1,variant:"C"});
  });
  it("rejects misspelled fields and invalid timing or ratio values", () => {
    for (const config of [{startFrame:1},{startFrames:0},{speedAssistRange:.5},{on:.4,off:.45},{speedAssist:"true"}]) {
      expect(() => parsePinchSettings(config)).toThrow();
    }
  });
});
