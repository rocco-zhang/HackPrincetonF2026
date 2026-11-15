// All tunables in one place.

export const ARENA = { width: 1280, height: 720 } as const;

export const INPUT = {
  // Optional world-space depth veto; user-editable pinch settings live in config/pinch.defaults.json.
  pinch3dMax: 0.5,
  // One Euro filter on the cursor (game pixels, seconds)
  euroMinCutoff: 1.0,
  euroBeta: 0.01,
  euroDCutoff: 1.0,
  // Region of the (mirrored, normalized) camera frame that maps to the whole arena.
  // 16:9 in camera pixels for a 640×480 feed, so shapes aren't stretched on screen.
  drawBox: { x0: 0.2, y0: 0.17, x1: 0.8, y1: 0.62 },
  // stroke filtering
  minStrokePoints: 8,
  minStrokeLength: 40,
  handTrimPoints: 3,
  // camera
  videoWidth: 640,
  videoHeight: 480,
};

export const RECOG = {
  // Expected symbols may score slightly below the best overall match.
  wantedMargin: 0.08,
  // small rotation tolerance for $1 (orientation-sensitive otherwise)
  rotationTolerance: 25, // degrees
};

export const GAME = {
  playerRadius: 40,
  monsterRadius: 30,
  contactDistance: 62,
  baseSpeed: 40,
  speedPerWave: 6,
  spawnIntervalStart: 2.0,
  spawnIntervalPerWave: 0.15,
  scorePerSymbol: 100,
  scorePerKill: 250,
  streakStep: 5, // casts per +0.5x streak multiplier
  streakMaxMult: 3,
  iconSize: 48,
  demoSeed: 20261115,
};

export type Difficulty = "easy" | "medium" | "hard";
export const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

/**
 * What each difficulty changes. Medium is the original tuning. Speeds and spawn gaps scale
 * the wave curve; the wave offsets move when longer symbol queues and new shapes show up.
 */
export const DIFFICULTY: Record<Difficulty, {
  label: string;
  blurb: string;
  hearts: number;
  speedMult: number; // monster walking speed
  maxSpeed: number; // speed cap (before the mode's own scale, e.g. ASL)
  intervalMult: number; // gap between spawns
  intervalFloor: number;
  countMult: number; // monsters per wave
  queueWaveShift: number; // >0 delays two- and three-symbol monsters, <0 brings them in sooner
  poolWaveShift: number; // same, for when new shapes / ASL letters unlock
  shareChance: number; // how often a new monster shares a symbol with one on screen (multi-hits)
  breather: number; // seconds between waves
  scoreMult: number;
}> = {
  easy: {
    label: "Easy",
    blurb: "5 hearts · slower monsters · shorter symbol queues",
    hearts: 5,
    speedMult: 0.75,
    maxSpeed: 70,
    intervalMult: 1.35,
    intervalFloor: 1.4,
    countMult: 0.8,
    queueWaveShift: 2,
    poolWaveShift: 1,
    shareChance: 0.5,
    breather: 3.5,
    scoreMult: 0.75,
  },
  medium: {
    label: "Medium",
    blurb: "3 hearts · the standard game",
    hearts: 3,
    speedMult: 1,
    maxSpeed: 90,
    intervalMult: 1,
    intervalFloor: 0.9,
    countMult: 1,
    queueWaveShift: 0,
    poolWaveShift: 0,
    shareChance: 0.35,
    breather: 2.5,
    scoreMult: 1,
  },
  hard: {
    label: "Hard",
    blurb: "2 hearts · fast, crowded waves · long queues early",
    hearts: 2,
    speedMult: 1.3,
    maxSpeed: 125,
    intervalMult: 0.75,
    intervalFloor: 0.6,
    countMult: 1.3,
    queueWaveShift: -2,
    poolWaveShift: -1,
    shareChance: 0.2,
    breather: 1.8,
    scoreMult: 1.5,
  },
};

export function waveSpec(n: number, difficulty: Difficulty = "medium") {
  const d = DIFFICULTY[difficulty];
  const q = n - d.queueWaveShift; // the wave whose queue lengths this one uses
  return {
    count: Math.max(3, Math.round((4 + 2 * n) * d.countMult)),
    speed: Math.min(d.maxSpeed, (GAME.baseSpeed + GAME.speedPerWave * (n - 1)) * d.speedMult),
    interval: Math.max(d.intervalFloor, (GAME.spawnIntervalStart - GAME.spawnIntervalPerWave * (n - 1)) * d.intervalMult),
    maxQueue: q >= 5 ? 3 : q >= 3 ? 2 : 1,
  };
}
