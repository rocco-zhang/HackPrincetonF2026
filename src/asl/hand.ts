// ASL fingerspelling from MediaPipe's 21 hand landmarks. No DOM here, so it can be unit-tested.
//
// Two sources decide what letter a hand is making:
//   1. a small neural network trained on a public dataset (model.json, built by scripts/asl/train.py)
//   2. your own recorded examples (the ASL trainer, R on the title screen), which take priority
//      for every letter you have recorded.
// J and Z are left out: they are movements, not handshapes.

import { featureDistance, rotateFeatures } from "./features";
import modelJson from "./model.json";

export const ASL_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y"] as const;
export type AslLetter = (typeof ASL_LETTERS)[number];
/** What you can record: any letter, or "rest" = your relaxed hand, which must read as no letter. */
export type AslClass = AslLetter | "rest";
export const ASL_CLASSES: AslClass[] = [...ASL_LETTERS, "rest"];

export const ASL = {
  minConfidence: 0.6, // the model must be at least this sure
  // distance to your nearest recorded example, in palm sizes per landmark
  sureMatch: 0.18, // this close: it's yours, whatever the model thinks
  looseMatch: 0.35, // this close: it's yours unless the model is sure of a letter you haven't recorded
  holdMs: 450, // hold a shape this long to cast it
  recordFrames: 30, // examples captured per recording
};

type Model = {
  source: string;
  letters: string[];
  layers: { w: number[][]; b: number[] }[];
  prototypes: Record<string, number[]>;
  checkAccuracy: number;
};
const model = modelJson as unknown as Model;

export const MODEL_SOURCE = model.source;
/** Share of a second public dataset the model gets right (see README). */
export const MODEL_CHECK_ACCURACY = model.checkAccuracy;
/** A real example of each letter from the training data, used to draw the reference cards. */
export const prototype = (letter: AslLetter): number[] => model.prototypes[letter];

/** The trained network: features → most likely letter and how sure it is. */
export function modelPredict(f: number[]): { letter: AslLetter; p: number } {
  let a = f;
  model.layers.forEach((layer, li) => {
    const last = li === model.layers.length - 1;
    a = layer.w.map((row, j) => {
      let s = layer.b[j];
      for (let i = 0; i < row.length; i++) s += row[i] * a[i];
      return last ? s : Math.max(0, s);
    });
  });
  const max = Math.max(...a);
  const exps = a.map((v) => Math.exp(v - max));
  const sum = exps.reduce((x, y) => x + y, 0);
  let best = 0;
  for (let i = 1; i < exps.length; i++) if (exps[i] > exps[best]) best = i;
  return { letter: model.letters[best] as AslLetter, p: exps[best] / sum };
}

export type AslExamples = Partial<Record<AslClass, number[][]>>;
export type AslReading = { letter: AslLetter | null; confidence: number; source: "yours" | "model" | null };

/** Model + your recorded examples. */
export class AslClassifier {
  private mine: { cls: AslClass; f: number[] }[] = [];
  private recorded = new Set<AslClass>();

  setExamples(examples: AslExamples) {
    this.mine = [];
    this.recorded = new Set();
    for (const cls of ASL_CLASSES) {
      const list = examples[cls];
      if (!list?.length) continue;
      this.recorded.add(cls);
      // also keep each example turned a little either way, so a slightly tilted hand still matches
      for (const f of list) for (const deg of [-12, 0, 12]) this.mine.push({ cls, f: deg ? rotateFeatures(f, deg) : f });
    }
  }

  classify(f: number[]): AslReading {
    let near: AslClass | null = null;
    let dist = Infinity;
    for (const m of this.mine) {
      const d = featureDistance(f, m.f);
      if (d < dist) [dist, near] = [d, m.cls];
    }
    const yours = (): AslReading => ({ letter: near === "rest" ? null : near, confidence: Math.max(0, 1 - dist / ASL.looseMatch), source: "yours" });
    if (near && dist < ASL.sureMatch) return yours();
    const m = modelPredict(f);
    // the model only speaks for letters you haven't recorded: recording a letter replaces its idea of it
    if (m.p >= ASL.minConfidence && !this.recorded.has(m.letter)) return { letter: m.letter, confidence: m.p, source: "model" };
    if (near && dist < ASL.looseMatch) return yours();
    return { letter: null, confidence: 0, source: null };
  }
}

/** Turns per-frame letters into casts: a shape has to be held for `holdMs`, and fires once per hold. */
export class AslCaster {
  private letter: AslLetter | null = null;
  private since = 0;
  private fired = false;

  constructor(private holdMs = ASL.holdMs) {}

  /** Returns the letter to cast on the frame the hold completes, otherwise null. */
  update(letter: AslLetter | null, now: number): AslLetter | null {
    if (letter !== this.letter) {
      this.letter = letter;
      this.since = now;
      this.fired = false;
      return null;
    }
    if (letter && !this.fired && now - this.since >= this.holdMs) {
      this.fired = true;
      return letter;
    }
    return null;
  }

  /** 0–1 while a shape is being held, 1 once it has fired. */
  progress(now: number) {
    if (!this.letter) return 0;
    return this.fired ? 1 : Math.min(1, (now - this.since) / this.holdMs);
  }

  reset() {
    this.letter = null;
    this.fired = false;
  }
}
