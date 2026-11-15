import type { LangName, LangShape, SymbolName } from "../input/events";
import type { Script } from "./subjects";

/**
 * What a single stroke can be in a language round: the simple marks (lines, a peak, a circle)
 * and the letter strokes that are drawn the way the letter is written (ㄱ, ㄴ, く, し).
 */
export type Mark = Extract<SymbolName, "hline" | "vline" | "caret" | "circle"> | LangShape;

export const MARKS: Mark[] = ["hline", "vline", "caret", "circle", "giyeok", "nieun", "ku", "shi"];

export type LangPrompt = {
  label: string;
  script: Script;
  strokes: Mark[];
  hint: string;
};

const line = (label: string, script: Script, hint: string, strokes: Mark[]): LangPrompt => ({ label, script, strokes, hint });

/** Single letters, each one stroke… */
export const KOREAN: LangPrompt[] = [
  line("ㅡ", "korean", "eu: a flat line", ["hline"]),
  line("ㅣ", "korean", "i: a stick", ["vline"]),
  line("ㄴ", "korean", "n: down, then across", ["nieun"]),
  line("ㄱ", "korean", "g: across, then down", ["giyeok"]),
  line("ㅇ", "korean", "ng: a circle", ["circle"]),
];

/** …then syllables built from two of them, drawn in order. */
export const KOREAN_SYLLABLES: LangPrompt[] = [
  line("이", "korean", "i: a circle, then a stick", ["circle", "vline"]),
  line("으", "korean", "eu: a circle, then a flat line", ["circle", "hline"]),
  line("니", "korean", "ni: ㄴ (down, across), then a stick", ["nieun", "vline"]),
  line("기", "korean", "gi: ㄱ (across, down), then a stick", ["giyeok", "vline"]),
  line("그", "korean", "geu: ㄱ (across, down), then a flat line", ["giyeok", "hline"]),
  line("느", "korean", "neu: ㄴ (down, across), then a flat line", ["nieun", "hline"]),
];

export const JAPANESE: LangPrompt[] = [
  line("ー", "japanese", "long-vowel mark: a flat line", ["hline"]),
  line("り", "japanese", "ri: two sticks, short then long", ["vline", "vline"]),
  line("し", "japanese", "shi: down, then hook up to the right", ["shi"]),
  line("く", "japanese", "ku: an angle pointing left", ["ku"]),
  line("の", "japanese", "no: a circle", ["circle"]),
];

export const JAPANESE_WORDS: LangPrompt[] = [
  line("のり", "japanese", "nori (seaweed): a circle, then two sticks", ["circle", "vline", "vline"]),
  line("くし", "japanese", "kushi (comb): く, then し", ["ku", "shi"]),
  line("しの", "japanese", "shino (bamboo grass): し, then a circle", ["shi", "circle"]),
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

/** The marks a card name stands for. */
export const castMarks = (name: string): Mark[] => (name.startsWith("lang_") ? (name.slice(5).split("-") as Mark[]) : []);

/** Every mark a language uses, across all its lessons: the only things a stroke is read as in its rounds. */
export function scriptMarks(script: Script): Mark[] {
  return [...new Set(LESSONS[script].flat().flatMap((item) => item.strokes))];
}

/** The marks that would continue a card right now, given what has been drawn so far. */
export function nextMarks(cards: readonly string[], drawn: readonly Mark[]): Mark[] {
  const out = new Set<Mark>();
  for (const card of cards) {
    const marks = castMarks(card);
    if (!marks.length) continue;
    const onTrack = drawn.length < marks.length && drawn.every((m, i) => marks[i] === m);
    out.add(onTrack ? marks[drawn.length] : marks[0]);
    out.add(marks[0]); // starting a different card over is always possible
  }
  return [...out];
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
  caret: "∧",
  circle: "○",
  giyeok: "ㄱ",
  nieun: "ㄴ",
  ku: "く",
  shi: "し",
};
