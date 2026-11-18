import { DIFFICULTY, GAME, waveSpec, type Difficulty } from "../../config";
import { makeSpawnAnglePicker } from "./spawnGeometry";
import type { AslLetter } from "../../asl/hand";
import { isMath, mathAnswer, SYMBOLS, aslName, type CastName } from "../../input/events";

/** Which symbols each wave can use: teach a few first, then all six. */
export function symbolPool(wave: number): CastName[] {
  if (wave <= 1) return ["hline", "vline", "v"];
  if (wave === 2) return ["hline", "vline", "v", "caret", "circle"];
  return SYMBOLS;
}

/** ASL mode: the letters each wave adds, easiest and most distinct handshapes first. */
export const ASL_WAVES: AslLetter[][] = [
  ["A", "B", "C", "L", "Y"],
  ["D", "F", "I", "O", "V", "W"],
  ["E", "K", "R", "S", "U"],
  ["G", "H", "M", "N", "P", "Q", "T", "X"],
];

export function aslPool(wave: number): CastName[] {
  return ASL_WAVES.slice(0, Math.max(1, wave)).flat().map(aslName);
}

export { edgePoint } from "./spawnGeometry";

export type SpawnOrder = { angle: number; symbols: CastName[]; labels?: string[]; speed: number; palette: number; boss?: boolean };

export type CardSource = {
  make: (wave: number, prefer?: number) => { name: CastName; label: string };
  queue: (wave: number) => number;
  interval: number;
};

export class Spawner {
  private pickAngle = makeSpawnAnglePicker();
  wave = 0;
  /** How far into the current subject's own lessons this wave is (same as the wave with one subject). */
  level = 0;
  spawned = 0;
  private timer = 0;
  private spec = waveSpec(1);
  private scripted: { at: number; order: SpawnOrder }[] = [];
  private elapsed = 0;

  constructor(
    private rand: () => number,
    private speedScale = 1,
    private poolFor: (wave: number) => CastName[] = symbolPool,
    private cards?: CardSource,
    private difficulty: Difficulty = "medium",
  ) {}

  /** The wave whose symbols this one draws from (easy unlocks shapes later, hard sooner). */
  static poolWave(wave: number, difficulty: Difficulty) {
    return Math.max(1, wave - DIFFICULTY[difficulty].poolWaveShift);
  }

  startWave(n: number, level = n) {
    this.wave = n;
    this.level = level;
    this.spec = waveSpec(n, this.difficulty);
    this.spawned = 0;
    this.timer = 0.4;
    this.elapsed = 0;
  }

  /** Queue fixed spawns (used by the demo wave). They count toward the wave total. */
  script(orders: { at: number; order: SpawnOrder }[]) {
    this.scripted = orders;
  }

  get done() {
    return this.spawned >= this.spec.count && this.scripted.length === 0;
  }

  update(dt: number, liveFronts: CastName[]): SpawnOrder[] {
    const out: SpawnOrder[] = [];
    this.elapsed += dt;
    while (this.scripted.length && this.scripted[0].at <= this.elapsed) {
      out.push(this.scripted.shift()!.order);
      this.spawned++;
    }
    if (this.scripted.length) return out;
    if (this.spawned >= this.spec.count) return out;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = this.spec.interval * (this.cards?.interval ?? 1) * (0.75 + this.rand() * 0.5);
      out.push(this.makeOrder(liveFronts));
      this.spawned++;
    }
    return out;
  }

  makeOrder(liveFronts: CastName[]): SpawnOrder {
    if (this.cards) return this.makeCards(liveFronts);
    const pool = this.poolFor(Spawner.poolWave(this.level, this.difficulty));
    const pick = () => pool[Math.floor(this.rand() * pool.length)];
    const len = 1 + Math.floor(this.rand() * this.spec.maxQueue);
    const symbols: CastName[] = [];
    // bias toward sharing a front symbol with someone already on screen → multi-hits
    const first = liveFronts.length && this.rand() < DIFFICULTY[this.difficulty].shareChance ? liveFronts[Math.floor(this.rand() * liveFronts.length)] : pick();
    symbols.push(pool.includes(first) ? first : pick());
    while (symbols.length < len) {
      let s = pick();
      for (let k = 0; k < 4 && s === symbols[symbols.length - 1]; k++) s = pick();
      symbols.push(s);
    }
    return {
      angle: this.pickAngle(this.rand),
      symbols,
      speed: this.spec.speed * this.speedScale * (0.9 + this.rand() * 0.2),
      palette: Math.floor(this.rand() * 3),
    };
  }

  private makeCards(liveFronts: CastName[]): SpawnOrder {
    const len = this.cards!.queue(this.level);
    const symbols: CastName[] = [];
    const labels: string[] = [];
    const shared = liveFronts.filter(isMath);
    const prefer = shared.length && this.rand() < (0.4 * DIFFICULTY[this.difficulty].shareChance) / DIFFICULTY.medium.shareChance ? mathAnswer(shared[Math.floor(this.rand() * shared.length)]) : undefined;
    for (let i = 0; i < len; i++) {
      let card = this.cards!.make(this.level, i === 0 ? prefer : undefined);
      for (let k = 0; k < 6 && labels.includes(card.label); k++) card = this.cards!.make(this.level);
      symbols.push(card.name);
      labels.push(card.label);
    }
    return {
      angle: this.pickAngle(this.rand),
      symbols,
      labels,
      speed: this.spec.speed * this.speedScale * (0.9 + this.rand() * 0.2),
      palette: Math.floor(this.rand() * 3),
    };
  }

  /** Base speed for the current wave (used by scripted orders). */
  get speed() {
    return this.spec.speed * this.speedScale;
  }
}

export const DEMO_SEED = GAME.demoSeed;
