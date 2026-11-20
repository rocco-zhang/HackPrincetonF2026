import { describe, expect, it } from "vitest";
import { edgePoint, healthAdjustedSpeed, makeSpawnAnglePicker, spawnDirections } from "../src/game/systems/spawnGeometry";
import { waveSpec } from "../src/config";
import { bossSpeedBoost, isBossWave, bossCards, bossCount } from "../src/game/bosses";
import { mulberry32 } from "../src/input/shapes";

function edgeShares(size: { width: number; height: number }) {
  const shares = { side: 0, top: 0, bottom: 0 };
  for (const d of spawnDirections(size)) {
    const p = edgePoint(d.angle, 50, size);
    const edge = Math.abs(p.x + 50) < 0.001 || Math.abs(p.x - size.width - 50) < 0.001 ? "side" : p.y < 0 ? "top" : "bottom";
    shares[edge] += d.weight;
  }
  const total = shares.side + shares.top + shares.bottom;
  return { side: shares.side / total, top: shares.top / total, bottom: shares.bottom / total };
}

describe("balanced spawning", () => {
  it("favors sides on a wide arena and bottom over top", () => {
    const shares = edgeShares({ width: 1280, height: 720 });
    expect(shares.side).toBeGreaterThan(shares.top);
    expect(shares.bottom).toBeGreaterThan(shares.top);
    expect(edgeShares({ width: 2000, height: 720 }).side).toBeGreaterThan(shares.side);
  });
  it("applies the recorded bottom factor to mirrored directions", () => {
    const plain = spawnDirections(undefined, 1), biased = spawnDirections(undefined, 1.5);
    plain.forEach((d, i) => expect(biased[i].weight / d.weight).toBeCloseTo(Math.sin(d.angle) > 0 ? 1.5 : 1));
  });
  it("spawns outside parameterized dimensions and handles random endpoints", () => {
    const size = { width: 900, height: 600 }, pick = makeSpawnAnglePicker(size);
    for (const value of [0, 0.25, 0.5, 0.75, 0.999999]) {
      const p = edgePoint(pick(() => value), 50, size);
      expect(Math.min(Math.abs(p.x + 50), Math.abs(p.x - 950), Math.abs(p.y + 50), Math.abs(p.y - 650))).toBeLessThan(0.001);
    }
  });
  it("scales speed by the square root of initial health", () => {
    expect(healthAdjustedSpeed(60, 1)).toBe(60);
    expect(healthAdjustedSpeed(60, 2)).toBeCloseTo(60 / Math.sqrt(2));
    expect(healthAdjustedSpeed(60, 3)).toBeCloseTo(60 / Math.sqrt(3));
    expect(healthAdjustedSpeed(60, 4)).toBe(30);
    expect(healthAdjustedSpeed(90, 4)).toBe(45);
  });
  it("unlocks four-card regular monsters and caps late-wave health", () => {
    expect(waveSpec(6).maxQueue).toBe(3);
    expect(waveSpec(7).maxQueue).toBe(4);
    expect(waveSpec(100).maxQueue).toBe(4);
  });
  it("reaches previous limits at wave 20 and higher limits at wave 30", () => {
    for (const [difficulty, speed, gap, count] of [["easy", 100, 0.7, 35], ["medium", 130, 0.45, 44], ["hard", 150, 0.3, 57]] as const) {
      expect(waveSpec(19, difficulty).speed).toBeLessThan(speed);
      expect(waveSpec(19, difficulty).interval).toBeGreaterThan(gap);
      expect(waveSpec(20, difficulty).speed).toBeCloseTo(speed);
      expect(waveSpec(20, difficulty).interval).toBeCloseTo(gap);
      expect(waveSpec(20, difficulty).count).toBe(count);
      expect(waveSpec(30, difficulty).speed).toBeCloseTo(speed * 1.5);
      expect(waveSpec(30, difficulty).interval).toBeCloseTo(gap / 2);
      expect(waveSpec(100, difficulty)).toEqual(waveSpec(30, difficulty));
      const duration = (count - 1) * gap;
      for (let wave = 21; wave <= 30; wave++) {
        const spec = waveSpec(wave, difficulty);
        const window = (spec.count - 1) * spec.interval;
        expect(window).toBeGreaterThanOrEqual(duration - 1e-9);
        expect(window).toBeLessThan(duration + spec.interval + 1e-9);
      }
    }
    expect(waveSpec(30).count).toBe(87);
  });
  it("boosts boss speed separately, caps boss health at twelve, and increases boss frequency", () => {
    expect(bossSpeedBoost(3)).toBe(1);
    expect(bossSpeedBoost(20)).toBe(2.5);
    expect(bossSpeedBoost(30)).toBe(3.75);
    expect(bossSpeedBoost(100)).toBe(3.75);
    expect(bossCards("shapes", 100, mulberry32(5)).symbols).toHaveLength(12);
    expect([14, 15, 16, 17, 20, 21, 22].map(isBossWave)).toEqual([false, true, true, true, true, true, true]);
    expect([0, 3, 14, 15, 16, 20, 21, 22, 23, 24, 25, 26, 28, 30, 31, 32, 100].map(bossCount)).toEqual([0, 1, 0, 1, 1, 1, 2, 3, 3, 4, 4, 5, 6, 7, 7, 8, 8]);
  });
});

