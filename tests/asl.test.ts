import { describe, expect, it } from "vitest";
import { aslFeatures, featureDistance, rotateFeatures, type Lm } from "../src/asl/features";
import { ASL_LETTERS, AslCaster, AslClassifier, modelPredict, prototype } from "../src/asl/hand";
import model from "../src/asl/model.json";

// A prototype is already in feature space; turn it back into "image landmarks" to test aslFeatures.
const asLandmarks = (f: number[], opts: { scale?: number; dx?: number; dy?: number; aspect?: number; mirror?: boolean } = {}): Lm[] => {
  const { scale = 0.08, dx = 0.5, dy = 0.6, aspect = 4 / 3, mirror = false } = opts;
  return Array.from({ length: 21 }, (_, i) => ({
    x: dx + ((mirror ? -1 : 1) * f[i * 3] * scale) / aspect,
    y: dy + f[i * 3 + 1] * scale,
    z: (f[i * 3 + 2] * scale) / aspect,
  }));
};

describe("aslFeatures", () => {
  const f = prototype("L");

  it("does not depend on where the hand is, how big it is, or the frame's shape", () => {
    const a = aslFeatures(asLandmarks(f), 4 / 3);
    const b = aslFeatures(asLandmarks(f, { scale: 0.2, dx: 0.2, dy: 0.3, aspect: 16 / 9 }), 16 / 9);
    expect(featureDistance(a, b)).toBeLessThan(1e-6);
    expect(featureDistance(a, f)).toBeLessThan(0.01); // and it reproduces the training-side features
  });

  it("reads a mirrored hand (left hand, or a mirrored camera) as the same shape", () => {
    const a = aslFeatures(asLandmarks(f), 4 / 3);
    const b = aslFeatures(asLandmarks(f, { mirror: true }), 4 / 3);
    expect(featureDistance(a, b)).toBeLessThan(1e-6);
  });
});

describe("trained model", () => {
  const check = (model as unknown as { protoCheck: Record<string, [string, number]> }).protoCheck;

  it("covers the 24 static letters", () => {
    expect(model.letters).toEqual([...ASL_LETTERS]);
    expect(ASL_LETTERS).not.toContain("J");
    expect(ASL_LETTERS).not.toContain("Z");
  });

  it("gives the same answers here as in the Python training script", () => {
    for (const letter of ASL_LETTERS) {
      const got = modelPredict(prototype(letter));
      expect(got.letter, letter).toBe(check[letter][0]);
      expect(got.p).toBeCloseTo(check[letter][1], 2);
    }
  });

  it("recognises the typical example of every letter", () => {
    for (const letter of ASL_LETTERS) expect(modelPredict(prototype(letter)).letter).toBe(letter);
  });
});

describe("AslClassifier", () => {
  it("uses the model when nothing has been recorded", () => {
    const c = new AslClassifier();
    const r = c.classify(prototype("B"));
    expect(r.letter).toBe("B");
    expect(r.source).toBe("model");
  });

  it("lets your own examples override the model", () => {
    const c = new AslClassifier();
    // teach it that this B-shaped hand is your "W"
    c.setExamples({ W: [prototype("B")] });
    const r = c.classify(prototype("B"));
    expect(r.letter).toBe("W");
    expect(r.source).toBe("yours");
    // a slightly tilted version still matches your example
    expect(c.classify(rotateFeatures(prototype("B"), 8)).letter).toBe("W");
    // letters you haven't recorded still come from the model
    expect(c.classify(prototype("Y"))).toMatchObject({ letter: "Y", source: "model" });
  });

  it("stops trusting the model for a letter once you record it", () => {
    const c = new AslClassifier();
    c.setExamples({ B: [prototype("L")] }); // your "B" looks nothing like the model's
    const r = c.classify(prototype("B"));
    expect(r.letter).not.toBe("B");
  });

  it("reads a recorded relaxed hand as no letter", () => {
    const c = new AslClassifier();
    c.setExamples({ rest: [prototype("C")] });
    expect(c.classify(prototype("C")).letter).toBeNull();
  });
});

describe("AslCaster", () => {
  it("fires once after the hold time, and again only after the shape changes", () => {
    const c = new AslCaster(450);
    expect(c.update("V", 0)).toBeNull();
    expect(c.update("V", 300)).toBeNull();
    expect(c.progress(300)).toBeCloseTo(300 / 450);
    expect(c.update("V", 460)).toBe("V");
    expect(c.update("V", 2000)).toBeNull();
    expect(c.update(null, 2100)).toBeNull();
    expect(c.update("V", 2200)).toBeNull();
    expect(c.update("V", 2700)).toBe("V");
  });

  it("restarts the hold when the shape flickers to another letter", () => {
    const c = new AslCaster(450);
    c.update("U", 0);
    c.update("V", 400);
    expect(c.update("V", 500)).toBeNull();
    expect(c.update("V", 860)).toBe("V");
  });
});
