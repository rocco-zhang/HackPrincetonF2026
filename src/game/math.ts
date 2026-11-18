import { mathName, type MathName } from "../input/events";

export type Problem = { prompt: string; name: MathName; answer: number };

type Op = "add" | "sub" | "mul" | "div";

/** Wave 1 is addition, then subtraction, multiplication, division, then all of them. */
export function waveOps(wave: number): Op[] {
  if (wave <= 1) return ["add"];
  if (wave === 2) return ["sub"];
  if (wave === 3) return ["mul"];
  if (wave === 4) return ["div"];
  return ["add", "sub", "mul", "div"];
}

/** One problem per monster until every operation has been introduced. */
export function mathQueue(wave: number): number {
  if (wave < 5) return 1;
  if (wave < 7) return 2;
  return wave < 9 ? 3 : 4;
}

export function mathWaveBlurb(wave: number): string {
  if (wave <= 1) return "addition. Draw the digits, then hold still";
  if (wave === 2) return "subtraction";
  if (wave === 3) return "multiplication";
  if (wave === 4) return "division";
  if (wave === 5) return "all four, and the numbers get bigger";
  if (wave === 6) return "two problems on each monster";
  return "mixed problems, bigger numbers";
}

export function makeProblem(wave: number, rand: () => number, prefer?: number): Problem {
  if (prefer == null && wave >= 7 && rand() < 0.4) return finish(twoStep(rand));
  const ops = waveOps(wave);
  const op = ops[Math.floor(rand() * ops.length)];
  return finish(oneStep(op, wave, rand, prefer));
}

function finish(p: { prompt: string; answer: number }): Problem {
  return { ...p, name: mathName(p.answer) };
}

function oneStep(op: Op, wave: number, rand: () => number, prefer?: number): { prompt: string; answer: number } {
  if (op === "add") return add(wave, rand, prefer);
  if (op === "sub") return sub(wave, rand, prefer);
  if (op === "mul") return mul(wave, rand, prefer);
  return div(wave, rand, prefer);
}

function add(wave: number, rand: () => number, prefer?: number): { prompt: string; answer: number } {
  const max = wave <= 1 ? 10 : Math.min(90, 14 + Math.max(0, wave - 4) * 8);
  if (prefer != null && prefer >= 2 && prefer <= max) {
    const a = 1 + Math.floor(rand() * (prefer - 1));
    return { prompt: `${a} + ${prefer - a}`, answer: prefer };
  }
  if (wave >= 8 && rand() < 0.35) {
    const a = 2 + Math.floor(rand() * 12);
    const b = 2 + Math.floor(rand() * 12);
    const c = 2 + Math.floor(rand() * 12);
    return { prompt: `${a} + ${b} + ${c}`, answer: a + b + c };
  }
  const a = 1 + Math.floor(rand() * Math.min(9 + wave, max - 1));
  const room = Math.max(1, max - a);
  const b = 1 + Math.floor(rand() * room);
  return { prompt: `${a} + ${b}`, answer: a + b };
}

function sub(wave: number, rand: () => number, prefer?: number): { prompt: string; answer: number } {
  const answer = prefer != null && prefer >= 1 ? prefer : 1 + Math.floor(rand() * (wave <= 2 ? 9 : Math.min(40, 8 + wave * 2)));
  const take = 1 + Math.floor(rand() * (wave <= 2 ? 9 : Math.min(30, 6 + wave * 2)));
  return { prompt: `${answer + take} − ${take}`, answer };
}

function mul(wave: number, rand: () => number, prefer?: number): { prompt: string; answer: number } {
  const hi = wave <= 3 ? 6 : Math.min(12, 6 + Math.floor((wave - 3) / 2));
  if (prefer != null && prefer >= 4) {
    const factors = pairs(prefer, 2, hi);
    if (factors) {
      const [a, b] = factors[Math.floor(rand() * factors.length)];
      return { prompt: `${a} × ${b}`, answer: prefer };
    }
  }
  const a = 2 + Math.floor(rand() * (hi - 1));
  const b = 2 + Math.floor(rand() * (hi - 1));
  return { prompt: `${a} × ${b}`, answer: a * b };
}

function div(wave: number, rand: () => number, prefer?: number): { prompt: string; answer: number } {
  const hi = wave <= 4 ? 6 : Math.min(12, 6 + Math.floor((wave - 4) / 2));
  const answer = prefer != null && prefer >= 2 && prefer <= hi ? prefer : 2 + Math.floor(rand() * (hi - 1));
  const by = 2 + Math.floor(rand() * (hi - 1));
  return { prompt: `${answer * by} ÷ ${by}`, answer };
}

function twoStep(rand: () => number): { prompt: string; answer: number } {
  const a = 2 + Math.floor(rand() * 5);
  const b = 2 + Math.floor(rand() * 5);
  const c = 2 + Math.floor(rand() * 4);
  const kind = Math.floor(rand() * 3);
  if (kind === 0) return { prompt: `(${a} + ${b}) × ${c}`, answer: (a + b) * c };
  if (kind === 1) return { prompt: `${a} × ${b} + ${c}`, answer: a * b + c };
  const take = 1 + Math.floor(rand() * (a * b - 1));
  return { prompt: `${a} × ${b} − ${take}`, answer: a * b - take };
}

function pairs(product: number, lo: number, hi: number): [number, number][] | null {
  const found: [number, number][] = [];
  for (let a = lo; a <= hi; a++) {
    if (product % a === 0) {
      const b = product / a;
      if (b >= lo && b <= hi) found.push([a, b]);
    }
  }
  return found.length ? found : null;
}
