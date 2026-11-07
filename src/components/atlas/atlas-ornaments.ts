import type { AtlasCollection } from "./atlas-data";

// Decoration in the manner of old sea charts. Nothing here is data: the About dialog says so.
type Position = [number, number];
const featureCollection = <T>(features: T[]) => ({ type: "FeatureCollection" as const, features });

/** Portolan rhumb lines radiating from two points at sea. Drawn under the land fill. */
export function rhumbLines(
  hubs: Position[] = [
    [100, -13],
    [125, 17],
  ],
  rays = 16,
  reach = 90,
) {
  return featureCollection(
    hubs.flatMap(([lng, lat]) =>
      Array.from({ length: rays }, (_, i) => {
        const angle = (i / rays) * 2 * Math.PI;
        return {
          type: "Feature" as const,
          properties: {},
          geometry: {
            type: "LineString" as const,
            coordinates: [
              [lng, lat],
              [lng + Math.cos(angle) * reach, lat + Math.sin(angle) * reach],
            ],
          },
        };
      }),
    ),
  );
}

function outerRings(land: AtlasCollection): Position[][] {
  return land.features.flatMap((feature) => {
    if (feature.geometry.type === "Polygon") return [feature.geometry.coordinates[0] as Position[]];
    if (feature.geometry.type === "MultiPolygon")
      return feature.geometry.coordinates.map((polygon) => polygon[0] as Position[]);
    return [];
  });
}

export function pointInRing([x, y]: Position, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as Position;
    const [xj, yj] = ring[j] as Position;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** A staggered grid of wave marks, skipping anything on land or within `clearance` degrees of it. */
export function wavePoints(land: AtlasCollection, clearance = 0.4) {
  const boxes = outerRings(land).map((ring) => {
    const xs = ring.map((p) => p[0]);
    const ys = ring.map((p) => p[1]);
    return {
      ring,
      x0: Math.min(...xs) - clearance,
      x1: Math.max(...xs) + clearance,
      y0: Math.min(...ys) - clearance,
      y1: Math.max(...ys) + clearance,
    };
  });
  const near = (point: Position) =>
    boxes.some(
      ({ ring, x0, x1, y0, y1 }) =>
        point[0] >= x0 &&
        point[0] <= x1 &&
        point[1] >= y0 &&
        point[1] <= y1 &&
        (pointInRing(point, ring) ||
          ring.some(([x, y]) => Math.hypot(x - point[0], y - point[1]) < clearance)),
    );
  const features = [];
  for (let row = 0; row < 47; row++) {
    const lat = -30 + row * 1.6;
    for (let lng = 70 + (row % 2) * 1.5; lng < 165; lng += 3) {
      const point: Position = [Number(lng.toFixed(2)), Number(lat.toFixed(2))];
      if (!near(point))
        features.push({
          type: "Feature" as const,
          properties: { icon: "orn-wave", size: 1 },
          geometry: { type: "Point" as const, coordinates: point },
        });
    }
  }
  return featureCollection(features);
}

export function seaOrnaments() {
  const place = (icon: string, coordinates: Position, size: number) => ({
    type: "Feature" as const,
    properties: { icon, size },
    geometry: { type: "Point" as const, coordinates },
  });
  return featureCollection([
    place("orn-rose", [134, 6.5], 1.4),
    place("orn-steamer", [112.5, 13.5], 1),
    place("orn-steamer", [91.5, 11.5], 1),
    place("orn-steamer", [107.6, -3.9], 0.8),
    place("orn-steamer", [95, -3], 1),
    place("orn-sail", [127, 22.5], 1),
    place("orn-sail", [116, 15.5], 0.9),
    place("orn-sail", [128.5, -12.8], 1),
  ]);
}

const svg = (w: number, h: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w * 2}" height="${h * 2}" viewBox="0 0 ${w} ${h}">${body}</svg>`;

export function ornamentGlyphs(ink: string, paper: string): Record<string, string> {
  const line = `fill="none" stroke="${ink}" stroke-linecap="round" stroke-linejoin="round"`;
  const star = (points: number, outer: number, inner: number, rotate: number) =>
    Array.from({ length: points }, (_, i) => {
      const mid = rotate + (i * 360) / points;
      const dark = `M60 60 L60 ${60 - outer} L${60 + inner} ${60 - inner} Z`;
      const light = `M60 60 L60 ${60 - outer} L${60 - inner} ${60 - inner} Z`;
      return `<g transform="rotate(${mid} 60 60)"><path d="${dark}" fill="${ink}" stroke="${ink}" stroke-width=".5"/><path d="${light}" fill="${paper}" stroke="${ink}" stroke-width=".5"/></g>`;
    }).join("");
  return {
    "orn-wave": svg(
      26,
      8,
      `<path d="M1 5 q3 -4 6 0 t6 0 t6 0 t6 0" ${line} stroke-width=".7" opacity=".4"/>`,
    ),
    "orn-rose": svg(
      120,
      120,
      `
      <circle cx="60" cy="60" r="44" ${line} stroke-width=".7"/><circle cx="60" cy="60" r="41" ${line} stroke-width=".35"/>
      ${star(8, 36, 5, 22.5)}${star(4, 50, 8, 0)}
      <circle cx="60" cy="60" r="3" fill="${paper}" stroke="${ink}" stroke-width=".7"/>
      <path d="M56 8 V1 L64 8 V1" ${line} stroke-width="1.1"/>`,
    ),
    "orn-steamer": svg(
      70,
      40,
      `
      <path d="M4 26 H66 L60 35 H10 Z" fill="${paper}" stroke="${ink}" stroke-width="1"/>
      <path d="M14 26 V21 H54 V26 M22 21 V17 H44 V21" ${line} stroke-width=".9"/>
      <path d="M30 17 V9 H37 V17" fill="${ink}" stroke="${ink}" stroke-width=".8"/>
      <path d="M12 21 V8 M58 21 V8 M12 9 L33 6 M58 9 L37 6" ${line} stroke-width=".55"/>
      <path d="M34 8 q-2 -3 2 -4 q4 -1 3 -3 M40 6 q5 -1 7 -4" ${line} stroke-width=".7"/>
      <path d="M2 37 q3 -2.5 6 0 t6 0 t6 0 t6 0 t6 0 t6 0 t6 0 t6 0 t6 0 t6 0 t6 0" ${line} stroke-width=".6"/>`,
    ),
    "orn-sail": svg(
      50,
      50,
      `
      <path d="M8 36 H42 Q40 43 34 43 H15 Q10 43 8 36 Z" fill="${paper}" stroke="${ink}" stroke-width="1"/>
      <path d="M25 36 V5 M14 36 V13 M36 36 V13" ${line} stroke-width=".8"/>
      <path d="M25 7 Q34 13 25 19 Z M25 20 Q36 27 25 33 Z M14 15 Q21 20 14 25 Z M14 26 Q22 30 14 34 Z M36 15 Q43 20 36 25 Z M36 26 Q44 30 36 34 Z" fill="${paper}" stroke="${ink}" stroke-width=".7"/>
      <path d="M25 5 l5 1.6 l-5 1.6" fill="${ink}"/>
      <path d="M3 46 q3 -2.5 6 0 t6 0 t6 0 t6 0 t6 0 t6 0 t6 0" ${line} stroke-width=".6"/>`,
    ),
    volcano: svg(
      28,
      20,
      `
      <path d="M1 19 L11 5 Q14 3 17 5 L27 19 Z" fill="${paper}" stroke="${ink}" stroke-width="1"/>
      <path d="M11.5 6 L9 11 M14 5 V10 M16.5 6 L19 11 M9 8.5 L6 14 M19 8.5 L22 14 M13 12 L12 17 M16 12 L17 17 M7 15 L5.5 18 M21 15 L22.5 18" ${line} stroke-width=".65"/>`,
    ),
  };
}

/** Rasterizes the glyphs and registers them on the map. A glyph that fails to load is skipped. */
export async function addOrnamentImages(
  map: import("maplibre-gl").Map,
  glyphs: Record<string, string>,
) {
  await Promise.all(
    Object.entries(glyphs).map(async ([name, source]) => {
      const image = new Image();
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
      try {
        await image.decode();
        if (!map.hasImage(name)) map.addImage(name, image, { pixelRatio: 2 });
      } catch (error) {
        console.warn(`Ornament ${name} could not load:`, error);
      }
    }),
  );
}
