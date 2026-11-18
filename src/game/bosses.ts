// Bosses: every few waves one big, slow monster arrives carrying a long row of cards.
// For the language subjects and ASL the row is a real word.
import type { AslLetter } from "../asl/hand";
import { aslName, SYMBOLS, type CastName } from "../input/events";
import { langCast, taughtLabels, type Mark } from "./languages";
import { makeProblem } from "./math";
import type { Subject } from "./subjects";

/** A boss comes with every wave that is a multiple of this. */
export const BOSS_EVERY = 3;
export const isBossWave = (wave: number) => wave > 0 && (wave > 25 || wave % BOSS_EVERY === 0);

export const BOSS = {
  scale: 1.8,
  maxCards: 10,
  speedBoostPerWave: 0.08,
  maxSpeedBoost: 2.5,
  scoreMult: 4,
};

/** Applied on top of the normal wave/subject speed and 1/sqrt(initial health). */
export function bossSpeedBoost(wave: number) {
  return Math.min(BOSS.maxSpeedBoost, 1 + Math.max(0, wave - BOSS_EVERY) * BOSS.speedBoostPerWave);
}

export type BossCards = { symbols: CastName[]; labels?: string[]; title: string };

/** ASL words, grouped by the lesson whose letters they need. No letter repeats back to back (a held shape only casts once). */
const ASL_WORDS: string[][] = [
  ["CAB", "LAB", "BAY", "CLAY"],
  ["BOLD", "WILD", "COLD", "FLY", "VIOLA"],
  ["CLOUD", "BREAK", "SOLVE", "WORLD"],
  ["MAGIC", "QUICK", "PENCIL", "MONSTER"],
];

const m = (...marks: Mark[]) => marks;
/** Words written with the characters each language's lessons teach: [character, its strokes] pairs. */
const WORDS: Record<"korean" | "japanese" | "chinese", { word: [string, Mark[]][]; meaning: string }[]> = {
  korean: [
    // spelled letter by letter, for before any syllables have been taught
    { word: [["ㅇ", m("circle")], ["ㅣ", m("vline")], ["ㄴ", m("nieun")], ["ㄱ", m("giyeok")], ["ㅣ", m("vline")]], meaning: "인기 (popularity), letter by letter" },
    { word: [["ㅇ", m("circle")], ["ㅡ", m("hline")], ["ㄴ", m("nieun")], ["ㄱ", m("giyeok")], ["ㅡ", m("hline")], ["ㄴ", m("nieun")]], meaning: "은근 (subtle), letter by letter" },
    { word: [["ㅇ", m("circle")], ["ㅣ", m("vline")], ["ㄱ", m("giyeok")], ["ㅣ", m("vline")], ["ㄴ", m("nieun")]], meaning: "이긴 (won), letter by letter" },
    // from the two-letter syllables
    { word: [["그", m("giyeok", "hline")], ["이", m("circle", "vline")]], meaning: "그이 (that person)" },
    { word: [["기", m("giyeok", "vline")], ["니", m("nieun", "vline")]], meaning: "기니 (Guinea)" },
    { word: [["이", m("circle", "vline")], ["기", m("giyeok", "vline")], ["니", m("nieun", "vline")]], meaning: "이기니 (are you winning?)" },
    // whole words, once their syllables have been taught
    { word: [["저", m("hline", "caret", "hline", "vline")], ["기", m("giyeok", "vline")], ["요", m("circle", "vline", "vline", "hline")]], meaning: "저기요 (excuse me)" },
    { word: [["아", m("circle", "vline", "hline")], ["니", m("nieun", "vline")], ["요", m("circle", "vline", "vline", "hline")]], meaning: "아니요 (no)" },
    { word: [["마", m("vline", "giyeok", "hline", "vline", "hline")], ["시", m("caret", "vline")], ["다", m("hline", "nieun", "vline", "hline")]], meaning: "마시다 (to drink)" },
  ],
  japanese: [
    { word: [["し", m("shi")], ["く", m("ku")], ["し", m("shi")], ["く", m("ku")]], meaning: "しくしく (sobbing)" },
    { word: [["の", m("no")], ["り", m("vline", "vline")], ["の", m("no")], ["り", m("vline", "vline")]], meaning: "のりのり (in high spirits)" },
    { word: [["く", m("ku")], ["り", m("vline", "vline")], ["く", m("ku")], ["り", m("vline", "vline")]], meaning: "くりくり (big and round)" },
  ],
  chinese: [
    { word: [["工", m("hline", "vline", "hline")], ["人", m("caret")]], meaning: "工人 (worker)" },
    { word: [["二", m("hline", "hline")], ["十", m("hline", "vline")]], meaning: "二十 (twenty)" },
    { word: [["三", m("hline", "hline", "hline")], ["人", m("caret")]], meaning: "三人 (three people)" },
    { word: [["十", m("hline", "vline")], ["一", m("hline")]], meaning: "十一 (eleven)" },
  ],
};

const pick = <T>(list: T[], rand: () => number) => list[Math.floor(rand() * list.length)];

/** What this wave's boss carries. `level` is how far into the subject's own lessons the wave is. */
export function bossCards(subject: Subject, level: number, rand: () => number): BossCards {
  if (subject === "asl") {
    const word = pick(ASL_WORDS[Math.min(ASL_WORDS.length, Math.max(1, level)) - 1], rand);
    return { symbols: [...word].map((l) => aslName(l as AslLetter)), title: `Spell the word ${word}` };
  }
  if (subject === "math") {
    const problems: ReturnType<typeof makeProblem>[] = [];
    // four different questions (a few tries each to avoid a repeat)
    while (problems.length < 4) {
      let p = makeProblem(level + 1, rand);
      for (let k = 0; k < 8 && problems.some((q) => q.prompt === p.prompt); k++) p = makeProblem(level + 1, rand);
      problems.push(p);
    }
    return { symbols: problems.map((p) => p.name), labels: problems.map((p) => p.prompt), title: "Four problems in a row" };
  }
  if (subject === "shapes") {
    const n = Math.min(BOSS.maxCards, 5 + Math.floor(level / 2));
    const symbols: CastName[] = [];
    while (symbols.length < n) {
      const s = pick(SYMBOLS, rand);
      if (s !== symbols[symbols.length - 1]) symbols.push(s);
    }
    return { symbols, title: `${n} shapes in a row` };
  }
  // only words whose every character has been taught by now, and of those the hardest ones:
  // the words that use the latest lesson learned
  const taught = taughtLabels(subject, level);
  const known = WORDS[subject].filter((w) => w.word.every(([char]) => taught.has(char)));
  let pool = known.length ? known : WORDS[subject];
  for (let l = level; l > 1; l--) {
    const earlier = taughtLabels(subject, l - 1);
    const newest = known.filter((w) => w.word.some(([char]) => !earlier.has(char)));
    if (newest.length) {
      pool = newest;
      break;
    }
  }
  const { word, meaning } = pick(pool, rand);
  return { symbols: word.map(([, strokes]) => langCast(strokes)), labels: word.map(([char]) => char), title: `Write ${meaning}` };
}
