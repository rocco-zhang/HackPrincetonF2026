// Accessibility choices, remembered between visits. The palette, the art and the scenes read these.
const KEY = "spellcam.a11y";

export type A11y = {
  /** Marker colors that stay apart for red-green color blindness. */
  colorblind: boolean;
  /** How big the cards monsters carry are: 0 normal, 1 large, 2 extra large. */
  size: 0 | 1 | 2;
  /** No screen shake and no full-screen flashes. */
  reduceMotion: boolean;
  /** A plain sans-serif for reading text, instead of handwriting. */
  plainFont: boolean;
};

export const SIZE_NAMES = ["Normal", "Large", "Extra large"] as const;
export const SIZE_SCALE = [1, 1.3, 1.6] as const;

function load(): A11y {
  const d: A11y = { colorblind: false, size: 0, reduceMotion: false, plainFont: false };
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<A11y> | null;
    if (!s || typeof s !== "object") return d;
    return { colorblind: s.colorblind === true, size: s.size === 1 || s.size === 2 ? s.size : 0, reduceMotion: s.reduceMotion === true, plainFont: s.plainFont === true };
  } catch {
    return d;
  }
}

export const a11y: A11y = load();

const listeners: (() => void)[] = [];
/** Run now and after every change. */
export function onA11y(fn: () => void) {
  listeners.push(fn);
  fn();
}

export function setA11y(patch: Partial<A11y>) {
  Object.assign(a11y, patch);
  try {
    localStorage.setItem(KEY, JSON.stringify(a11y));
  } catch {
    // storage blocked: the choice still lasts for this session
  }
  for (const fn of listeners) fn();
}

/** The card scale for the current size setting. */
export const cardScale = () => SIZE_SCALE[a11y.size];

type Cam = { shake: (...a: never[]) => unknown; flash: (...a: never[]) => unknown };
/** With "reduce motion" on, make a scene's camera ignore shakes and flashes. */
export function calmCamera(cam: Cam) {
  if (!a11y.reduceMotion) return;
  cam.shake = () => cam;
  cam.flash = () => cam;
}
