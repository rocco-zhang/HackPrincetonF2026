import { ARENA } from "./config";

let density = 0;

/**
 * How many real pixels each game pixel gets: 1 on an ordinary screen, 2 on a high-density
 * (Retina) one. The game's world is always 1280×720; the canvas, the text and the art are
 * rendered with this many times the pixels so they aren't soft when stretched to the window.
 * Decided once, at startup.
 */
export function renderDensity(): number {
  if (!density) {
    // Keep camera + tracker memory independent of startup orientation on touch devices.
    if (window.matchMedia("(pointer: coarse)").matches) return (density = 1);
    const fit = Math.min(window.innerWidth / ARENA.width, window.innerHeight / ARENA.height);
    density = Math.min(2, Math.max(1, Math.ceil(fit * (window.devicePixelRatio || 1) - 0.15))); // 1 or 2: beyond that costs more than it shows
  }
  return density;
}
