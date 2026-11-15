// Procedural sound effects (Web Audio) and the background music (one looping file).
// Both start on the "Enable camera & sound" click, which browsers require before playing audio.
import { ASL_NAMES, isLang, isMath, isSymbol, SYMBOLS, type CastName, type SymbolName } from "../input/events";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let music: HTMLAudioElement | null = null;

const AUDIO_KEY = "spellcam.audio";
const MUSIC_URL = "./audio/bg_music.mp3";
// what a slider at full means: effects are short and loud, music sits underneath them
const SFX_GAIN = 0.7;
const MUSIC_GAIN = 0.6;

export type AudioSettings = { sfxOn: boolean; sfxVol: number; musicOn: boolean; musicVol: number };

function loadAudio(): AudioSettings {
  const d: AudioSettings = { sfxOn: true, sfxVol: 0.7, musicOn: true, musicVol: 0.5 };
  try {
    const s = JSON.parse(localStorage.getItem(AUDIO_KEY) ?? "null") as Partial<AudioSettings> | null;
    if (!s || typeof s !== "object") return d;
    const vol = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback);
    return { sfxOn: s.sfxOn !== false, sfxVol: vol(s.sfxVol, d.sfxVol), musicOn: s.musicOn !== false, musicVol: vol(s.musicVol, d.musicVol) };
  } catch {
    return d;
  }
}

/** Sound-effect and music switches and volumes (0–1), remembered between visits. */
export const audio: AudioSettings = loadAudio();

function applyAudio() {
  if (master) master.gain.value = audio.sfxOn ? audio.sfxVol * SFX_GAIN : 0;
  if (!music) return;
  music.volume = audio.musicVol * MUSIC_GAIN;
  const play = audio.musicOn && audio.musicVol > 0;
  if (play && music.paused) void music.play().catch(() => {}); // refused until the first click or key press
  else if (!play && !music.paused) music.pause();
}

export function setAudio(patch: Partial<AudioSettings>) {
  Object.assign(audio, patch);
  try {
    localStorage.setItem(AUDIO_KEY, JSON.stringify(audio));
  } catch {
    // storage blocked: the choice still lasts for this session
  }
  applyAudio();
}

export function unlockAudio() {
  if (!music) {
    music = new Audio(MUSIC_URL);
    music.loop = true;
    music.preload = "auto";
  }
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  void ctx.resume();
  applyAudio();
}

/** Everything off, or (if everything already is) everything back on. Returns true when now silent. */
export function toggleMute() {
  const on = audio.sfxOn || audio.musicOn;
  setAudio({ sfxOn: !on, musicOn: !on });
  return on;
}

type ToneOpts = {
  freq: number;
  to?: number;
  type?: OscillatorType;
  dur?: number;
  gain?: number;
  delay?: number;
  attack?: number;
};

function tone({ freq, to, type = "sine", dur = 0.2, gain = 0.3, delay = 0, attack = 0.005 }: ToneOpts) {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

type NoiseOpts = { dur?: number; freq?: number; to?: number; q?: number; gain?: number; delay?: number; type?: BiquadFilterType };

function noise({ dur = 0.2, freq = 1200, to, q = 1, gain = 0.3, delay = 0, type = "bandpass" }: NoiseOpts) {
  if (!ctx || !master || !noiseBuf) return;
  const t0 = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, t0);
  if (to) f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t0, Math.random() * 0.5);
  src.stop(t0 + dur + 0.05);
}

const SYMBOL_SFX: Record<SymbolName, () => void> = {
  hline: () => {
    tone({ freq: 660, to: 990, dur: 0.18, type: "sine" });
    noise({ dur: 0.15, freq: 3000, to: 6000, gain: 0.08 });
  },
  vline: () => {
    tone({ freq: 330, to: 880, dur: 0.16, type: "square", gain: 0.12 });
    tone({ freq: 660, dur: 0.12, delay: 0.05, gain: 0.15 });
  },
  v: () => {
    tone({ freq: 523, dur: 0.25, type: "triangle", gain: 0.25 });
    tone({ freq: 784, dur: 0.25, type: "triangle", gain: 0.2, delay: 0.04 });
  },
  caret: () => {
    tone({ freq: 392, to: 784, dur: 0.2, type: "sawtooth", gain: 0.1 });
    tone({ freq: 1175, dur: 0.15, delay: 0.08, gain: 0.12 });
  },
  circle: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, dur: 0.18, delay: i * 0.04, gain: 0.18 }));
  },
  zigzag: () => {
    [880, 620, 990, 700].forEach((f, i) => tone({ freq: f, dur: 0.06, delay: i * 0.035, type: "square", gain: 0.08 }));
    noise({ dur: 0.25, freq: 2500, q: 0.5, gain: 0.18, type: "highpass" });
  },
};

export const sfx = {
  // ASL letters reuse the six symbol sounds, in order
  symbol: (name: CastName) => {
    const key = isSymbol(name) ? name : isMath(name) || isLang(name) ? "circle" : SYMBOLS[Math.max(0, ASL_NAMES.indexOf(name)) % SYMBOLS.length];
    SYMBOL_SFX[key]();
  },
  hit: () => tone({ freq: 1400, to: 700, dur: 0.08, type: "triangle", gain: 0.15 }),
  kill: () => {
    noise({ dur: 0.35, freq: 900, to: 150, q: 0.8, gain: 0.35 });
    tone({ freq: 300, to: 60, dur: 0.3, type: "sine", gain: 0.3 });
  },
  hurt: () => {
    tone({ freq: 140, to: 50, dur: 0.4, type: "sawtooth", gain: 0.3 });
    noise({ dur: 0.3, freq: 400, gain: 0.3, type: "lowpass" });
  },
  fizzle: () => noise({ dur: 0.25, freq: 2000, to: 400, q: 2, gain: 0.12 }),
  multi: (n: number) => [0, 4, 7, 12].slice(0, n + 1).forEach((st, i) =>
    tone({ freq: 523 * Math.pow(2, st / 12), dur: 0.3, delay: i * 0.06, type: "triangle", gain: 0.2 })),
  wave: () => [392, 523, 659].forEach((f, i) => tone({ freq: f, dur: 0.35, delay: i * 0.09, type: "triangle", gain: 0.2 })),
  fire: () => {
    noise({ dur: 0.35, freq: 400, to: 1800, q: 0.6, gain: 0.28, type: "bandpass" });
    tone({ freq: 180, to: 90, dur: 0.28, type: "sawtooth", gain: 0.12 });
  },
  water: () => {
    tone({ freq: 520, to: 240, dur: 0.32, type: "sine", gain: 0.22 });
    noise({ dur: 0.22, freq: 1800, to: 600, q: 0.7, gain: 0.12, type: "lowpass" });
  },
  start: () => [262, 392, 523, 784].forEach((f, i) => tone({ freq: f, dur: 0.25, delay: i * 0.07, gain: 0.2 })),
  gameOver: () => [392, 330, 262, 196].forEach((f, i) => tone({ freq: f, dur: 0.45, delay: i * 0.18, type: "triangle", gain: 0.22 })),
  tick: () => tone({ freq: 880, dur: 0.04, gain: 0.06 }),
};
