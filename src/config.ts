// All tunables in one place.

export const ARENA = { width: 1280, height: 720 } as const;

export const INPUT = {
  // pinch = dist(thumb tip, index tip) / dist(wrist, middle-finger base)
  pinchOn: 0.35,
  pinchOff: 0.6,
  framesToStart: 2,
  framesToStop: 3,
  // A release must also last this long before the stroke ends, so blurred or dropped
  // frames mid-stroke don't cut it. The stroke is cut back to where the release began.
  releaseMs: 180,
  lostHandMs: 300,
  // What the cursor follows. "knuckle" (index-finger base) stays put while the fingers
  // pinch and open; "pinch" (thumb/index-tip midpoint) is closer to the fingertip but hooks strokes.
  cursorAnchor: "knuckle" as "knuckle" | "pinch",
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
  acceptScore: 0.76,
  // lower bar when matching only against symbols a Hollow currently needs
  acceptScoreWanted: 0.55,
  // ...but only if it scores within this much of the best match overall, so a clear ring stays a ring
  wantedMargin: 0.08,
  // straight-line special case
  lineStraightness: 0.86, // chord / path length
  lineThinness: 0.28, // minor / major spread (PCA)
  lineAngleTolerance: 35, // degrees from horizontal / vertical
  lineAngleToleranceWanted: 55, // when only one of dash / pillar is needed
  // small rotation tolerance for $1 (orientation-sensitive otherwise)
  rotationTolerance: 25, // degrees
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
