// Versus mode between two computers. Each browser runs its own arena; only outcomes are sent.
// The two connect directly (WebRTC data channel) after finding each other through PeerJS's free
// public broker, using a four-letter room code. There is no game server and no cheat protection.
import Peer, { type DataConnection } from "peerjs";

export type PvpMessage =
  | { t: "hello"; asl: boolean; math?: boolean; lang?: boolean } // host → guest: which mode we're playing
  | { t: "ready"; v: boolean }
  | { t: "start" } // host → guest: both are ready, go
  | { t: "attack"; n: number } // "I'm sending n monsters at you"
  | { t: "status"; hearts: number; score: number; wave: number }
  | { t: "dead"; score: number; forfeit?: boolean }
  | { t: "ping" };

export type PvpEvent =
  | { type: "state" } // status / ready flags changed
  | { type: "message"; msg: PvpMessage }
  | { type: "start" }
  | { type: "forfeit" }; // the opponent dropped and did not come back in time

export const PVP = {
  pingMs: 700,
  silentMs: 2500, // no word for this long = connection trouble
  graceMs: 5000, // …and this much longer to come back before it counts as a forfeit
};

const PREFIX = "spellcam-pvp-";
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I or O: they get misread

type Status = "off" | "hosting" | "joining" | "connected" | "reconnecting";

let peer: Peer | null = null;
let conn: DataConnection | null = null;
let lastHeard = 0;
let timer = 0;
let everConnected = false;
let lastRetry = 0;
const listeners = new Set<(e: PvpEvent) => void>();

export const pvp = {
  status: "off" as Status,
  code: "",
  isHost: false,
  error: "",
  myReady: false,
  theirReady: false,
  /** Latest hearts / score / wave the opponent reported. */
  them: { hearts: 3, score: 0, wave: 1 },
  /** Milliseconds left for a dropped opponent to come back (0 when connected). */
  graceLeft: 0,

  get active() {
    return this.status === "connected" || this.status === "reconnecting";
  },

  on(fn: (e: PvpEvent) => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  send(msg: PvpMessage) {
    if (conn?.open) conn.send(msg);
  },

  /** Open a room and wait for a friend. Resolves with the code to give them. */
  host(): Promise<string> {
    this.leave();
    this.isHost = true;
    this.code = Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");
    setStatus("hosting");
    return new Promise((resolve, reject) => {
      const p = (peer = new Peer(PREFIX + this.code));
      p.on("open", () => resolve(this.code));
      p.on("connection", (c) => {
        // one opponent at a time; a new connection is accepted only if the current one is gone
        if (conn?.open && this.status === "connected") return c.close();
        adopt(c);
      });
      p.on("disconnected", () => !p.destroyed && p.reconnect());
      p.on("error", (err) => {
        if (everConnected) return; // mid-match trouble is handled by the silence timer
        fail(err.type === "unavailable-id" ? "That code is taken, try hosting again." : `Couldn't open a room (${err.type}). Check the internet connection.`);
        reject(err);
      });
    });
  },

  /** Join a friend's room by its code. */
  join(code: string) {
    this.leave();
    this.isHost = false;
    this.code = code.trim().toUpperCase();
    setStatus("joining");
    const p = (peer = new Peer());
    p.on("open", () => dial());
    p.on("disconnected", () => !p.destroyed && p.reconnect());
    p.on("error", (err) => {
      if (everConnected) return;
      fail(err.type === "peer-unavailable" ? `No game found with code ${this.code}.` : `Couldn't connect (${err.type}). Check the internet connection.`);
    });
  },

  setReady(v: boolean) {
    this.myReady = v;
    this.send({ t: "ready", v });
    emit({ type: "state" });
    maybeStart();
  },

  /** Tell the guest which mode the host picked. */
  sendMode(asl: boolean, math = false, lang = false) {
    if (this.isHost) this.send({ t: "hello", asl, math, lang });
  },

  leave() {
    clearInterval(timer);
    timer = 0;
    conn?.close();
    conn = null;
    peer?.destroy();
    peer = null;
    everConnected = false;
    this.myReady = this.theirReady = false;
    this.error = "";
    this.graceLeft = 0;
    setStatus("off");
  },
};

/** Set by the lobby so a new connection can announce the host's mode. */
export let currentMode: () => { asl: boolean; math: boolean; lang: boolean } = () => ({ asl: false, math: false, lang: false });
export const setModeSource = (fn: () => { asl: boolean; math: boolean; lang: boolean }) => (currentMode = fn);

function emit(e: PvpEvent) {
  for (const fn of [...listeners]) fn(e);
}

function setStatus(s: Status) {
  pvp.status = s;
  emit({ type: "state" });
}

function fail(message: string) {
  pvp.leave();
  pvp.error = message;
  emit({ type: "state" });
}

function dial() {
  if (!peer || peer.destroyed) return;
  lastRetry = performance.now();
  adopt(peer.connect(PREFIX + pvp.code, { reliable: true }));
}

function adopt(c: DataConnection) {
  c.on("open", () => {
    conn?.close();
    conn = c;
    everConnected = true;
    lastHeard = performance.now();
    pvp.graceLeft = 0;
    pvp.error = "";
    setStatus("connected");
    if (pvp.isHost) {
      const mode = currentMode();
      pvp.send({ t: "hello", asl: mode.asl, math: mode.math, lang: mode.lang });
    }
    pvp.send({ t: "ready", v: pvp.myReady }); // after a reconnect, say where we stand
    if (!timer) timer = window.setInterval(tick, 250);
  });
  c.on("data", (data) => {
    if (c !== conn) return;
    lastHeard = performance.now();
    const msg = data as PvpMessage;
    if (msg.t === "ping") return;
    if (msg.t === "ready") {
      pvp.theirReady = msg.v;
      emit({ type: "state" });
      maybeStart();
      return;
    }
    if (msg.t === "start") return begin();
    if (msg.t === "status") pvp.them = { hearts: msg.hearts, score: msg.score, wave: msg.wave };
    emit({ type: "message", msg });
  });
}

/** Host: once both players are ready, start both games. */
function maybeStart() {
  if (!pvp.isHost || !pvp.myReady || !pvp.theirReady || pvp.status !== "connected") return;
  pvp.send({ t: "start" });
  begin();
}

function begin() {
  pvp.myReady = pvp.theirReady = false;
  pvp.them = { hearts: 3, score: 0, wave: 1 };
  emit({ type: "start" });
}

let lastPing = 0;
function tick() {
  const now = performance.now();
  if (now - lastPing > PVP.pingMs) {
    lastPing = now;
    pvp.send({ t: "ping" });
  }
  const silent = now - lastHeard;
  if (silent < PVP.silentMs) {
    if (pvp.status === "reconnecting") {
      pvp.graceLeft = 0;
      setStatus("connected");
    }
    return;
  }
  // connection trouble: give them a few seconds to come back
  pvp.graceLeft = Math.max(0, PVP.silentMs + PVP.graceMs - silent);
  if (pvp.status === "connected") setStatus("reconnecting");
  else emit({ type: "state" });
  // the guest is the one who can call back; retry about once a second
  if (!pvp.isHost && !conn?.open && now - lastRetry > 1000) dial();
  if (pvp.graceLeft === 0) {
    pvp.leave();
    pvp.error = "Your opponent disconnected.";
    emit({ type: "forfeit" });
  }
}
