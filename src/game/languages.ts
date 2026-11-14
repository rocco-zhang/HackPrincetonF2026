import type { LangName, SymbolName } from "../input/events";

/** The easy marks. Lines, a V, a peak, and a circle. Nothing else. */
export type Mark = Extract<SymbolName, "hline" | "vline" | "v" | "caret" | "circle">;

export const MARKS: Mark[] = ["hline", "vline", "v", "caret", "circle"];

export type LangPrompt = {
  label: string;
  script: "korean" | "japanese" | "word";
  strokes: Mark[];
  hint: string;
};

const line = (label: string, script: LangPrompt["script"], hint: string, strokes: Mark[]): LangPrompt => ({ label, script, strokes, hint });

/** A handful of letters that are just one easy mark, plus three short words. */
export const KOREAN: LangPrompt[] = [
  line("ㅡ", "korean", "flat line", ["hline"]),
  line("ㅣ", "korean", "stick", ["vline"]),
  line("ㄴ", "korean", "a V", ["v"]),
  line("ㄱ", "korean", "a peak", ["caret"]),
  line("ㅇ", "korean", "a circle", ["circle"]),
];

export const JAPANESE: LangPrompt[] = [
  line("ー", "japanese", "flat line", ["hline"]),
  line("り", "japanese", "stick", ["vline"]),
  line("し", "japanese", "a V", ["v"]),
  line("く", "japanese", "a peak", ["caret"]),
  line("の", "japanese", "a circle", ["circle"]),
];

export const WORDS: LangPrompt[] = [
  line("hi", "word", "flat line, then a stick", ["hline", "vline"]),
  line("no", "word", "a V, then a circle", ["v", "circle"]),
  line("ok", "word", "a circle, then a peak", ["circle", "caret"]),
];

export function langPool(wave: number): LangPrompt[] {
  if (wave <= 1) return KOREAN;
  if (wave === 2) return JAPANESE;
  if (wave === 3) return WORDS;
  return [...KOREAN, ...JAPANESE, ...WORDS];
}

export function pickLang(wave: number, rand: () => number): LangPrompt {
  const pool = langPool(wave);
  return pool[Math.floor(rand() * pool.length)];
}

export function langWaveBlurb(wave: number): string {
  if (wave <= 1) return "Korean. Draw the mark";
  if (wave === 2) return "Japanese. The same five marks";
  if (wave === 3) return "Short words. Draw the marks in order";
  return "Korean, Japanese, and the short words";
}

export function langCast(strokes: Mark[]): LangName {
  return `lang_${strokes.join("-")}`;
}

export function hintFor(label: string): string {
  return langPool(4).find((item) => item.label === label)?.hint ?? "";
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
