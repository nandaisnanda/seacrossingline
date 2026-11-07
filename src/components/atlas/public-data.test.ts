import { readFileSync, statSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { atlasFiles, validateAtlasCollection, type LoadedFile } from "./atlas-data";

const entries = Object.entries(atlasFiles) as [LoadedFile, string][];
const pathOf = (file: string) => `public/data/${file}`;
const load = (file: string) => JSON.parse(readFileSync(pathOf(file), "utf8"));

describe.each(entries)("%s (%s)", (key, file) => {
  afterEach(() => vi.restoreAllMocks());

  it("passes validation with zero skipped features", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const raw = load(file);
    expect(validateAtlasCollection(key, raw).features).toHaveLength(raw.features.length);
    expect(warn).not.toHaveBeenCalled();
  });

  it("has no MultiLineString", () => {
    const types = load(file).features.map((f: { geometry: { type: string } }) => f.geometry.type);
    expect(types).not.toContain("MultiLineString");
  });

  it("stays under 1.5 MB", () => {
    expect(statSync(pathOf(file)).size).toBeLessThan(1.5 * 1024 * 1024);
  });
});

it("gives every reactivation feature a source_url", () => {
  for (const f of load(atlasFiles.reactivation).features) {
    expect(f.properties.source_url).toMatch(/^https:\/\//);
  }
});

it("draws 12 reactivation lines, each with a stated stage and length", () => {
  const features = load(atlasFiles.reactivation).features;
  expect(features).toHaveLength(12);
  for (const f of features) expect(f.properties.length_km).toBeGreaterThan(0);
});
