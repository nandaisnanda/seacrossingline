import { z } from "zod";

const positionSchema = z.tuple([z.number().finite(), z.number().finite()]);
const lineSchema = z.object({
  type: z.literal("LineString"),
  coordinates: z.array(positionSchema).min(2),
});
const polygonSchema = z.union([
  z.object({
    type: z.literal("Polygon"),
    coordinates: z.array(z.array(positionSchema).min(4)).min(1),
  }),
  z.object({
    type: z.literal("MultiPolygon"),
    coordinates: z.array(z.array(z.array(positionSchema).min(4)).min(1)).min(1),
  }),
]);
const featureSchema = z.object({
  type: z.literal("Feature"),
  geometry: z.unknown().optional(),
  properties: z.record(z.string(), z.unknown()).nullable().optional(),
});
const collectionSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(featureSchema),
});

const propertySchemas = {
  land: z.object({ name: z.string().optional() }).passthrough(),
  active: z
    .object({
      name: z.string(),
      operator: z.string().optional(),
      opened_year: z.number().int().optional(),
    })
    .passthrough(),
  disused: z
    .object({
      name: z.string(),
      status: z.enum(["disused", "abandoned"]).optional(),
      opened_year: z.number().int().optional(),
      closed_year: z.number().int().optional(),
    })
    .passthrough(),
  reactivation: z
    .object({
      name: z.string(),
      stage: z.enum(["rencana", "proses", "selesai"]),
      length_km: z.number().nonnegative(),
      source_url: z.string().url().optional(),
      source_year: z.number().int().optional(),
      target_year: z.number().int().optional(),
    })
    .passthrough(),
  colonial: z
    .object({
      name: z.string(),
      company: z.enum(["SS", "NIS"]).optional(),
      year_built: z.number().int().optional(),
    })
    .passthrough(),
} satisfies Record<string, z.ZodType>;

export type AtlasFile = keyof typeof propertySchemas;
export type AtlasProperties = Record<string, unknown>;
export type AtlasFeature = {
  type: "Feature";
  geometry:
    | { type: "LineString"; coordinates: [number, number][] }
    | { type: "Polygon"; coordinates: [number, number][][] }
    | { type: "MultiPolygon"; coordinates: [number, number][][][] };
  properties: AtlasProperties;
};
export type AtlasCollection = { type: "FeatureCollection"; features: AtlasFeature[] };
export type AtlasData = Record<AtlasFile, AtlasCollection>;

export const atlasFiles: Record<AtlasFile, string> = {
  land: "land.geojson",
  active: "rail_active.geojson",
  disused: "rail_disused.geojson",
  reactivation: "reactivation.geojson",
  colonial: "colonial.geojson",
};

export function validateAtlasCollection(file: AtlasFile, input: unknown): AtlasCollection {
  const parsedCollection = collectionSchema.safeParse(input);
  if (!parsedCollection.success) {
    throw new Error(`Berkas ${atlasFiles[file]} tidak sesuai GeoJSON FeatureCollection.`);
  }

  const features: AtlasFeature[] = [];
  parsedCollection.data.features.forEach((feature, index) => {
    const geometrySchema = file === "land" ? polygonSchema : lineSchema;
    const parsedGeometry = geometrySchema.safeParse(feature.geometry);
    const parsedProperties = propertySchemas[file].safeParse(feature.properties ?? {});
    if (!parsedGeometry.success || !parsedProperties.success) {
      console.warn(
        `Fitur ${index + 1} dilewati pada ${atlasFiles[file]}: geometri atau properti tidak valid.`,
      );
      return;
    }
    features.push({
      type: "Feature",
      geometry: parsedGeometry.data as AtlasFeature["geometry"],
      properties: parsedProperties.data as AtlasProperties,
    });
  });
  return { type: "FeatureCollection", features };
}

export async function loadAtlasData(
  baseUrl = import.meta.env.BASE_URL,
  fetcher: typeof fetch = fetch,
): Promise<AtlasData> {
  const root = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const entries = await Promise.all(
    Object.entries(atlasFiles).map(async ([key, file]) => {
      const response = await fetcher(`${root}data/${file}`);
      if (!response.ok)
        throw new Error(`Berkas ${file} tidak dapat dibuka (HTTP ${response["status"]}).`);
      return [key, validateAtlasCollection(key as AtlasFile, await response.json())] as const;
    }),
  );
  return Object.fromEntries(entries) as AtlasData;
}

/** The last year of the timeline: the one year where a feature with no sourced date is known to exist. */
export const LATEST_YEAR = 2026;

export type LineState = "hidden" | "running" | "closed";

/**
 * What a line was in a given year. A feature shows only when a source places it there:
 * before its opening year it does not exist, and with no year at all only today's map can show it.
 * A disused line with both years runs until it closes. With a closing year alone, nothing proves when it began,
 * so it appears only as a closed line.
 */
export function lineStateForYear(
  file: "active" | "disused",
  properties: AtlasProperties,
  year: number,
): LineState {
  const opened =
    typeof properties["opened_year"] === "number" ? properties["opened_year"] : undefined;
  const closed =
    typeof properties["closed_year"] === "number" ? properties["closed_year"] : undefined;
  if (opened !== undefined && year < opened) return "hidden";
  if (file === "active") return opened !== undefined || year >= LATEST_YEAR ? "running" : "hidden";
  if (closed !== undefined)
    return year >= closed ? "closed" : opened !== undefined ? "running" : "hidden";
  return opened !== undefined || year >= LATEST_YEAR ? "closed" : "hidden";
}

export function isFeatureVisibleForYear(
  file: AtlasFile,
  properties: AtlasProperties,
  year: number,
): boolean {
  if (file === "colonial")
    return typeof properties["year_built"] !== "number" || properties["year_built"] <= year;
  if (file === "active" || file === "disused")
    return lineStateForYear(file, properties, year) !== "hidden";
  // A reactivation plan appears from the year of its source; target_year may lie beyond the timeline.
  if (file === "reactivation")
    return (
      (typeof properties["source_year"] === "number" ? properties["source_year"] : LATEST_YEAR) <=
      year
    );
  return true;
}

/** A station shows from its opening year, or only on today's map with no year, and leaves when a source closes it. */
export function isStationVisibleForYear(
  properties: { opened_year?: number; closed_year?: number },
  year: number,
): boolean {
  if (properties.closed_year !== undefined && year >= properties.closed_year) return false;
  return (properties.opened_year ?? LATEST_YEAR) <= year;
}

export function mergeCompletedReactivate(data: AtlasData): AtlasData {
  const completed = data.reactivation.features.filter(
    (feature) => feature.properties["stage"] === "selesai",
  );
  const completedNames = new Set(
    completed.map((feature) => String(feature.properties["name"]).toLocaleLowerCase()),
  );
  const completedGeometry = new Set(
    completed.map((feature) => JSON.stringify(feature.geometry.coordinates)),
  );
  return {
    ...data,
    active: { ...data.active, features: [...data.active.features, ...completed] },
    disused: {
      ...data.disused,
      features: data.disused.features.filter((feature) => {
        const sameName = completedNames.has(String(feature.properties["name"]).toLocaleLowerCase());
        const sameGeometry = completedGeometry.has(JSON.stringify(feature.geometry.coordinates));
        return !sameName && !sameGeometry;
      }),
    },
    reactivation: {
      ...data.reactivation,
      features: data.reactivation.features.filter(
        (feature) => feature.properties["stage"] !== "selesai",
      ),
    },
  };
}
