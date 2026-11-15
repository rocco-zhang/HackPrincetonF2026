import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class Emitter {
    private listeners = new Map<string, ((...args: unknown[]) => void)[]>();
    on(event: string, fn: (...args: unknown[]) => void) {
      this.listeners.set(event, [...this.listeners.get(event) ?? [], fn]); return this;
    }
    emit(event: string, ...args: unknown[]) { for (const fn of this.listeners.get(event) ?? []) fn(...args); }
  }
  return { Emitter, peers: [] as Emitter[] };
});
vi.mock("peerjs", () => {
  return { default: class extends mocks.Emitter {
    destroyed = false;
    constructor() { super(); mocks.peers.push(this); }
    destroy() { this.destroyed = true; }
  } };
});
import { pvp, setModeSource, type ModeChoice, type PvpEvent } from "../src/net/pvp";

class Connection extends mocks.Emitter {
  open = true;
  send = vi.fn();
  close() { this.open = false; }
}
let mode: ModeChoice;
beforeEach(() => {
  vi.stubGlobal("window", { setInterval: vi.fn(() => 1) });
  pvp.leave(); mocks.peers.length = 0;
  mode = {subjects:["shapes"],difficulty:"medium"};
  setModeSource(() => mode);
});
afterEach(() => { pvp.leave(); vi.unstubAllGlobals(); });
async function host() {
  const pending = pvp.hostPrivate();
  const peer = mocks.peers[0]; peer.emit("open", "spellcam-pvp-ABCD");
  await pending;
  const connection = new Connection();
  peer.emit("connection", connection); connection.emit("open");
  return connection;
}

describe("multiplayer setup readiness", () => {
  it("clears both ready flags on a mode change and rejects delayed readiness for the old mode", async () => {
    const conn = await host();
    const events: PvpEvent[] = []; const off = pvp.on(e => events.push(e));
    try {
      const oldRevision = pvp.modeRevision;
      conn.emit("data", {t:"ready",v:true,revision:oldRevision});
      expect(pvp.theirReady).toBe(true);
      mode = {subjects:["asl"],difficulty:"hard"}; pvp.sendMode();
      expect(pvp.myReady).toBe(false); expect(pvp.theirReady).toBe(false);
      expect(pvp.modeRevision).toBeGreaterThan(oldRevision);
      pvp.setReady(true);
      conn.emit("data", {t:"ready",v:true,revision:oldRevision});
      expect(events.some(e => e.type === "start")).toBe(false);
      conn.emit("data", {t:"ready",v:true,revision:pvp.modeRevision});
      expect(events.filter(e => e.type === "start")).toHaveLength(1);
    } finally { off(); }
  });
  it("also clears the host's ready state, but does not reset readiness when resending the same mode", async () => {
    await host(); pvp.setReady(true);
    pvp.sendMode(); expect(pvp.myReady).toBe(true);
    mode = {subjects:["shapes"],difficulty:"easy"}; pvp.sendMode();
    expect(pvp.myReady).toBe(false);
  });
  it("makes the guest reconfirm changed settings and ignores starts for an old setup", async () => {
    const conn = await host();
    pvp.isHost = false; // Use the same transport harness to exercise the guest receive path.
    conn.emit("data", {t:"hello",subjects:["shapes"],difficulty:"medium",revision:5});
    pvp.setReady(true);
    conn.emit("data", {t:"hello",subjects:["asl"],difficulty:"hard",revision:6});
    expect(pvp.myReady).toBe(false);
    expect(pvp.hostMode).toEqual({subjects:["asl"],difficulty:"hard"});
    const events: PvpEvent[] = []; const off = pvp.on(e => events.push(e));
    try {
      conn.emit("data", {t:"start",revision:5});
      conn.emit("data", {t:"start",revision:6});
      expect(events.some(e => e.type === "start")).toBe(false);
      pvp.setReady(true);
      conn.emit("data", {t:"start",revision:6});
      expect(events.filter(e => e.type === "start")).toHaveLength(1);
    } finally { off(); }
  });
});
