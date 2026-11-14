// The "play versus a friend" panel: host a room and get a code, or type a friend's code.
import type Phaser from "phaser";
import { state } from "../state";
import { pvp, setModeSource } from "./pvp";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

let getGame: () => Phaser.Game | null = () => null;

export const lobbyOpen = () => !$("lobby").hidden;

export function openLobby() {
  $("lobby").hidden = false;
  // typing a code must not trigger the game's hotkeys
  const kb = getGame()?.input.keyboard;
  if (kb) kb.enabled = false;
  render();
  if (pvp.status === "off") $<HTMLInputElement>("lobbyCode").focus();
}

export function closeLobby() {
  $("lobby").hidden = true;
  const kb = getGame()?.input.keyboard;
  if (kb) kb.enabled = true;
}

function render() {
  const s = pvp.status;
  const status = $("lobbyStatus");
  status.textContent =
    pvp.error ? pvp.error
    : s === "hosting" ? `Your code is ${pvp.code}. Your friend presses V, types it in and joins.`
    : s === "joining" ? `Joining ${pvp.code}…`
    : s === "connected" ? `Connected${pvp.isHost ? "" : ` to ${pvp.code}`}. Close this, then both hold to get ready.`
    : s === "reconnecting" ? "Connection trouble…"
    : "One of you hosts and reads out the code; the other joins with it.";
  status.classList.toggle("error", !!pvp.error);
  $("lobbyActions").hidden = s !== "off";
  $("lobbyLeave").hidden = s === "off";
  $("lobbyLeave").textContent = s === "hosting" || s === "joining" ? "Cancel" : "Disconnect";
}

export function initLobby(game: () => Phaser.Game | null) {
  getGame = game;
  setModeSource(() => state.aslSelected);
  const code = $<HTMLInputElement>("lobbyCode");

  $("lobbyHost").addEventListener("click", () => void pvp.host().catch(() => {}));
  const join = () => {
    if (code.value.trim().length === 4) pvp.join(code.value);
    else code.focus();
  };
  $("lobbyJoin").addEventListener("click", join);
  code.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") join();
  });
  $("lobbyLeave").addEventListener("click", () => pvp.leave());
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
