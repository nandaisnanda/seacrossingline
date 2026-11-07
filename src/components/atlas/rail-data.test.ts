import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { deriveColonial, type AtlasCollection } from "./atlas-data";

type Fc = {
  features: {
    properties: Record<string, unknown>;
    geometry: { type: string; coordinates: number[][] };
  }[];
};
const load = (n: string): Fc => JSON.parse(readFileSync(`public/data/${n}.geojson`, "utf8"));

describe.each(["rail_active", "rail_disused"])("%s", (name) => {
  const fc = load(name);
  it("has only LineStrings with named features and 5-decimal coordinates", () => {
    expect(fc.features.length).toBeGreaterThan(0);
    for (const f of fc.features) {
      expect(f.geometry.type).toBe("LineString");
      expect(f.geometry.coordinates.length).toBeGreaterThanOrEqual(2);
      expect(typeof f.properties["name"]).toBe("string");
      for (const [x, y] of f.geometry.coordinates) {
        expect(Math.round((x ?? 0) * 1e5) / 1e5).toBe(x);
        expect(Math.round((y ?? 0) * 1e5) / 1e5).toBe(y);
      }
    }
  });
  it("stays under 1.5 MB", () => {
    expect(readFileSync(`public/data/${name}.geojson`).length).toBeLessThan(1.5 * 1024 * 1024);
  });
});

it("active has no year properties", () => {
  for (const f of load("rail_active").features) {
    expect(f.properties).not.toHaveProperty("closed_year");
    expect(f.properties).not.toHaveProperty("start_date");
  }
});

it("every opened_year has a source", () => {
  for (const name of ["rail_active", "rail_disused"])
    for (const f of load(name).features)
      if (f.properties["opened_year"] !== undefined)
        expect(f.properties["opened_year_source"]).toMatch(/^https:\/\//);
});

it("every old line opened by 1941 and names its source", () => {
  const colonial = deriveColonial(
    load("rail_active") as AtlasCollection,
    load("rail_disused") as AtlasCollection,
  ).features;
  expect(colonial.length).toBeGreaterThan(0);
  for (const f of colonial) {
    expect(f.properties["year_built"]).toBeLessThanOrEqual(1941);
    expect(f.properties["year_source"]).toMatch(/^https:\/\//);
  }
});

it("every closed_year has a source", () => {
  for (const f of load("rail_disused").features)
    if (f.properties["closed_year"] !== undefined)
      expect(f.properties["closed_year_source"]).toMatch(/^https:\/\//);
});
