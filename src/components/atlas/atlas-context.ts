import { z } from "zod";

const position = z.tuple([z.number().finite(), z.number().finite()]);
const polygonal = z.object({
  type: z.literal("MultiPolygon"),
  coordinates: z.array(z.array(z.array(position).min(4)).min(1)),
});
const linear = z.object({ type: z.literal("LineString"), coordinates: z.array(position).min(2) });
const point = z.object({ type: z.literal("Point"), coordinates: position });
const schemas = {
  neighbors: z.object({
    type: z.literal("Feature"),
    geometry: polygonal,
    properties: z.object({ name: z.string() }).passthrough(),
  }),
  bathymetry: z.object({
    type: z.literal("Feature"),
    geometry: polygonal,
    properties: z.object({ depth: z.number().positive() }).passthrough(),
  }),
  borders: z.object({
    type: z.literal("Feature"),
    geometry: linear,
    properties: z.object({ name: z.string() }).passthrough(),
  }),
  cities: z.object({
    type: z.literal("Feature"),
    geometry: point,
    properties: z
      .object({ name: z.string(), colonial: z.string().optional(), founded: z.number().optional() })
      .passthrough(),
  }),
};

export type CityFeature = {
  geometry: { coordinates: [number, number] };
  properties: {
    name: string;
    names?: [number, string][];
    founded?: number;
    country?: string;
    capital?: boolean;
    pop?: number;
  };
};
/** The name a city carried in a given year. Each entry in `names` holds the year a name ended; see PERIOD_NAMES in build-context.py. */
export const cityDisplayName = (city: CityFeature, year: number): string =>
  city.properties.names?.find(([until]) => year < until)?.[1] ?? city.properties.name;
export type ContextFile = keyof typeof schemas;
export const contextFiles: Record<ContextFile, string> = {
  neighbors: "neighbors.geojson",
  bathymetry: "bathymetry.geojson",
  borders: "borders.geojson",
  cities: "cities.geojson",
};
// MapLibre takes these as they are; the app never reads their geometry.
export type ContextCollection = { type: "FeatureCollection"; features: never[] };
export type AtlasContext = Record<ContextFile, ContextCollection>;

const empty = (): ContextCollection => ({ type: "FeatureCollection", features: [] });

/** Keeps valid features and warns about the rest, like validateAtlasCollection. */
export function validateContext(file: ContextFile, input: unknown): ContextCollection {
  const raw = z.object({ features: z.array(z.unknown()) }).parse(input).features;
  const features = raw.filter((feature, index) => {
    const ok = schemas[file].safeParse(feature).success;
    if (!ok)
      console.warn(
        `Fitur ${index + 1} dilewati pada ${contextFiles[file]}: geometri atau properti tidak valid.`,
      );
    return ok;
  });
  return { type: "FeatureCollection", features: features as never[] };
}

/** Context is optional: a file that fails to load leaves its layer empty and the atlas still works. */
let pending: Promise<AtlasContext> | undefined;

export function loadContext(baseUrl: string = import.meta.env.BASE_URL): Promise<AtlasContext> {
  pending ??= fetchContext(baseUrl);
  return pending;
}

async function fetchContext(baseUrl: string): Promise<AtlasContext> {
  const root = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const read = async (file: ContextFile) => {
    try {
      const response = await fetch(`${root}data/${contextFiles[file]}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return validateContext(file, await response.json());
    } catch (error) {
      console.warn(`${contextFiles[file]} could not load:`, error);
      return empty();
    }
  };
  const [neighbors, bathymetry, borders, cities] = await Promise.all([
    read("neighbors"),
    read("bathymetry"),
    read("borders"),
    read("cities"),
  ]);
  return { neighbors, bathymetry, borders, cities };
}
