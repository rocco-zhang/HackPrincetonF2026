import { ARENA, GAME, waveSpec } from "../../config";
import { SYMBOLS, type SymbolName } from "../../input/events";

/** Which symbols each wave can use: teach a few first, then all six. */
export function symbolPool(wave: number): SymbolName[] {
  if (wave <= 1) return ["hline", "vline", "v"];
  if (wave === 2) return ["hline", "vline", "v", "caret", "circle"];
  return SYMBOLS;
}

/** Point just outside the arena along a ray from the center. */
export function edgePoint(angle: number, margin = 50) {
  const cx = ARENA.width / 2;
  const cy = ARENA.height / 2;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const tx = Math.abs(dx) > 1e-6 ? (cx + margin) / Math.abs(dx) : Infinity;
  const ty = Math.abs(dy) > 1e-6 ? (cy + margin) / Math.abs(dy) : Infinity;
  const t = Math.min(tx, ty);
  return { x: cx + dx * t, y: cy + dy * t };
}

export type SpawnOrder = { angle: number; symbols: SymbolName[]; speed: number; palette: number };

export class Spawner {
  wave = 0;
  spawned = 0;
  private timer = 0;
  private spec = waveSpec(1);
  private scripted: { at: number; order: SpawnOrder }[] = [];
  private elapsed = 0;

  constructor(
    private rand: () => number,
    private speedScale = 1,
  ) {}

  startWave(n: number) {
    this.wave = n;
    this.spec = waveSpec(n);
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

  update(dt: number, liveFronts: SymbolName[]): SpawnOrder[] {
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
      this.timer = this.spec.interval * (0.75 + this.rand() * 0.5);
      out.push(this.makeOrder(liveFronts));
      this.spawned++;
    }
    return out;
  }

  makeOrder(liveFronts: SymbolName[]): SpawnOrder {
    const pool = symbolPool(this.wave);
    const pick = () => pool[Math.floor(this.rand() * pool.length)];
    const len = 1 + Math.floor(this.rand() * this.spec.maxQueue);
    const symbols: SymbolName[] = [];
    // bias toward sharing a front symbol with someone already on screen → multi-hits
    const first = liveFronts.length && this.rand() < 0.35 ? liveFronts[Math.floor(this.rand() * liveFronts.length)] : pick();
    symbols.push(pool.includes(first) ? first : pick());
    while (symbols.length < len) {
      let s = pick();
      for (let k = 0; k < 4 && s === symbols[symbols.length - 1]; k++) s = pick();
      symbols.push(s);
    }
    return {
      angle: this.rand() * Math.PI * 2,
      symbols,
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
