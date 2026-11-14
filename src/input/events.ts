export type Pt = { x: number; y: number; t: number }; // x,y in GAME pixels (already mirrored + mapped)

export type SymbolName = "hline" | "vline" | "v" | "caret" | "circle" | "zigzag";

export const SYMBOLS: SymbolName[] = ["hline", "vline", "v", "caret", "circle", "zigzag"];

export type InputEvent =
  | { type: "cursor"; p: Pt; inking: boolean } // every frame: where the fingertip is, and whether it's drawing
  | { type: "strokeStart"; p: Pt }
  | { type: "strokePoint"; p: Pt }
  | { type: "strokeEnd"; points: Pt[] }
  | { type: "symbol"; name: SymbolName; score: number; points: Pt[] } // recognized cast
  | { type: "fizzle"; points: Pt[]; best?: { name: SymbolName; score: number } }; // drawn but not recognized

// tiny event bus: input → game
export const bus = new EventTarget();
export const emit = (e: InputEvent) => bus.dispatchEvent(new CustomEvent("input", { detail: e }));

export function onInput(handler: (e: InputEvent) => void): () => void {
  const fn = (ev: Event) => handler((ev as CustomEvent<InputEvent>).detail);
  bus.addEventListener("input", fn);
  return () => bus.removeEventListener("input", fn);
}
