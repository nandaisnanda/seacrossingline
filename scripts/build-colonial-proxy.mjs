// Input:  public/data/rail_{active,disused}.geojson with opened_year (build-rail-sea.mjs).
// Output: public/data/colonial.geojson. Proxy layer: lines whose first opening year is <= 1941, the last year before the Pacific War reached Southeast Asia, with the cited source.
// parseStartYear and classify keep the rule for raw ways that tests cover. No company property: the sources hold no
// reliable SS/NIS value. Run only while data-raw/colonial_digitized.geojson is missing.
// Usage: node scripts/build-colonial-proxy.mjs
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const RAW = "data-raw";
const OUT = path.join("public", "data", "colonial.geojson");
const MAX_YEAR = 1941;

// Accepts 1895, 1895-03, 1895-03-01, ~1900, 1890s. A decade resolves to its first year.
export function parseStartYear(value) {
  const m = /^~?(\d{4})s?(?:-\d{2}(?:-\d{2})?)?$/.exec(String(value ?? "").trim());
  return m ? Number(m[1]) : null;
}

const isClosed = (c) => c.length > 2 && c[0][0] === c.at(-1)[0] && c[0][1] === c.at(-1)[1];

export function classify(feature) {
  const p = feature.properties;
  const year = parseStartYear(p.start_date);
  if (year === null || year > MAX_YEAR) return { keep: false };
  if (feature.geometry.type !== "LineString") return { keep: false, reason: "not a LineString" };
  if (p.building || isClosed(feature.geometry.coordinates)) return { keep: false, reason: "building or closed outline, not track" };
  return { keep: true, year };
}

function main() {
  if (existsSync(path.join(RAW, "colonial_digitized.geojson"))) {
    console.error("data-raw/colonial_digitized.geojson exists: publish the digitized network instead of this proxy.");
    process.exit(1);
  }
  const features = [];
  for (const n of ["rail_active", "rail_disused"]) {
    for (const f of JSON.parse(readFileSync(path.join("public", "data", `${n}.geojson`), "utf8")).features) {
      const year = f.properties.opened_year;
      if (typeof year !== "number" || year > MAX_YEAR) continue;
      features.push({
        type: "Feature",
        properties: { ...f.properties, year_built: year, year_source: f.properties.opened_year_source },
        geometry: f.geometry,
      });
    }
  }
  writeFileSync(OUT, JSON.stringify({ type: "FeatureCollection", features }));
  console.log(`${features.length} features opened by ${MAX_YEAR} -> ${OUT}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve("scripts/build-colonial-proxy.mjs")) main();
