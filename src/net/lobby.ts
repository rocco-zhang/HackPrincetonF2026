// The versus panel: quick match, a list of open public games, or a private game with a room code.
import type Phaser from "phaser";
import { DIFFICULTY, type Difficulty } from "../config";
import { subjectsLabel, type Subject } from "../game/subjects";
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
  if (pvp.status === "off") void refresh();
  clearInterval(refreshTimer);
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

function describe(r: { subjects: Subject[]; difficulty: Difficulty }) {
  return `${subjectsLabel(r.subjects)} · ${DIFFICULTY[r.difficulty].label}`;
}

function render() {
  const s = pvp.status;
  const status = $("lobbyStatus");
  const publicGame = pvp.slot >= 0;
  status.textContent =
    pvp.error ? pvp.error
    : s === "searching" ? "Looking for an opponent…"
    : s === "hosting" && pvp.quick ? "No one was waiting, so you're hosting a public game. Waiting for an opponent…"
    : s === "hosting" && publicGame ? `Your game is listed as “${pvp.name}”. Waiting for someone to join…`
    : s === "hosting" && pvp.code ? `Your code is ${pvp.code}. Your friend opens Duel on their computer and joins with it.`
    : s === "hosting" ? "Opening a game…"
    : s === "joining" ? `Joining ${pvp.code}…`
    : s === "connected" ? `Connected${pvp.isHost ? "" : ` to ${pvp.code}`}. Now both press Ready.`
    : s === "reconnecting" ? "Connection trouble…"
    : "Quick match finds you an opponent, or pick an open game below.";
  status.classList.toggle("error", !!pvp.error);
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
  // room names come from other players: set as text, never as HTML
  const list = $("lobbyRoomList");
  list.replaceChildren();
  if (!rooms.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = scanning ? "Looking for open games…" : "No open games right now. Host one, or use quick match.";
    list.append(li);
  }
  for (const r of rooms) {
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.className = "roomName";
    name.textContent = r.name;
    const mode = document.createElement("span");
    mode.className = "roomMode";
    mode.textContent = describe(r);
    li.append(name, mode);
    if (r.open) {
      const join = document.createElement("button");
      join.className = "small";
      join.textContent = "Join";
      join.addEventListener("click", () => pvp.joinRoom(r));
      li.append(join);
    } else {
      const busy = document.createElement("span");
      busy.className = "roomBusy";
      busy.textContent = "playing";
      li.append(busy);
    }
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
  $("lobbyHostPublic").addEventListener("click", () => void pvp.hostPublic().catch(() => {}));
  $("lobbyRefresh").addEventListener("click", () => void refresh());
  $("lobbyHost").addEventListener("click", () => void pvp.host().catch(() => {}));
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
