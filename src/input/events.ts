import { ASL_LETTERS, type AslLetter } from "../asl/hand";

export type Pt = { x: number; y: number; t: number }; // x,y in GAME pixels (already mirrored + mapped)

export type SymbolName = "hline" | "vline" | "v" | "caret" | "circle" | "zigzag";

export const SYMBOLS: SymbolName[] = ["hline", "vline", "v", "caret", "circle", "zigzag"];

/** Strokes that only the language subjects use: real letter shapes, drawn the way the letter is written. */
export type LangShape = "giyeok" | "nieun" | "ku" | "shi";
export const LANG_SHAPES: LangShape[] = ["giyeok", "nieun", "ku", "shi"];
/** Anything a single drawn stroke can be recognised as. */
export type StrokeName = SymbolName | LangShape;
export const STROKES: StrokeName[] = [...SYMBOLS, ...LANG_SHAPES];

// What a monster can carry and a player can cast: a drawn symbol, or (ASL mode) a fingerspelled letter.
export type AslName = `asl_${AslLetter}`;
/** The answer to a math problem. The prompt ("3 + 4") is drawn separately. */
export type MathName = `math_${number}`;
/** A languages-mode answer, named by the easy marks it takes, such as `lang_hline-circle`. */
export type LangName = `lang_${string}`;
export type CastName = SymbolName | AslName | MathName | LangName;
export const aslName = (l: AslLetter) => `asl_${l}` as AslName;
export const mathName = (answer: number) => `math_${answer}` as MathName;
export const mathAnswer = (n: MathName) => Number(n.slice(5));
export const ASL_NAMES: AslName[] = ASL_LETTERS.map(aslName);
export const isLangShape = (n: string): n is LangShape => (LANG_SHAPES as string[]).includes(n);
export const isSymbol = (n: CastName): n is SymbolName => (SYMBOLS as string[]).includes(n);
export const isMath = (n: CastName): n is MathName => n.startsWith("math_");
export const isLang = (n: CastName): n is LangName => n.startsWith("lang_");
/** Short text for a cast name: the letter itself for ASL, the number for arithmetic. */
export const castLabel = (n: CastName) => (isSymbol(n) ? n : isMath(n) ? String(mathAnswer(n)) : isLang(n) ? n.slice(5) : n.slice(4));

export type InputEvent =
  // every frame: where the fingertip is, and whether it's drawing. `src` is "mouse" for the real pointer (menus), otherwise the hand.
  // `hand` is 0 or 1 when both hands are drawing.
  | { type: "cursor"; p: Pt; inking: boolean; src?: "mouse"; hand?: number }
  | { type: "strokeStart"; p: Pt; hand?: number }
  | { type: "strokePoint"; p: Pt; hand?: number }
  | { type: "strokeEnd"; points: Pt[]; hand?: number }
  // recognized cast. In a language round the name can be one of that language's letter strokes.
  | { type: "symbol"; name: CastName | LangShape; score: number; points: Pt[]; hand?: number }
  | { type: "fizzle"; points: Pt[]; best?: { name: StrokeName; score: number }; hand?: number }; // drawn but not recognized

// tiny event bus: input → game
export const bus = new EventTarget();
export const emit = (e: InputEvent) => bus.dispatchEvent(new CustomEvent("input", { detail: e }));

export function onInput(handler: (e: InputEvent) => void): () => void {
  const fn = (ev: Event) => handler((ev as CustomEvent<InputEvent>).detail);
  bus.addEventListener("input", fn);
  return () => bus.removeEventListener("input", fn);
}
