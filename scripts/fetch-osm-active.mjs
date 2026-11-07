// Input: Overpass API. Output: data-raw/osm_active_<west|central|east>.geojson (gitignored).
// Active railway ways (rail, narrow_gauge) for Java, one request per bbox.
// Overlaps between boxes are expected; dedupe by osm_id downstream.
// Usage: node scripts/fetch-osm-active.mjs [--force]
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { OUT, BOXES, PAUSE_MS, sleep, exists, readJSON, overpass, toGeoJSON } from "./lib/overpass.mjs";

const FORCE = process.argv.includes("--force");

await mkdir(OUT, { recursive: true });

const counts = {};
let fetched = false;
for (const [name, bbox] of Object.entries(BOXES)) {
  const file = path.join(OUT, `osm_active_${name}.geojson`);
  if (!FORCE && (await exists(file))) {
    console.log(`skip ${file} (exists; use --force to refetch)`);
    counts[name] = (await readJSON(file)).features.length;
    continue;
  }
  if (fetched) await sleep(PAUSE_MS);
  const query = `[out:json][timeout:180];way["railway"~"^(rail|narrow_gauge)$"](${bbox.join(",")});out geom tags;`;
  console.log(`fetch ${name} bbox=${bbox.join(",")}`);
  const json = await overpass(query);
  fetched = true;
  const fc = toGeoJSON(json);
  await writeFile(file, JSON.stringify(fc));
  counts[name] = fc.features.length;
  console.log(`  wrote ${file}`);
}

console.log("\nWays per box:");
for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);
console.log(`  total (before dedupe): ${Object.values(counts).reduce((a, b) => a + b, 0)}`);
