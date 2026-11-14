import { ASL_LETTERS, type AslLetter } from "../asl/hand";

export type Pt = { x: number; y: number; t: number }; // x,y in GAME pixels (already mirrored + mapped)

export type SymbolName = "hline" | "vline" | "v" | "caret" | "circle" | "zigzag";

export const SYMBOLS: SymbolName[] = ["hline", "vline", "v", "caret", "circle", "zigzag"];

// What a monster can carry and a player can cast: a drawn symbol, or (ASL mode) a fingerspelled letter.
export type AslName = `asl_${AslLetter}`;
/** The answer to a math problem. The prompt ("3 + 4") is drawn separately. */
export type MathName = `math_${number}`;
export type CastName = SymbolName | AslName | MathName;
export const aslName = (l: AslLetter) => `asl_${l}` as AslName;
export const mathName = (answer: number) => `math_${answer}` as MathName;
export const mathAnswer = (n: MathName) => Number(n.slice(5));
export const ASL_NAMES: AslName[] = ASL_LETTERS.map(aslName);
export const isSymbol = (n: CastName): n is SymbolName => (SYMBOLS as string[]).includes(n);
export const isMath = (n: CastName): n is MathName => n.startsWith("math_");
/** Short text for a cast name: the letter itself for ASL, the number for arithmetic. */
export const castLabel = (n: CastName) => (isSymbol(n) ? n : isMath(n) ? String(mathAnswer(n)) : n.slice(4));

export type InputEvent =
  | { type: "cursor"; p: Pt; inking: boolean } // every frame: where the fingertip is, and whether it's drawing
  | { type: "strokeStart"; p: Pt }
  | { type: "strokePoint"; p: Pt }
  | { type: "strokeEnd"; points: Pt[] }
  | { type: "symbol"; name: CastName; score: number; points: Pt[] } // recognized cast
  | { type: "fizzle"; points: Pt[]; best?: { name: SymbolName; score: number } }; // drawn but not recognized

// tiny event bus: input → game
export const bus = new EventTarget();
export const emit = (e: InputEvent) => bus.dispatchEvent(new CustomEvent("input", { detail: e }));

export function onInput(handler: (e: InputEvent) => void): () => void {
  const fn = (ev: Event) => handler((ev as CustomEvent<InputEvent>).detail);
  bus.addEventListener("input", fn);
  return () => bus.removeEventListener("input", fn);
}
