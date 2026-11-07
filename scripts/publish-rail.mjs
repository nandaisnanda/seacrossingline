// DEPRECATED: superseded by scripts/build-rail-data.mjs (writes public/data directly). Kept for reference.
// Input: data-raw/work/rail_{active,disused}.simplified.geojson (mapshaper output).
// Output: data-raw/work/publish/rail_*.geojson with null/degenerate geometries removed.
// Validate with: bun scripts/validate-data.ts data-raw/work/publish rail_active.geojson rail_disused.geojson
import { readFile, writeFile, mkdir } from "node:fs/promises";
await mkdir("data-raw/work/publish", { recursive: true });
for (const c of ["active", "disused"]) {
  const j = JSON.parse(await readFile(`data-raw/work/rail_${c}.simplified.geojson`, "utf8"));
  const features = j.features.filter((f) => f.geometry?.type === "LineString" && f.geometry.coordinates.length >= 2);
  console.log(c, j.features.length, "->", features.length);
  await writeFile(`data-raw/work/publish/rail_${c}.geojson`, JSON.stringify({ type: "FeatureCollection", features }));
}
