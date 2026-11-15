// The Browse games panel: your name, quick match, the list of open games, and joining by a
// friend's four-letter code. Hosting is the Duel screen's own Host a game button, not part of this.
import type Phaser from "phaser";
import { DIFFICULTY, type Difficulty } from "../config";
import { SUBJECT_INFO } from "../game/subjects";
import { state } from "../state";
import { pvp, setModeSource, type RoomInfo } from "./pvp";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const NAME_KEY = "spellcam.name";
const REFRESH_MS = 8000; // re-list open games this often while the panel is open

let getGame: () => Phaser.Game | null = () => null;
let rooms: RoomInfo[] = [];
let scanning = false;
let lastScan = 0;
let refreshTimer = 0;
let shownList = ""; // what the room list currently shows, so a refresh with no change doesn't rebuild it

export const lobbyOpen = () => !$("lobby").hidden;

export function openLobby() {
  $("lobby").hidden = false;
  // typing a name or code must not trigger the game's hotkeys
  const kb = getGame()?.input.keyboard;
  if (kb) kb.enabled = false;
  render();
  clearInterval(refreshTimer);
  if (pvp.status === "off") void refresh();
  refreshTimer = window.setInterval(() => {
    if (pvp.status === "off" && performance.now() - lastScan > REFRESH_MS) void refresh();
  }, 1000);
}

export function closeLobby() {
  $("lobby").hidden = true;
  clearInterval(refreshTimer);
  refreshTimer = 0;
  const kb = getGame()?.input.keyboard;
  if (kb) kb.enabled = true;
}

/** Re-list the open public games. */
async function refresh() {
  if (scanning) return;
  scanning = true;
  render();
  try {
    rooms = await pvp.scan();
  } finally {
    scanning = false;
    lastScan = performance.now();
    render();
  }
}

function loadName(): string {
  try {
    const saved = localStorage.getItem(NAME_KEY)?.trim();
    if (saved) return saved;
  } catch {
    // storage blocked
  }
  return `Player ${10 + Math.floor(Math.random() * 90)}`;
}

function saveName(name: string) {
  pvp.name = name;
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // storage blocked: the name still lasts for this visit
  }
}

function tag(text: string, cls = "") {
  const el = document.createElement("span");
  el.className = `roomTag ${cls}`.trim();
  el.textContent = text;
  return el;
}

/** One tag per subject, then the difficulty in its own colour. */
function tags(r: RoomInfo) {
  const wrap = document.createElement("span");
  wrap.className = "roomTags";
  for (const s of r.subjects) wrap.append(tag(SUBJECT_INFO[s].label));
  wrap.append(tag(DIFFICULTY[r.difficulty].label, r.difficulty satisfies Difficulty));
  return wrap;
}

function render() {
  const s = pvp.status;
  const status = $("lobbyStatus");
  status.textContent =
    pvp.error ? pvp.error
    : s === "searching" ? "Looking for an opponent…"
    : s === "hosting" && pvp.hostKind === "private" ? `Private game, join code ${pvp.joinCode || "…"}. Waiting for your friend to join…`
    : s === "hosting" && pvp.slot < 0 ? "Opening a public game…"
    : s === "hosting" ? `Your game is listed as “${pvp.name}”${pvp.joinCode ? `, join code ${pvp.joinCode}` : ""}. Waiting for someone to join…`
    : s === "joining" ? `Joining ${pvp.code}…`
    : s === "connected" ? `Connected${pvp.isHost ? "" : ` to ${pvp.code}`}. Now both press Ready.`
    : s === "reconnecting" ? "Connection trouble…"
    : "Join an open game, try quick match, or type a friend's code.";
  status.classList.toggle("error", !!pvp.error);
  status.classList.toggle("live", s !== "off" && !pvp.error); // waiting / connected: the message is the main thing
  $("lobbyMenu").hidden = s !== "off";
  $("lobbyLeave").hidden = s === "off";
  $("lobbyLeave").textContent = s === "searching" || s === "hosting" || s === "joining" ? "Cancel" : "Disconnect";

  const refreshBtn = $<HTMLButtonElement>("lobbyRefresh");
  refreshBtn.disabled = scanning;
  refreshBtn.textContent = scanning ? "Looking…" : "Refresh";

  // rebuild only when something changed, so a Join button doesn't vanish under the cursor mid-click
  const key = rooms.length ? JSON.stringify(rooms) : `empty:${scanning}`;
  if (key === shownList) return;
  shownList = key;
  const open = rooms.filter((r) => r.open).length;
  $("lobbyRoomCount").textContent = rooms.length ? `· ${open} open${rooms.length > open ? `, ${rooms.length - open} playing` : ""}` : "";
  // room names come from other players: set as text, never as HTML
  const list = $("lobbyRoomList");
  list.replaceChildren();
  if (!rooms.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = scanning ? "Looking for open games…" : "No open games right now. Host one, or join with a code.";
    list.append(li);
  }
  for (const r of rooms) {
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.className = "roomName";
    name.textContent = r.name;
    const action = document.createElement("span");
    action.className = "roomAction";
    if (r.open) {
      const join = document.createElement("button");
      join.className = "small";
      join.textContent = "Join";
      join.addEventListener("click", () => pvp.joinRoom(r));
      action.append(join);
    } else {
      const busy = document.createElement("span");
      busy.className = "roomBusy";
      busy.textContent = "playing";
      action.append(busy);
    }
    li.append(name, tags(r), action);
    list.append(li);
  }
}

export function initLobby(game: () => Phaser.Game | null) {
  getGame = game;
  setModeSource(() => ({ subjects: state.subjects, difficulty: state.difficulty }));

  const nameInput = $<HTMLInputElement>("lobbyName");
  pvp.name = loadName();
  nameInput.value = pvp.name;
  nameInput.addEventListener("change", () => {
    const v = nameInput.value.trim().slice(0, 16);
    if (v) saveName(v);
    nameInput.value = pvp.name;
  });

  const code = $<HTMLInputElement>("lobbyCode");
  $("lobbyQuick").addEventListener("click", () => void pvp.quickMatch());
  $("lobbyRefresh").addEventListener("click", () => void refresh());
  const join = () => {
    if (code.value.trim().length === 4) pvp.join(code.value);
    else code.focus();
  };
  $("lobbyJoin").addEventListener("click", join);
  code.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") join();
  });
  $("lobbyLeave").addEventListener("click", () => {
    pvp.leave();
    void refresh();
  });
  $("lobbyClose").addEventListener("click", closeLobby);
  window.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && lobbyOpen()) closeLobby();
  });

  let wasConnected = false;
  pvp.on((e) => {
    if (e.type !== "state") return;
    render();
    // connected: get out of the way so both can hold to start
    if (pvp.status === "connected" && !wasConnected && lobbyOpen()) window.setTimeout(closeLobby, 1200);
    wasConnected = pvp.status === "connected";
  });
}
