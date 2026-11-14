import type { LangName, SymbolName } from "../input/events";
import type { Script } from "./subjects";

/** The easy marks. Lines, a V, a peak, and a circle. Nothing else. */
export type Mark = Extract<SymbolName, "hline" | "vline" | "v" | "caret" | "circle">;

export const MARKS: Mark[] = ["hline", "vline", "v", "caret", "circle"];

export type LangPrompt = {
  label: string;
  script: Script;
  strokes: Mark[];
  hint: string;
};

const line = (label: string, script: Script, hint: string, strokes: Mark[]): LangPrompt => ({ label, script, strokes, hint });

/** Letters that are just one easy mark… */
export const KOREAN: LangPrompt[] = [
  line("ㅡ", "korean", "flat line", ["hline"]),
  line("ㅣ", "korean", "stick", ["vline"]),
  line("ㄴ", "korean", "a V", ["v"]),
  line("ㄱ", "korean", "a peak", ["caret"]),
  line("ㅇ", "korean", "a circle", ["circle"]),
];

/** …then syllables built from two of them, drawn in order. */
export const KOREAN_SYLLABLES: LangPrompt[] = [
  line("이", "korean", "a circle, then a stick", ["circle", "vline"]),
  line("으", "korean", "a circle, then a flat line", ["circle", "hline"]),
  line("니", "korean", "a V, then a stick", ["v", "vline"]),
  line("기", "korean", "a peak, then a stick", ["caret", "vline"]),
];

export const JAPANESE: LangPrompt[] = [
  line("ー", "japanese", "flat line", ["hline"]),
  line("り", "japanese", "stick", ["vline"]),
  line("し", "japanese", "a V", ["v"]),
  line("く", "japanese", "a peak", ["caret"]),
  line("の", "japanese", "a circle", ["circle"]),
];

export const JAPANESE_WORDS: LangPrompt[] = [
  line("のり", "japanese", "nori (seaweed): a circle, then a stick", ["circle", "vline"]),
  line("くし", "japanese", "kushi (comb): a peak, then a V", ["caret", "v"]),
  line("りく", "japanese", "riku (land): a stick, then a peak", ["vline", "caret"]),
];

export const CHINESE: LangPrompt[] = [
  line("一", "chinese", "one: a flat line", ["hline"]),
  line("人", "chinese", "person: a peak", ["caret"]),
  line("〇", "chinese", "zero: a circle", ["circle"]),
  line("二", "chinese", "two: two flat lines", ["hline", "hline"]),
  line("十", "chinese", "ten: a flat line, then a stick", ["hline", "vline"]),
];

export const CHINESE_MORE: LangPrompt[] = [
  line("三", "chinese", "three: three flat lines", ["hline", "hline", "hline"]),
  line("工", "chinese", "work: a flat line, a stick, a flat line", ["hline", "vline", "hline"]),
];

const LESSONS: Record<Script, [LangPrompt[], LangPrompt[]]> = {
  korean: [KOREAN, KOREAN_SYLLABLES],
  japanese: [JAPANESE, JAPANESE_WORDS],
  chinese: [CHINESE, CHINESE_MORE],
};

const NAMES: Record<Script, string> = { korean: "Korean", japanese: "Japanese", chinese: "Chinese" };

/** Level 1 is the single letters, level 2 the longer ones, then both together. */
export function langPool(script: Script, level: number): LangPrompt[] {
  const [first, second] = LESSONS[script];
  if (level <= 1) return first;
  if (level === 2) return second;
  return [...first, ...second];
}

export function pickLang(script: Script, level: number, rand: () => number): LangPrompt {
  const pool = langPool(script, level);
  return pool[Math.floor(rand() * pool.length)];
}

export function langWaveBlurb(script: Script, level: number): string {
  if (level <= 1) return `${NAMES[script]}. Draw the marks you see`;
  if (level === 2) return `${NAMES[script]}. Longer ones: draw the marks in order`;
  return `${NAMES[script]}. Everything so far`;
}

export function langCast(strokes: Mark[]): LangName {
  return `lang_${strokes.join("-")}`;
}

const ALL = Object.values(LESSONS).flat(2);

export function hintFor(label: string): string {
  return ALL.find((item) => item.label === label)?.hint ?? "";
}

export function isMark(name: string): name is Mark {
  return (MARKS as string[]).includes(name);
}

export const MARK_GLYPH: Record<Mark, string> = {
  hline: "—",
  vline: "|",
  v: "V",
  caret: "∧",
  circle: "○",
};
