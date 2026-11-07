import { describe, expect, it } from "vitest";
import { cityDetails } from "./atlas-city";
import type { AtlasFeature } from "./atlas-data";
import { cityDisplayName, type CityFeature } from "./atlas-context";
import { eraStarts, textForYear } from "./atlas-i18n";
import type { LandmarkFeature } from "./atlas-landmarks";

const line = (
  name: string,
  coordinates: [number, number][],
  extra: Record<string, unknown> = {},
): AtlasFeature => ({
  type: "Feature",
  geometry: { type: "LineString", coordinates },
  properties: { name, ...extra },
});
const station = (coordinates: [number, number], opened_year?: number): LandmarkFeature => ({
  type: "Feature",
  geometry: { type: "Point", coordinates },
  properties: { name: "S", kind: "station", ...(opened_year === undefined ? {} : { opened_year }) },
});

describe("cityDetails", () => {
  const near = line(
    "Near",
    [
      [100.1, 13],
      [100.2, 13.5],
    ],
    { opened_year: 1900 },
  );
  const young = line(
    "Young",
    [
      [100, 13.05],
      [100.5, 13.05],
    ],
    { opened_year: 2010 },
  );
  const far = line(
    "Far",
    [
      [102, 15],
      [103, 15],
    ],
    { opened_year: 1880 },
  );
  const unnamed = line("Jalur tanpa nama", [
    [100, 13],
    [100.01, 13],
  ]);
  const layers = [{ file: "active" as const, features: [near, young, far, unnamed] }];

  it("lists lines near the city that the map shows in that year", () => {
    const d = cityDetails([100, 13], 1950, layers, []);
    expect(d.lines.map((l) => l.name)).toEqual(["Near"]);
    expect(d.firstOpened).toBe(1900);
    expect(d.unnamedLines).toBe(0);
    expect(cityDetails([100, 13], 2026, layers, []).unnamedLines).toBe(1);
  });

  it("adds a line once the timeline reaches its opening year", () => {
    expect(cityDetails([100, 13], 2010, layers, []).lines.map((l) => l.name)).toEqual([
      "Near",
      "Young",
    ]);
  });

  it("counts stations within the radius and open by that year", () => {
    const stations = [
      station([100.05, 13.05]),
      station([100.05, 13], 1990),
      station([101, 14], 1900),
    ];
    expect(cityDetails([100, 13], 1950, [], stations).stations).toBe(0);
    expect(cityDetails([100, 13], 2000, [], stations).stations).toBe(1);
    expect(cityDetails([100, 13], 2026, [], stations).stations).toBe(2);
  });
});

describe("cityDisplayName", () => {
  const jakarta: CityFeature = {
    geometry: { coordinates: [106.8, -6.2] },
    properties: {
      name: "Jakarta",
      names: [
        [1942, "Batavia"],
        [1972, "Djakarta"],
      ],
    },
  };
  const makassar: CityFeature = {
    geometry: { coordinates: [119.4, -5.1] },
    properties: {
      name: "Makassar",
      names: [
        [1971, "Makassar"],
        [1999, "Ujung Pandang"],
      ],
    },
  };

  it("gives each year the name the city carried then", () => {
    expect(cityDisplayName(jakarta, 1941)).toBe("Batavia");
    expect(cityDisplayName(jakarta, 1942)).toBe("Djakarta");
    expect(cityDisplayName(jakarta, 1972)).toBe("Jakarta");
  });

  it("returns to an old name when a city took it back", () => {
    expect(cityDisplayName(makassar, 1950)).toBe("Makassar");
    expect(cityDisplayName(makassar, 1990)).toBe("Ujung Pandang");
    expect(cityDisplayName(makassar, 2000)).toBe("Makassar");
  });
});

describe("timeline eras", () => {
  it("names one era per range and uses no era name tied to one country", () => {
    expect(eraStarts).toEqual([1867, 1900, 1942, 1946, 1990]);
    expect(textForYear(1899, "en")).toBe("The first railways");
    expect(textForYear(1900, "en")).toBe("Networks spread");
    expect(textForYear(1945, "id")).toBe("Perang Pasifik");
    expect(textForYear(1946, "id")).toBe("Kemerdekaan dan penutupan jalur");
    expect(textForYear(2026, "id")).toBe("Jalur-jalur baru");
  });
});
