import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { AtlasCollection } from "./atlas-data";
import { contextFiles, validateContext, type ContextFile } from "./atlas-context";
import { landmarkFiles, validateLandmarks, type Landmarks } from "./atlas-landmarks";
import { pointInRing, seaOrnaments, wavePoints } from "./atlas-ornaments";

const load = (file: string) => JSON.parse(readFileSync(`public/data/${file}`, "utf8"));
const land = load("land.geojson") as AtlasCollection;
const rings = land.features.flatMap((f) =>
  f.geometry.type === "MultiPolygon"
    ? f.geometry.coordinates.map((p) => p[0] as [number, number][])
    : [],
);

describe("sea ornaments", () => {
  it("never places a wave mark or ornament on land", () => {
    const points = [...wavePoints(land).features, ...seaOrnaments().features].map(
      (f) => f.geometry.coordinates,
    );
    expect(points.length).toBeGreaterThan(200);
    for (const point of points) expect(rings.some((ring) => pointInRing(point, ring))).toBe(false);
  });
});

describe("context files", () => {
  it.each(Object.entries(contextFiles) as [ContextFile, string][])(
    "%s passes validation with zero skipped features",
    (key, file) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const raw = load(file);
      expect(raw.features.length).toBeGreaterThan(0);
      expect(validateContext(key, raw).features).toHaveLength(raw.features.length);
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
      expect(readFileSync(`public/data/${file}`).length).toBeLessThan(1.5 * 1024 * 1024);
    },
  );

  it("keeps ships and the compass rose off neighbouring land", () => {
    const neighbors = (
      load("neighbors.geojson").features[0].geometry.coordinates as [number, number][][][]
    ).map((p) => p[0] as [number, number][]);
    for (const feature of seaOrnaments().features) {
      expect(neighbors.some((ring) => pointInRing(feature.geometry.coordinates, ring))).toBe(false);
    }
  });
});

describe.each(Object.entries(landmarkFiles) as [keyof Landmarks, string][])("%s", (key, file) => {
  it("passes validation with zero skipped features and stays under 1.5 MB", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const raw = load(file);
    expect(raw.features.length).toBeGreaterThan(0);
    expect(validateLandmarks(key, raw).features).toHaveLength(raw.features.length);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
    expect(readFileSync(`public/data/${file}`).length).toBeLessThan(1.5 * 1024 * 1024);
  });
});

it("keeps volcanoes free of mud pots, craters and duplicates", () => {
  const names: string[] = load("volcanoes.geojson").features.map(
    (f: { properties: { name: string } }) => f.properties.name,
  );
  expect(names.filter((name) => /bledug|lumpur|kawah|plain/i.test(name))).toEqual([]);
  expect(new Set(names).size).toBe(names.length);
});
