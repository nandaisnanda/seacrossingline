import { z } from "zod";

const pointSchema = z.object({
  type: z.literal("Point"),
  coordinates: z.tuple([z.number().finite(), z.number().finite()]),
});
const featureSchema = <T extends z.ZodType>(properties: T) =>
  z.object({ type: z.literal("Feature"), geometry: pointSchema, properties });
const stationSchema = featureSchema(
  z.object({ name: z.string(), kind: z.enum(["station", "halt"]) }).passthrough(),
);
const volcanoSchema = featureSchema(
  z.object({ name: z.string(), ele: z.number().optional() }).passthrough(),
);

export type LandmarkFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    name: string;
    ele?: number;
    kind?: "station" | "halt";
    opened_year?: number;
    closed_year?: number;
  };
};
export type LandmarkCollection = { type: "FeatureCollection"; features: LandmarkFeature[] };
export type Landmarks = { stations: LandmarkCollection; volcanoes: LandmarkCollection };

export const landmarkFiles = {
  stations: "stations.geojson",
  volcanoes: "volcanoes.geojson",
} as const;

/** Keeps valid features and warns about the rest, like validateAtlasCollection. */
export function validateLandmarks(file: keyof Landmarks, input: unknown): LandmarkCollection {
  const schema = file === "stations" ? stationSchema : volcanoSchema;
  const raw = z.object({ features: z.array(z.unknown()) }).parse(input).features;
  const features: LandmarkFeature[] = [];
  raw.forEach((feature, index) => {
    const parsed = schema.safeParse(feature);
    if (parsed.success) features.push(parsed.data as unknown as LandmarkFeature);
    else
      console.warn(
        `Fitur ${index + 1} dilewati pada ${landmarkFiles[file]}: geometri atau properti tidak valid.`,
      );
  });
  return { type: "FeatureCollection", features };
}

let pending: Promise<Landmarks> | undefined;

/** Shared by the map layers and the labels. Landmarks are optional: a failed fetch leaves both layers empty. */
export function loadLandmarks(baseUrl: string = import.meta.env.BASE_URL): Promise<Landmarks> {
  pending ??= (async () => {
    const root = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    const read = async (file: keyof Landmarks) => {
      const response = await fetch(`${root}data/${landmarkFiles[file]}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return validateLandmarks(file, await response.json());
    };
    const [stations, volcanoes] = await Promise.all([read("stations"), read("volcanoes")]);
    return { stations, volcanoes };
  })().catch((error: unknown) => {
    console.warn("Atlas landmarks could not load:", error);
    const empty: LandmarkCollection = { type: "FeatureCollection", features: [] };
    return { stations: empty, volcanoes: empty };
  });
  return pending;
}
