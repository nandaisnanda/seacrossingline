import { describe, expect, it } from "vitest";
import { atlasCopy } from "./atlas-i18n";
import {
  isFeatureVisibleForYear,
  isStationVisibleForYear,
  lineStateForYear,
  mergeCompletedReactivate,
  validateAtlasCollection,
  type AtlasData,
} from "./atlas-data";

const lineFeature = (name: string, properties: Record<string, unknown>) => ({
  type: "Feature" as const,
  properties,
  geometry: {
    type: "LineString" as const,
    coordinates: [
      [107, -7],
      [108, -8],
    ] as [number, number][],
  },
});

describe("SEA CROSSING LINE atlas data", () => {
  it("accepts valid railway GeoJSON", () => {
    const collection = validateAtlasCollection("active", {
      type: "FeatureCollection",
      features: [lineFeature("North Coast", { name: "North Coast", operator: "KAI" })],
    });
    expect(collection.features).toHaveLength(1);
  });

  it("accepts Natural Earth MultiPolygon coastline geometry", () => {
    const collection = validateAtlasCollection("land", {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { name: "Java" },
          geometry: {
            type: "MultiPolygon",
            coordinates: [
              [
                [
                  [105, -6],
                  [106, -6],
                  [106, -7],
                  [105, -7],
                  [105, -6],
                ],
              ],
            ],
          },
        },
      ],
    });
    expect(collection.features).toHaveLength(1);
    expect(collection.features[0]?.geometry.type).toBe("MultiPolygon");
  });

  it("rejects invalid GeoJSON collections", () => {
    expect(() =>
      validateAtlasCollection("active", { type: "FeatureCollection", features: "invalid" }),
    ).toThrow("rail_active.geojson");
  });

  it("keeps colonial routes hidden until their build year and disused routes hidden until closure", () => {
    expect(isFeatureVisibleForYear("colonial", { year_built: 1894 }, 1893)).toBe(false);
    expect(isFeatureVisibleForYear("colonial", { year_built: 1894 }, 1894)).toBe(true);
    expect(isFeatureVisibleForYear("disused", { closed_year: 1940 }, 1939)).toBe(false);
    expect(isFeatureVisibleForYear("disused", { closed_year: 1940 }, 1940)).toBe(true);
  });

  it("places a line on the timeline only where a source puts it", () => {
    expect(lineStateForYear("active", { opened_year: 2021 }, 2020)).toBe("hidden");
    expect(lineStateForYear("active", { opened_year: 2021 }, 2021)).toBe("running");
    expect(lineStateForYear("active", {}, 1867)).toBe("hidden");
    expect(lineStateForYear("active", {}, 2026)).toBe("running");
  });

  it("runs a disused line until it closes, then shows it as closed", () => {
    const line = { opened_year: 1943, closed_year: 1947 };
    expect(lineStateForYear("disused", line, 1942)).toBe("hidden");
    expect(lineStateForYear("disused", line, 1945)).toBe("running");
    expect(lineStateForYear("disused", line, 1947)).toBe("closed");
    expect(lineStateForYear("disused", { closed_year: 1947 }, 1945)).toBe("hidden");
    expect(lineStateForYear("disused", { opened_year: 1900 }, 1950)).toBe("closed");
    expect(lineStateForYear("disused", {}, 1950)).toBe("hidden");
    expect(lineStateForYear("disused", {}, 2026)).toBe("closed");
  });

  it("shows a station only from its opening year until a source closes it", () => {
    expect(isStationVisibleForYear({ opened_year: 2019 }, 2018)).toBe(false);
    expect(isStationVisibleForYear({ opened_year: 2019 }, 2019)).toBe(true);
    expect(isStationVisibleForYear({}, 1867)).toBe(false);
    expect(isStationVisibleForYear({}, 2026)).toBe(true);
    expect(isStationVisibleForYear({ opened_year: 1900, closed_year: 1950 }, 1950)).toBe(false);
  });

  it("shows a reactivation plan from the year of its source, whatever its target year", () => {
    expect(
      isFeatureVisibleForYear(
        "reactivation",
        { stage: "rencana", source_year: 2025, target_year: 2030 },
        2026,
      ),
    ).toBe(true);
    expect(
      isFeatureVisibleForYear("reactivation", { stage: "rencana", source_year: 2025 }, 2024),
    ).toBe(false);
  });

  it("treats completed reactivation as active and removes its matching disused route", () => {
    const completed = lineFeature("Kediri Sugar Tramway", {
      name: "Kediri Sugar Tramway",
      stage: "selesai",
      length_km: 18.6,
    });
    const data = {
      land: { type: "FeatureCollection", features: [] },
      active: { type: "FeatureCollection", features: [] },
      disused: {
        type: "FeatureCollection",
        features: [
          lineFeature("Kediri Sugar Tramway", { name: "Kediri Sugar Tramway", status: "disused" }),
        ],
      },
      reactivation: { type: "FeatureCollection", features: [completed] },
      colonial: { type: "FeatureCollection", features: [] },
    } as unknown as AtlasData;
    const merged = mergeCompletedReactivate(data);
    expect(merged.active.features.map((feature) => feature.properties["name"])).toContain(
      "Kediri Sugar Tramway",
    );
    expect(merged.disused.features).toHaveLength(0);
    expect(merged.reactivation.features).toHaveLength(0);
  });

  it("keeps the Indonesian and English interface dictionaries in sync", () => {
    expect(Object.keys(atlasCopy.id).sort()).toEqual(Object.keys(atlasCopy.en).sort());
  });
});
