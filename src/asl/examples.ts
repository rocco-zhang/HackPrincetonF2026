// Your own recorded ASL examples, kept in two places so they survive restarts:
//   - data/asl-examples.json in the repo, written through the dev server (see vite.config.ts).
//     It is bundled into the build, so it can be committed and shared with teammates.
//   - this browser's localStorage, as the fallback when there is no dev server (the deployed site).
import { ASL_CLASSES, type AslClass, type AslExamples } from "./hand";

const STORAGE_KEY = "spellcam.asl.examples.v1";
const FILE_URL = "./asl-examples.json";
const SAVE_URL = "./__asl-examples";

type Saved = { savedAt: number; examples: AslExamples };

let examples: AslExamples = {};
let onChange: (e: AslExamples) => void = () => {};

function clean(raw: unknown): Saved | null {
  const s = raw as Saved | null;
  if (!s || typeof s !== "object" || typeof s.examples !== "object" || !s.examples) return null;
  const out: AslExamples = {};
  for (const cls of ASL_CLASSES) {
    const list = (s.examples as AslExamples)[cls];
    if (Array.isArray(list)) out[cls] = list.filter((f) => Array.isArray(f) && f.length === 63 && f.every(Number.isFinite));
  }
  return { savedAt: Number(s.savedAt) || 0, examples: out };
}

/** Load whichever copy was saved last. Call once at startup; `listener` hears every later change too. */
export async function loadAslExamples(listener: (e: AslExamples) => void) {
  onChange = listener;
  let local: Saved | null = null;
  try {
    local = clean(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"));
  } catch {
    // unreadable storage: treat as empty
  }
  let file: Saved | null = null;
  try {
    const res = await fetch(FILE_URL, { cache: "no-store" });
    if (res.ok) file = clean(await res.json());
  } catch {
    // no file: fine
  }
  const best = [local, file].filter((s): s is Saved => !!s).sort((a, b) => b.savedAt - a.savedAt)[0];
  examples = best?.examples ?? {};
  onChange(examples);
}

/** Where the last save ended up, for the trainer to show. */
export let lastSave: "file" | "browser" | "failed" | null = null;

async function save() {
  onChange(examples);
  const body = JSON.stringify({ savedAt: Date.now(), examples } satisfies Saved);
  let browser = false;
  try {
    localStorage.setItem(STORAGE_KEY, body);
    browser = true;
  } catch {
    // storage full or blocked
  }
  let file = false;
  try {
    file = (await fetch(SAVE_URL, { method: "POST", headers: { "content-type": "application/json" }, body })).ok;
  } catch {
    // no dev server (deployed site)
  }
  lastSave = file ? "file" : browser ? "browser" : "failed";
}

export const aslExampleCount = (cls: AslClass) => examples[cls]?.length ?? 0;

/** Replace the examples for one letter (recording again starts that letter over). */
export function setAslExamples(cls: AslClass, list: number[][]) {
  if (list.length) examples[cls] = list.map((f) => f.map((v) => Math.round(v * 1000) / 1000));
  else delete examples[cls];
  return save();
}

export function clearAllAslExamples() {
  examples = {};
  return save();
}
