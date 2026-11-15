// Versus mode between two computers. Each browser runs its own arena; only outcomes are sent.
// The two connect directly (WebRTC data channel) after finding each other through PeerJS's free
// public broker. There is no game server and no cheat protection.
//
// Finding each other, with no server of our own:
// - Hosting claims one of a fixed set of well-known room ids (the broker refuses an id that's
//   already taken, so each slot has one host). The lobby lists open games by briefly connecting to
//   every slot and asking who's there; hosts answer those probes with a RoomInfo and hang up.
// - Each public game also registers a second id, PREFIX + a four-letter join code, so a friend can
//   type the code instead of finding the game in the list. Both ids lead to the same host.
// - A private game registers only the join-code id, so it never shows up in the list.
// - Quick match joins the best open public game. It never hosts: hosting is its own button.
import Peer, { type DataConnection } from "peerjs";
import { DIFFICULTY, type Difficulty } from "../config";
import { cleanSubjects, type Subject } from "../game/subjects";

export type PvpMessage =
  | { t: "hello"; subjects: Subject[]; difficulty: Difficulty; revision: number } // host → guest: which subjects and difficulty we're playing
  | { t: "ready"; v: boolean; revision: number }
  | { t: "start"; revision: number } // host → guest: both are ready, go
  | { t: "attack"; n: number } // "I'm sending n monsters at you"
  | { t: "status"; hearts: number; score: number; wave: number }
  | { t: "dead"; score: number; forfeit?: boolean }
  | { t: "full" } // host → would-be guest: someone already took this game
  | { t: "ping" };

/** What a public host says about its game when the lobby asks. */
export type RoomInfo = { id: string; slot: number; name: string; subjects: Subject[]; difficulty: Difficulty; open: boolean };

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
/** Public games live at ROOM_PREFIX + 0 … ROOM_SLOTS - 1. */
const ROOM_PREFIX = "spellcam-room-v1-";
export const ROOM_SLOTS = 12;
const PROBE_MS = 3500; // a slot that hasn't answered by then is empty
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I or O: they get misread

type Status = "off" | "searching" | "hosting" | "joining" | "connected" | "reconnecting";

let peer: Peer | null = null;
/** Host: the second broker id, for the join code. */
let alias: Peer | null = null;
/** Bumped by leave(), so a claim still retrying from an earlier game gives up instead of registering. */
let session = 0;
let conn: DataConnection | null = null;
let lastHeard = 0;
let timer = 0;
let everConnected = false;
let lastRetry = 0;
let announcedMode = "";
const listeners = new Set<(e: PvpEvent) => void>();

export const pvp = {
  status: "off" as Status,
  /** What the player sees: a room code, or the host's name for a public game. */
  code: "",
  /** The broker id we dial as a guest. */
  target: "",
  isHost: false,
  /** The lobby slot of the public game we're hosting (-1 when not hosting, or hosting privately). */
  slot: -1,
  /** Which kind of game we're hosting, set as soon as hosting starts (before the ids are registered). */
  hostKind: null as "public" | "private" | null,
  /** The four-letter code friends can type to join the game we're hosting ("" if none). */
  joinCode: "",
  /** Looking for an opponent with quick match. */
  quick: false,
  /** Shown to other players in the lobby. */
  name: "Player",
  error: "",
  myReady: false,
  theirReady: false,
  modeRevision: 0,
  /** Latest hearts / score / wave the opponent reported. */
  them: { hearts: 3, score: 0, wave: 1 },
  /** Guest: the subjects and difficulty the host last announced. */
  hostMode: null as ModeChoice | null,
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

  /** Host a public game: list it in the lobby, and give it a join code for friends too. */
  hostPublic(): Promise<void> {
    this.leave();
    this.isHost = true;
    this.hostKind = "public";
    setStatus("hosting");
    // start at a random slot so two people hosting at once rarely race for the same one
    const first = Math.floor(Math.random() * ROOM_SLOTS);
    const ids = Array.from({ length: ROOM_SLOTS }, (_, i) => ROOM_PREFIX + ((first + i) % ROOM_SLOTS));
    return claim(ids).then(
      async (id) => {
        this.slot = Number(id.slice(ROOM_PREFIX.length));
        this.code = this.name;
        emit({ type: "state" });
        // the join code is a bonus: if every try is taken or fails, the game is still listed
        const codes = Array.from({ length: 4 }, randomCode);
        const got = await claim(codes.map((c) => PREFIX + c), true).catch(() => null);
        if (got && this.status === "hosting") {
          this.joinCode = got.slice(PREFIX.length);
          emit({ type: "state" });
        }
      },
      (err: { type?: string }) => {
        fail(err.type === "unavailable-id" ? "Every game slot is in use. Try again in a minute." : `Couldn't open a game (${err.type}). Check the internet connection.`);
        throw err;
      },
    );
  },

  /** Host a private game: not listed anywhere, joined only by its four-letter code. */
  hostPrivate(): Promise<void> {
    this.leave();
    this.isHost = true;
    this.hostKind = "private";
    setStatus("hosting");
    const codes = Array.from({ length: 4 }, randomCode);
    return claim(codes.map((c) => PREFIX + c)).then(
      (id) => {
        this.joinCode = id.slice(PREFIX.length);
        this.code = this.joinCode;
        emit({ type: "state" });
      },
      (err: { type?: string }) => {
        fail(`Couldn't open a game (${err.type}). Check the internet connection.`);
        throw err;
      },
    );
  },

  /** Join a game by its four-letter code. */
  join(code: string) {
    const c = code.trim().toUpperCase();
    this.dialTo(PREFIX + c, c);
  },

  /** Join a public game from the lobby list. */
  joinRoom(room: RoomInfo) {
    this.dialTo(room.id, room.name);
  },

  dialTo(target: string, label: string) {
    this.leave();
    this.isHost = false;
    this.target = target;
    this.code = label;
    setStatus("joining");
    const p = (peer = new Peer());
    p.on("open", () => dial());
    p.on("disconnected", () => !p.destroyed && p.reconnect());
    p.on("error", (err) => {
      if (everConnected) return;
      if (pvp.quick && err.type === "peer-unavailable") return void pvp.quickMatch(); // it closed: look again
      fail(err.type === "peer-unavailable" ? (target.startsWith(ROOM_PREFIX) ? "That game has closed." : `No game found with code ${label}.`) : `Couldn't connect (${err.type}). Check the internet connection.`);
    });
  },

  /** Quick match: join the open public game most like yours. If none is open, say so (hosting is its own button). */
  async quickMatch() {
    this.leave();
    this.quick = true;
    setStatus("searching");
    const rooms = await scanRooms();
    if (this.status !== "searching") return; // cancelled meanwhile
    const best = pickRoom(rooms.filter((r) => r.open));
    if (!best) return fail("No one is waiting right now. Press Host a game so someone can join you, or try again in a moment.");
    this.joinRoom(best);
    this.quick = true; // joinRoom reset it; keep it so a game that fills up first sends us looking again
  },

  /** Ask every public slot who's there. */
  scan: () => scanRooms(),

  setReady(v: boolean) {
    this.myReady = v;
    this.send({ t: "ready", v, revision: this.modeRevision });
    emit({ type: "state" });
    maybeStart();
  },

  /** Tell the guest which mode and difficulty the host picked. */
  sendMode() {
    if (!this.isHost) return;
    const mode = currentMode(), key = JSON.stringify(mode);
    if (key !== announcedMode) {
      announcedMode = key;
      this.modeRevision++;
      this.myReady = this.theirReady = false;
      emit({ type: "state" });
    }
    this.send({ t: "hello", ...mode, revision: this.modeRevision });
  },

  leave() {
    clearInterval(timer);
    timer = 0;
    this.slot = -1;
    this.quick = false;
    conn?.close();
    conn = null;
    peer?.destroy();
    peer = null;
    alias?.destroy();
    alias = null;
    this.joinCode = "";
    this.hostKind = null;
    session++;
    everConnected = false;
    this.myReady = this.theirReady = false;
    this.modeRevision = 0;
    announcedMode = "";
    this.error = "";
    this.graceLeft = 0;
    this.hostMode = null;
    setStatus("off");
  },
};

export type ModeChoice = { subjects: Subject[]; difficulty: Difficulty };
/** Set by the lobby so a new connection can announce the host's mode and difficulty. */
export let currentMode: () => ModeChoice = () => ({ subjects: ["shapes"], difficulty: "medium" });
export const setModeSource = (fn: () => ModeChoice) => (currentMode = fn);

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
  adopt(peer.connect(pvp.target, { reliable: true }));
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
    if (pvp.isHost) pvp.sendMode();
    pvp.send({ t: "ready", v: pvp.myReady, revision: pvp.modeRevision }); // after a reconnect, say where we stand
    if (!timer) timer = window.setInterval(tick, 250);
  });
  c.on("data", (data) => {
    if (c !== conn) return;
    lastHeard = performance.now();
    const msg = data as PvpMessage;
    if (msg.t === "ping") return;
    if (msg.t === "ready") {
      if (msg.revision !== pvp.modeRevision) return;
      pvp.theirReady = msg.v;
      emit({ type: "state" });
      maybeStart();
      return;
    }
    if (msg.t === "start") {
      if (!pvp.isHost && pvp.myReady && msg.revision === pvp.modeRevision) begin();
      return;
    }
    if (msg.t === "hello") {
      if (pvp.isHost || !Number.isInteger(msg.revision) || msg.revision < pvp.modeRevision) return;
      if (msg.revision !== pvp.modeRevision) {
        pvp.modeRevision = msg.revision;
        pvp.myReady = pvp.theirReady = false;
        pvp.send({ t: "ready", v: false, revision: pvp.modeRevision });
      }
      pvp.hostMode = { subjects: cleanSubjects(msg.subjects), difficulty: DIFFICULTY[msg.difficulty] ? msg.difficulty : "medium" };
    }
    if (msg.t === "full") {
      if (pvp.quick) return void pvp.quickMatch(); // beaten to it: look again
      return fail("Someone else just joined that game. Pick another, or try quick match.");
    }
    if (msg.t === "status") pvp.them = { hearts: msg.hearts, score: msg.score, wave: msg.wave };
    emit({ type: "message", msg });
  });
}

/** Host: once both players are ready, start both games. */
function maybeStart() {
  if (!pvp.isHost || !pvp.myReady || !pvp.theirReady || pvp.status !== "connected") return;
  pvp.send({ t: "start", revision: pvp.modeRevision });
  begin();
}

function begin() {
  pvp.myReady = pvp.theirReady = false;
  pvp.them = { hearts: DIFFICULTY[currentMode().difficulty].hearts, score: 0, wave: 1 };
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

function randomCode() {
  return Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");
}

/**
 * Host: register the first of these broker ids that's free, and accept guests and lobby probes on it.
 * The main id becomes `peer`; with asAlias it becomes `alias` (the join code), which works the same way.
 */
function claim(ids: string[], asAlias = false): Promise<string> {
  const mine = session;
  return new Promise((resolve, reject) => {
    const tryAt = (i: number) => {
      if (session !== mine) return reject(new Error("left"));
      const p = new Peer(ids[i]);
      if (asAlias) alias = p;
      else peer = p;
      let opened = false;
      p.on("open", () => {
        opened = true;
        resolve(ids[i]);
      });
      p.on("connection", (c) => {
        if ((c.metadata as { probe?: boolean } | undefined)?.probe) return answerProbe(c);
        // one opponent at a time; a new connection is accepted only if the current one is gone
        if (conn?.open && pvp.status === "connected") {
          c.on("open", () => {
            c.send({ t: "full" } satisfies PvpMessage);
            window.setTimeout(() => c.close(), 300);
          });
          return;
        }
        adopt(c);
      });
      p.on("disconnected", () => !p.destroyed && p.reconnect());
      p.on("error", (err) => {
        if (opened) return; // mid-match trouble is handled by the silence timer
        if (err.type === "unavailable-id" && i + 1 < ids.length && pvp.status === "hosting") {
          p.destroy();
          return tryAt(i + 1);
        }
        reject(err);
      });
    };
    tryAt(0);
  });
}

/** A lobby is asking who's here: say, then hang up. */
function answerProbe(c: DataConnection) {
  c.on("open", () => {
    const m = currentMode();
    const info: RoomInfo = {
      id: c.provider.id,
      slot: pvp.slot,
      name: pvp.name,
      subjects: m.subjects,
      difficulty: m.difficulty,
      open: pvp.status === "hosting",
    };
    c.send(info);
    window.setTimeout(() => c.close(), 1000);
  });
}

/** Connect briefly to every public slot and collect the answers. Empty slots just never answer. */
function scanRooms(): Promise<RoomInfo[]> {
  return new Promise((resolve) => {
    const scout = new Peer();
    const found = new Map<string, RoomInfo>();
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      scout.destroy();
      resolve([...found.values()].sort((a, b) => a.slot - b.slot));
    };
    scout.on("open", () => {
      for (let i = 0; i < ROOM_SLOTS; i++) {
        const id = ROOM_PREFIX + i;
        if (peer && !peer.destroyed && peer.id === id) continue; // that's us
        const c = scout.connect(id, { reliable: true, metadata: { probe: true } });
        c.on("data", (data) => {
          // answers come from other players' browsers: keep only well-formed fields
          const info = data as Partial<RoomInfo> | null;
          if (info && typeof info.name === "string") {
            found.set(id, {
              id,
              slot: i,
              name: info.name.trim().slice(0, 16) || "Player",
              subjects: cleanSubjects(info.subjects),
              difficulty: info.difficulty && DIFFICULTY[info.difficulty] ? info.difficulty : "medium",
              open: info.open === true,
            });
          }
          c.close();
          if (found.size >= ROOM_SLOTS) finish();
        });
      }
      window.setTimeout(finish, PROBE_MS);
    });
    scout.on("error", (err) => {
      if (err.type === "peer-unavailable") return; // an empty slot
      if (!scout.open) finish(); // couldn't reach the broker at all
    });
    window.setTimeout(finish, PROBE_MS + 4000); // never hang the lobby
  });
}

/** Quick match prefers a game like the one you picked, then one sharing a subject, then any open game. */
function pickRoom(rooms: RoomInfo[]): RoomInfo | null {
  const want = currentMode();
  const same = (r: RoomInfo) => r.subjects.join("+") === cleanSubjects(want.subjects).join("+");
  const overlap = (r: RoomInfo) => r.subjects.some((s) => want.subjects.includes(s));
  return (
    rooms.find((r) => same(r) && r.difficulty === want.difficulty) ??
    rooms.find(same) ??
    rooms.find(overlap) ??
    rooms[0] ??
    null
  );
}
