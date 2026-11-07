// Input: Overpass API. Output: data-raw/osm_disused_<west|central|east>.geojson (gitignored).
// Disused/abandoned railway ways for Java, one request per bbox. All OSM tags kept as-is.
// Overlaps between boxes are expected; dedupe by osm_id downstream. No cleaning here.
// Usage: node scripts/fetch-osm-disused.mjs [--force]
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { OUT, BOXES, PAUSE_MS, sleep, exists, readJSON, overpass, toGeoJSON } from "./lib/overpass.mjs";

const FORCE = process.argv.includes("--force");

const buildQuery = (b) =>
  `[out:json][timeout:180];(` +
  `way["railway"~"^(disused|abandoned)$"](${b});` +
  `way["disused:railway"](${b});` +
  `way["abandoned:railway"](${b});` +
  `way["railway"="rail"]["disused"="yes"](${b});` +
  `way["railway"="rail"]["abandoned"="yes"](${b});` +
  `);out geom tags;`;

// Status from the tag that put the way in the result set.
function statusOf(t = {}) {
  if (t.railway === "disused" || t["disused:railway"] || t.disused === "yes") return "disused";
  if (t.railway === "abandoned" || t["abandoned:railway"] || t.abandoned === "yes") return "abandoned";
  return "other";
}

await mkdir(OUT, { recursive: true });

const stats = {};
let fetched = false;
for (const [name, bbox] of Object.entries(BOXES)) {
  const file = path.join(OUT, `osm_disused_${name}.geojson`);
  let fc;
  if (!FORCE && (await exists(file))) {
    console.log(`skip ${file} (exists; use --force to refetch)`);
    fc = await readJSON(file);
  } else {
    if (fetched) await sleep(PAUSE_MS);
    console.log(`fetch ${name} bbox=${bbox.join(",")}`);
    fc = toGeoJSON(await overpass(buildQuery(bbox.join(","))));
    fetched = true;
    await writeFile(file, JSON.stringify(fc));
    console.log(`  wrote ${file}`);
  }
  const s = { total: fc.features.length, disused: 0, abandoned: 0, other: 0, named: 0 };
  for (const f of fc.features) {
    s[statusOf(f.properties)]++;
    if (f.properties.name) s.named++;
  }
  stats[name] = s;
}

console.log("\nWays per box (before dedupe):");
const sum = { total: 0, disused: 0, abandoned: 0, other: 0, named: 0 };
for (const [k, s] of Object.entries(stats)) {
  console.log(`  ${k}: total=${s.total} disused=${s.disused} abandoned=${s.abandoned} other=${s.other} named=${s.named}`);
  for (const key of Object.keys(sum)) sum[key] += s[key];
}
console.log(`  ALL: total=${sum.total} disused=${sum.disused} abandoned=${sum.abandoned} other=${sum.other} named=${sum.named}`);
