import type { Observation } from "./pinchExperiment";

/** End a recording through tracking loss, never by extending its last recognized gesture. */
export function missingHandTail(last: Observation, lostHandMs: number): Observation[] {
  const tail: Observation[] = [];
  for (let dt = 33; dt <= lostHandMs + 100; dt += 33) {
    tail.push({ ...last, t: last.t + dt, landmarks: null, world: null, thumbUpScore: 0 });
  }
  return tail;
}
