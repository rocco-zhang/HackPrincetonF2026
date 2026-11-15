import type { LangName, LangShape, SymbolName } from "../input/events";
import type { Script } from "./subjects";

/**
 * What a single stroke can be in a language round: the simple marks (lines, a peak, a circle)
 * and the letter strokes that are drawn the way the letter is written (ㄱ, ㄴ, く, し).
 */
export type Mark = Extract<SymbolName, "hline" | "vline" | "caret" | "circle"> | LangShape;

export const MARKS: Mark[] = ["hline", "vline", "caret", "circle", "giyeok", "nieun", "ku", "shi", "no", "he", "tsu", "so", "te", "hi", "ro", "ru", "n"];

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

/**
 * Syllables for whole words (저기요, 아니요, 마시다). Their letters are drawn in the real stroke
 * order: ㅈ a flat line then a peak, ㅅ a peak, ㅁ a stick, ㄱ, then a flat line, ㄷ a flat line
 * then ㄴ, ㅏ a stick then a flat line, ㅓ a flat line then a stick, ㅛ two sticks then a flat line.
 */
export const KOREAN_WORD_SYLLABLES: LangPrompt[] = [
  line("아", "korean", "a: a circle, then ㅏ (stick, flat line)", ["circle", "vline", "hline"]),
  line("시", "korean", "si: ㅅ (a peak), then a stick", ["caret", "vline"]),
  line("저", "korean", "jeo: ㅈ (flat line, peak), then ㅓ (flat line, stick)", ["hline", "caret", "hline", "vline"]),
  line("요", "korean", "yo: a circle, then ㅛ (two sticks, flat line)", ["circle", "vline", "vline", "hline"]),
  line("다", "korean", "da: ㄷ (flat line, ㄴ), then ㅏ (stick, flat line)", ["hline", "nieun", "vline", "hline"]),
  line("마", "korean", "ma: ㅁ (stick, ㄱ, flat line), then ㅏ (stick, flat line)", ["vline", "giyeok", "hline", "vline", "hline"]),
];

/** The most marks any card takes. */
export const MAX_MARKS = 5;

export const JAPANESE: LangPrompt[] = [
  line("り", "japanese", "ri: two sticks, short then long", ["vline", "vline"]),
  line("し", "japanese", "shi: down, then hook up to the right", ["shi"]),
  line("く", "japanese", "ku: an angle pointing left", ["ku"]),
  line("の", "japanese", "no: sweep down-left, loop around, finish at the bottom", ["no"]),
];

export const JAPANESE_MORE: LangPrompt[] = [
  line("へ", "japanese", "he: rise diagonally, then sweep down-right", ["he"]),
  line("つ", "japanese", "tsu: sweep right, curve down and back left", ["tsu"]),
  line("そ", "japanese", "so: zig across the top, then curve down-right", ["so"]),
  line("て", "japanese", "te: across, then curve down and right", ["te"]),
];

export const JAPANESE_ADVANCED: LangPrompt[] = [
  line("ひ", "japanese", "hi: down into a deep curve, rise and flick right", ["hi"]),
  line("ろ", "japanese", "ro: across, down-left, then a broad curve", ["ro"]),
  line("る", "japanese", "ru: like ro, with a small loop at the bottom", ["ru"]),
  line("ん", "japanese", "n: down-left, rise into a hump, finish up-right", ["n"]),
];

export const JAPANESE_WORDS: LangPrompt[] = [
  line("のり", "japanese", "nori (seaweed): no, then ri", ["no", "vline", "vline"]),
  line("くし", "japanese", "kushi (comb): く, then し", ["ku", "shi"]),
  line("しの", "japanese", "shino (bamboo grass): shi, then no", ["shi", "no"]),
];

export const CHINESE: LangPrompt[] = [
  line("一", "chinese", "one: a flat line", ["hline"]),
  line("人", "chinese", "person: a peak", ["caret"]),
  line("二", "chinese", "two: two flat lines", ["hline", "hline"]),
  line("十", "chinese", "ten: a flat line, then a stick", ["hline", "vline"]),
];

export const CHINESE_MORE: LangPrompt[] = [
  line("三", "chinese", "three: three flat lines", ["hline", "hline", "hline"]),
  line("工", "chinese", "work: a flat line, a stick, a flat line", ["hline", "vline", "hline"]),
];

const LESSONS: Record<Script, LangPrompt[][]> = {
  korean: [KOREAN, KOREAN_SYLLABLES, KOREAN_WORD_SYLLABLES],
  japanese: [JAPANESE, JAPANESE_MORE, JAPANESE_ADVANCED],
  chinese: [CHINESE, CHINESE_MORE],
};

const NAMES: Record<Script, string> = { korean: "Korean", japanese: "Japanese", chinese: "Chinese" };

/** Each level teaches the next lesson (single letters, then longer ones…); after the last, everything together. */
export function langPool(script: Script, level: number): LangPrompt[] {
  const lessons = LESSONS[script];
  if (script === "japanese") return lessons.slice(0, Math.max(1, level)).flat();
  return lessons[Math.max(1, level) - 1] ?? lessons.flat();
}

/**
 * The characters a player has already met when wave `level` of a script begins: every lesson
 * before this wave's (at least the first one, and everything once the lessons run out).
 */
export function taughtLabels(script: Script, level: number): Set<string> {
  const lessons = LESSONS[script];
  const done = level > lessons.length ? lessons.length : Math.max(1, level - 1);
  return new Set(lessons.slice(0, done).flat().map((item) => item.label));
}

export function pickLang(script: Script, level: number, rand: () => number): LangPrompt {
  const pool = langPool(script, level);
  return pool[Math.floor(rand() * pool.length)];
}

export function langWaveBlurb(script: Script, level: number): string {
  if (script === "japanese") return `Japanese. ${langPool(script, level).map(item => item.label).join(" ")} / draw one hiragana, then hold 🤟`;
  if (level <= 1) return `${NAMES[script]}. Draw the marks, then hold 🤟 to submit`;
  if (level === 2) return `${NAMES[script]}. Longer ones: draw the marks in order, then hold 🤟`;
  if (level === 3 && LESSONS[script].length >= 3) return `${NAMES[script]}. Syllables for whole words: follow the hint`;
  return `${NAMES[script]}. Everything so far`;
}

export function langCast(strokes: readonly string[]): LangName {
  return `lang_${strokes.join("-")}`;
}

/** The marks a card name stands for. */
export const castMarks = (name: string): Mark[] => (name.startsWith("lang_") ? (name.slice(5).split("-") as Mark[]) : []);

/** Every mark a language uses, across all its lessons: the only things a stroke is read as in its rounds. */
export function scriptMarks(script: Script): Mark[] {
  return [...new Set(LESSONS[script].flat().flatMap((item) => item.strokes))];
}

/** The marks that would continue a card right now, given what has been drawn so far. */
export function nextMarks(cards: readonly string[], drawn: readonly string[]): Mark[] {
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
  no: "の",
  he: "へ", tsu: "つ", so: "そ", te: "て",
  hi: "ひ", ro: "ろ", ru: "る", n: "ん",
};
