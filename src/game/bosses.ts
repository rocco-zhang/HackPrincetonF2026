// Bosses: every few waves one big, slow monster arrives carrying a long row of cards.
// For the language subjects and ASL the row is a real word.
import type { AslLetter } from "../asl/hand";
import { aslName, SYMBOLS, type CastName } from "../input/events";
import { langCast, type Mark } from "./languages";
import { makeProblem } from "./math";
import type { Subject } from "./subjects";

/** A boss comes with every wave that is a multiple of this. */
export const BOSS_EVERY = 3;
export const isBossWave = (wave: number) => wave > 0 && wave % BOSS_EVERY === 0;

export const BOSS = {
  scale: 1.8,
  speed: 0.42, // of an ordinary monster's speed that wave
  scoreMult: 4,
};

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
    { word: [["그", m("giyeok", "hline")], ["이", m("circle", "vline")]], meaning: "그이 (that person)" },
    { word: [["이", m("circle", "vline")], ["기", m("giyeok", "vline")]], meaning: "이기 (self-interest)" },
    { word: [["기", m("giyeok", "vline")], ["니", m("nieun", "vline")]], meaning: "기니 (Guinea)" },
  ],
  japanese: [
    { word: [["し", m("shi")], ["く", m("ku")], ["し", m("shi")], ["く", m("ku")]], meaning: "しくしく (sobbing)" },
    { word: [["の", m("circle")], ["り", m("vline", "vline")], ["の", m("circle")], ["り", m("vline", "vline")]], meaning: "のりのり (in high spirits)" },
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
    const n = Math.min(8, 5 + Math.floor(level / 2));
    const symbols: CastName[] = [];
    while (symbols.length < n) {
      const s = pick(SYMBOLS, rand);
      if (s !== symbols[symbols.length - 1]) symbols.push(s);
    }
    return { symbols, title: `${n} shapes in a row` };
  }
  const { word, meaning } = pick(WORDS[subject], rand);
  return { symbols: word.map(([, strokes]) => langCast(strokes)), labels: word.map(([char]) => char), title: `Write ${meaning}` };
}
