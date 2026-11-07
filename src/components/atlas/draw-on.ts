import type { AtlasCollection } from "./atlas-data";

type Position = [number, number];

export const DRAW_ON_TOTAL_MS = 1600;
const STAGGER_MS = 300;

/** Keeps the first `fraction` of a line, measured in planar degrees. Good enough for a visual reveal. */
export function trimLine(coordinates: Position[], fraction: number): Position[] {
  if (fraction >= 1) return coordinates;
  if (fraction <= 0 || coordinates.length < 2) return [];
  const lengths = coordinates.slice(1).map((point, index) => {
    const previous = coordinates[index] as Position;
    return Math.hypot(point[0] - previous[0], point[1] - previous[1]);
  });
  const target = lengths.reduce((sum, value) => sum + value, 0) * fraction;
  const kept: Position[] = [coordinates[0] as Position];
  let walked = 0;
  for (let index = 0; index < lengths.length; index += 1) {
    const segment = lengths[index] as number;
    const start = coordinates[index] as Position;
    const end = coordinates[index + 1] as Position;
    if (walked + segment >= target) {
      const ratio = segment > 0 ? (target - walked) / segment : 0;
      kept.push([start[0] + (end[0] - start[0]) * ratio, start[1] + (end[1] - start[1]) * ratio]);
      return kept;
    }
    kept.push(end);
    walked += segment;
  }
  return kept;
}

export function trimCollection(collection: AtlasCollection, fraction: number): AtlasCollection {
  if (fraction >= 1) return collection;
  return {
    ...collection,
    features: collection.features.flatMap((feature) => {
      if (feature.geometry.type !== "LineString") return [feature];
      const coordinates = trimLine(feature.geometry.coordinates as Position[], fraction);
      return coordinates.length < 2
        ? []
        : [{ ...feature, geometry: { ...feature.geometry, coordinates } }];
    }),
  } as AtlasCollection;
}

const easeOut = (value: number) => 1 - (1 - value) ** 3;

type Target = { setData: (data: AtlasCollection) => void; collection: AtlasCollection };

/**
 * Reveals each target from its first vertex, one after another, once.
 * Resolves to a cancel function; the final frame always restores the full data.
 */
export function playDrawOn(targets: Target[], onDone?: () => void): () => void {
  const perLine = DRAW_ON_TOTAL_MS - STAGGER_MS * (targets.length - 1);
  const started = performance.now();
  let frame = 0;
  let cancelled = false;
  targets.forEach((target) => target.setData(trimCollection(target.collection, 0)));
  const step = (now: number) => {
    if (cancelled) return;
    const elapsed = now - started;
    targets.forEach((target, index) => {
      const progress = Math.min(1, Math.max(0, (elapsed - index * STAGGER_MS) / perLine));
      target.setData(trimCollection(target.collection, easeOut(progress)));
    });
    if (elapsed >= DRAW_ON_TOTAL_MS) {
      onDone?.();
      return;
    }
    frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
  return () => {
    cancelled = true;
    cancelAnimationFrame(frame);
    targets.forEach((target) => target.setData(target.collection));
  };
}
