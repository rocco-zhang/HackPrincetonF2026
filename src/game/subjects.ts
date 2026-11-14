// What a round can be about. One or more can be picked; each wave uses the next one in turn.
import type { Difficulty } from "../config";

export type Subject = "shapes" | "asl" | "math" | "korean" | "japanese" | "chinese";
export type Script = Extract<Subject, "korean" | "japanese" | "chinese">;

export const SUBJECTS: Subject[] = ["shapes", "asl", "math", "korean", "japanese", "chinese"];

export const SUBJECT_INFO: Record<Subject, { label: string; glyph: string; how: string }> = {
  shapes: { label: "Shapes", glyph: "○ ∧", how: "draw the shape" },
  asl: { label: "ASL", glyph: "A·B·C", how: "sign the letter" },
  math: { label: "Math", glyph: "+ ×", how: "draw the answer" },
  korean: { label: "Korean", glyph: "한", how: "draw its marks" },
  japanese: { label: "Japanese", glyph: "あ", how: "draw its marks" },
  chinese: { label: "Chinese", glyph: "中", how: "draw its marks" },
};

export const isScript = (s: Subject): s is Script => s === "korean" || s === "japanese" || s === "chinese";

/** A valid, de-duplicated selection in the standard order; never empty. */
export function cleanSubjects(raw: unknown): Subject[] {
  const picked = Array.isArray(raw) ? SUBJECTS.filter((s) => raw.includes(s)) : [];
  return picked.length ? picked : ["shapes"];
}

/** Add or remove one subject. The last one can't be removed. */
export function toggleSubject(list: Subject[], s: Subject): Subject[] {
  return cleanSubjects(list.includes(s) ? list.filter((x) => x !== s) : [...list, s]);
}

export const subjectsLabel = (list: Subject[]) => list.map((s) => SUBJECT_INFO[s].label).join(" + ");

/** Which subject a wave uses, and how far into that subject's own lessons it is (1, 2, 3…). */
export function waveSubject(list: Subject[], wave: number): { subject: Subject; level: number } {
  const n = Math.max(1, wave);
  return { subject: list[(n - 1) % list.length], level: Math.floor((n - 1) / list.length) + 1 };
}

const BEST_KEY = "spellcam.best";

/**
 * localStorage key for the best score of a subject selection and difficulty.
 * Single subjects on medium keep the keys from before subjects could be combined.
 */
export function bestKey(list: Subject[], difficulty: Difficulty): string {
  const subjects = cleanSubjects(list);
  const mode = subjects.length > 1 ? `${BEST_KEY}.mix.${subjects.join("+")}` : subjects[0] === "shapes" ? BEST_KEY : `${BEST_KEY}.${subjects[0]}`;
  return mode + (difficulty === "medium" ? "" : `.${difficulty}`);
}

export function bestScore(list: Subject[], difficulty: Difficulty): number {
  try {
    return Number(localStorage.getItem(bestKey(list, difficulty)) ?? 0) || 0;
  } catch {
    return 0;
  }
}
