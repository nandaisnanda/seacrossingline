import {
  isFeatureVisibleForYear,
  isStationVisibleForYear,
  type AtlasFeature,
  type AtlasFile,
} from "./atlas-data";
import type { LandmarkFeature } from "./atlas-landmarks";

export const CITY_RADIUS_KM = 15;
const MAX_LINES = 8;
const UNNAMED = /tanpa nama/i;

export type CityLine = { name: string; opened?: number; closed?: number };
export type CityDetails = {
  stations: number;
  lines: CityLine[];
  moreLines: number;
  unnamedLines: number;
  firstOpened?: number;
};

/** Distance in km from a point to a segment, on a flat projection scaled at the point's latitude. Accurate enough at 15 km. */
function distanceToSegmentKm(p: [number, number], a: number[], b: number[]): number {
  const kx = 111.32 * Math.cos((p[1] * Math.PI) / 180);
  const ky = 110.57;
  const ax = ((a[0] ?? 0) - p[0]) * kx,
    ay = ((a[1] ?? 0) - p[1]) * ky;
  const bx = ((b[0] ?? 0) - p[0]) * kx,
    by = ((b[1] ?? 0) - p[1]) * ky;
  const dx = bx - ax,
    dy = by - ay;
  const t = dx || dy ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(ax + t * dx, ay + t * dy);
}

function lineIsNear(center: [number, number], feature: AtlasFeature, radiusKm: number): boolean {
  if (feature.geometry.type !== "LineString") return false;
  const coords = feature.geometry.coordinates;
  for (let i = 1; i < coords.length; i++) {
    if (distanceToSegmentKm(center, coords[i - 1] as number[], coords[i] as number[]) <= radiusKm)
      return true;
  }
  return false;
}

/** What the map shows around a city in a given year. Features follow the same year rule as the map layers. */
export function cityDetails(
  center: [number, number],
  year: number,
  layers: Array<{ file: AtlasFile; features: AtlasFeature[] }>,
  stations: LandmarkFeature[],
  radiusKm = CITY_RADIUS_KM,
): CityDetails {
  const byName = new Map<string, CityLine>();
  let unnamedLines = 0;
  for (const { file, features } of layers) {
    for (const feature of features) {
      if (
        !isFeatureVisibleForYear(file, feature.properties, year) ||
        !lineIsNear(center, feature, radiusKm)
      )
        continue;
      const name = String(feature.properties["name"] ?? "");
      if (UNNAMED.test(name)) {
        unnamedLines++;
        continue;
      }
      const opened =
        typeof feature.properties["opened_year"] === "number"
          ? feature.properties["opened_year"]
          : undefined;
      const closed =
        typeof feature.properties["closed_year"] === "number"
          ? feature.properties["closed_year"]
          : undefined;
      const known = byName.get(name);
      if (!known)
        byName.set(name, {
          name,
          ...(opened === undefined ? {} : { opened }),
          ...(closed === undefined ? {} : { closed }),
        });
      else if (opened !== undefined && (known.opened === undefined || opened < known.opened))
        known.opened = opened;
    }
  }
  const all = [...byName.values()].sort(
    (a, b) => (a.opened ?? 9999) - (b.opened ?? 9999) || a.name.localeCompare(b.name),
  );
  const years = all.flatMap((line) => (line.opened === undefined ? [] : [line.opened]));
  const count = stations.filter(
    (s) =>
      isStationVisibleForYear(s.properties, year) &&
      distanceToSegmentKm(center, s.geometry.coordinates, s.geometry.coordinates) <= radiusKm,
  ).length;
  return {
    stations: count,
    lines: all.slice(0, MAX_LINES),
    moreLines: Math.max(0, all.length - MAX_LINES),
    unnamedLines,
    ...(years.length ? { firstOpened: Math.min(...years) } : {}),
  };
}
