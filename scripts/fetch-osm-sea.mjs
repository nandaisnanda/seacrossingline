// Input: Overpass API. Output (gitignored), one set per tile in lib/overpass.mjs SEA_TILES:
//   data-raw/osm_active_sea-<tile>.geojson, data-raw/osm_disused_sea-<tile>.geojson,
//   data-raw/landmarks/sea-<tile>.json (stations and volcanoes).
// Java keeps its own files from fetch-osm-active.mjs and fetch-osm-disused.mjs. Overlaps are deduped downstream.
// Usage: node scripts/fetch-osm-sea.mjs [--force]
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { OUT, PAUSE_MS, SEA_TILES, exists, overpass, sleep, toGeoJSON } from "./lib/overpass.mjs";

const FORCE = process.argv.includes("--force");
const LANDMARKS = path.join(OUT, "landmarks");
await mkdir(LANDMARKS, { recursive: true });

const queries = {
  active: (b) => `[out:json][timeout:180];way["railway"~"^(rail|narrow_gauge)$"](${b});out geom tags;`,
  disused: (b) =>
    `[out:json][timeout:180];(way["railway"~"^(disused|abandoned)$"](${b});way["disused:railway"](${b});way["abandoned:railway"](${b});way["railway"="rail"]["disused"="yes"](${b});way["railway"="rail"]["abandoned"="yes"](${b}););out geom tags;`,
  landmarks: (b) =>
    `[out:json][timeout:180];(nwr["railway"~"^(station|halt)$"](${b});nwr["disused:railway"~"^(station|halt)$"](${b});nwr["abandoned:railway"~"^(station|halt)$"](${b});nwr["natural"="volcano"](${b}););out center tags;`,
};

let first = true;
for (const [tile, bbox] of Object.entries(SEA_TILES)) {
  for (const [kind, build] of Object.entries(queries)) {
    const file = kind === "landmarks" ? path.join(LANDMARKS, `sea-${tile}.json`) : path.join(OUT, `osm_${kind}_sea-${tile}.geojson`);
    if (!FORCE && (await exists(file))) { console.log(`skip ${file}`); continue; }
    if (!first) await sleep(PAUSE_MS);
    first = false;
    const json = await overpass(build(bbox.join(",")));
    const output = kind === "landmarks" ? json : toGeoJSON(json);
    await writeFile(file, JSON.stringify(output));
    console.log(`${tile} ${kind}: ${(kind === "landmarks" ? output.elements : output.features).length}`);
  }
}
console.log("done");
