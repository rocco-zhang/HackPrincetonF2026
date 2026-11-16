import { afterEach, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllGlobals());

async function densityAt(width: number, height: number, touch: boolean) {
  vi.resetModules();
  const viewport = {
    innerWidth: width,
    innerHeight: height,
    devicePixelRatio: 3,
    matchMedia: () => ({ matches: touch }),
  };
  vi.stubGlobal("window", viewport);
  const { renderDensity } = await import("../src/density");
  return { viewport, renderDensity };
}

it("uses the same camera-friendly density when starting a phone in either orientation", async () => {
  for (const [width, height] of [[393, 852], [852, 393]]) {
    const { viewport, renderDensity } = await densityAt(width, height, true);
    expect(renderDensity()).toBe(1);
    viewport.innerWidth = height;
    viewport.innerHeight = width;
    expect(renderDensity()).toBe(1);
  }
});

it("preserves sharp high-density desktop rendering", async () => {
  const { renderDensity } = await densityAt(1440, 900, false);
  expect(renderDensity()).toBe(2);
});
