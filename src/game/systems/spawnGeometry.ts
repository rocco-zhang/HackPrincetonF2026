import { ARENA, GAME, SPAWN } from "../../config";

type Size = { width: number; height: number };

/** Intersect a center ray with the outer spawn rectangle. */
export function edgePoint(angle: number, margin = SPAWN.margin, size: Size = ARENA) {
  const cx = size.width / 2, cy = size.height / 2;
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const t = Math.min(
    Math.abs(dx) > 1e-6 ? (cx + margin) / Math.abs(dx) : Infinity,
    Math.abs(dy) > 1e-6 ? (cy + margin) / Math.abs(dy) : Infinity,
  );
  return { x: cx + dx * t, y: cy + dy * t };
}

/** Weight directions by readable travel distance, with extra bottom-half traffic. */
export function spawnDirections(size: Size = ARENA, bottomWeight = SPAWN.bottomWeight) {
  const cx = size.width / 2, cy = size.height / 2;
  // Clamp clearances so small arenas still have a usable rectangle around the player.
  const top = Math.max(1, cy - Math.min(cy - 1, SPAWN.hudTop + SPAWN.cardClearance));
  const bottom = Math.max(1, cy - Math.min(cy - 1, SPAWN.hudBottom));
  return Array.from({ length: SPAWN.directionBins }, (_, i) => {
    // Equal candidates per edge avoids the angular bias toward the nearby horizontal edges.
    const perEdge = SPAWN.directionBins / 4;
    const edge = Math.floor(i / perEdge);
    const fraction = ((i % perEdge) + 0.5) / perEdge;
    const x = edge < 2 ? (edge === 0 ? -SPAWN.margin : size.width + SPAWN.margin) : -SPAWN.margin + fraction * (size.width + 2 * SPAWN.margin);
    const y = edge < 2 ? -SPAWN.margin + fraction * (size.height + 2 * SPAWN.margin) : edge === 2 ? -SPAWN.margin : size.height + SPAWN.margin;
    const angle = Math.atan2(y - cy, x - cx);
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const readableDistance = Math.min(cx / Math.abs(dx), (dy < 0 ? top : bottom) / Math.abs(dy));
    const weight = Math.max(1, readableDistance - GAME.contactDistance) * (dy > 0 ? bottomWeight : 1);
    return { angle, weight };
  });
}

/** Build once per arena size; one random draw per spawn, including bosses. */
export function makeSpawnAnglePicker(size: Size = ARENA) {
  const directions = spawnDirections(size);
  const total = directions.reduce((sum, d) => sum + d.weight, 0);
  return (rand: () => number) => {
    let remaining = rand() * total;
    for (const d of directions) {
      remaining -= d.weight;
      if (remaining <= 0) return d.angle;
    }
    return directions[directions.length - 1].angle;
  };
}

/** Initial card count fixes the speed for life, so damaging a monster never accelerates it. */
export function healthAdjustedSpeed(speed: number, initialCards: number) {
  return speed / Math.sqrt(Math.max(1, initialCards));
}
