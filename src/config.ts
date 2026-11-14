// All tunables in one place.

export const ARENA = { width: 1280, height: 720 } as const;

export const INPUT = {
  // pinch = dist(thumb tip, index tip) / dist(wrist, middle-finger base)
  pinchOn: 0.35,
  pinchOff: 0.5,
  framesToStart: 2,
  framesToStop: 3,
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
  acceptScore: 0.8,
  // straight-line special case
  lineStraightness: 0.9, // chord / path length
  lineThinness: 0.22, // minor / major spread (PCA)
  lineAngleTolerance: 25, // degrees from horizontal / vertical
  // small rotation tolerance for $1 (orientation-sensitive otherwise)
  rotationTolerance: 15, // degrees
};

export const GAME = {
  hearts: 3,
  playerRadius: 40,
  monsterRadius: 30,
  contactDistance: 62,
  baseSpeed: 40,
  speedPerWave: 6,
  maxSpeed: 90,
  spawnIntervalStart: 2.0,
  spawnIntervalPerWave: 0.15,
  spawnIntervalFloor: 0.9,
  breather: 2.5,
  scorePerSymbol: 100,
  scorePerKill: 250,
  streakStep: 5, // casts per +0.5x streak multiplier
  streakMaxMult: 3,
  iconSize: 48,
  demoSeed: 20261115,
};

export function waveSpec(n: number) {
  return {
    count: 4 + 2 * n,
    speed: Math.min(GAME.maxSpeed, GAME.baseSpeed + GAME.speedPerWave * (n - 1)),
    interval: Math.max(GAME.spawnIntervalFloor, GAME.spawnIntervalStart - GAME.spawnIntervalPerWave * (n - 1)),
    maxQueue: n >= 5 ? 3 : n >= 3 ? 2 : 1,
  };
}
