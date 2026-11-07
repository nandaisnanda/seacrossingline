// Input:  public/data/*.geojson; data-raw/osm_disused_*.geojson for OSM end-date tags, matched via osm_ids.
// Output: public/data/rail_disused.geojson (only if a tag adds a year); time-attribute section in docs/DATA_QA.md.
// closed_year comes from end_date, disused:end_date or abandoned:end_date. Several ways in one feature -> the
// latest year (line fully closed). A year already cited on a feature stays. No estimates or interpolation.
// Usage: node scripts/enrich-time-osm.mjs
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import length from "@turf/length";
import { parseStartYear } from "./build-colonial-proxy.mjs";

const RAW = "data-raw";
const DATA = path.join("public", "data");
const QA = path.join("docs", "DATA_QA.md");
const TAGS = ["end_date", "disused:end_date", "abandoned:end_date"];
const START = "<!-- time-attributes:start -->";
const END = "<!-- time-attributes:end -->";

const load = (name) => JSON.parse(readFileSync(path.join(DATA, `${name}.geojson`), "utf8"));
const tagged = new Map();
for (const f of readdirSync(RAW).filter((n) => /^osm_disused_.*\.geojson$/.test(n))) {
  for (const w of JSON.parse(readFileSync(path.join(RAW, f), "utf8")).features) {
    const years = TAGS.map((t) => parseStartYear(w.properties[t])).filter((y) => y !== null);
    if (years.length) tagged.set(w.properties.osm_id, Math.max(...years));
  }
}

const disused = load("rail_disused");
let added = 0;
for (const f of disused.features) {
  if (f.properties.closed_year !== undefined) continue;
  const hits = (f.properties.osm_ids ?? []).filter((id) => tagged.has(id));
  if (!hits.length) continue;
  const id = hits.reduce((a, b) => (tagged.get(b) > tagged.get(a) ? b : a));
  f.properties.closed_year = tagged.get(id);
  f.properties.closed_year_source = `https://www.openstreetmap.org/way/${id}`;
  added++;
}
if (added) writeFileSync(path.join(DATA, "rail_disused.geojson"), JSON.stringify(disused));

const count = (fc, key, test = () => true) => fc.features.filter((f) => f.properties[key] !== undefined && test(f.properties)).length;
const pct = (n, total) => (total ? `${((n / total) * 100).toFixed(1)}%` : "n/a");
const row = (layer, attr, n, total) => `| ${layer} | ${attr} | ${n} / ${total} | ${pct(n, total)} |`;
const isOsm = (p) => String(p.closed_year_source).includes("openstreetmap.org");
const closed = count(disused, "closed_year");
const closedOsm = count(disused, "closed_year", isOsm);
const total = disused.features.length;
const reactivation = load("reactivation");
const active = load("rail_active");
const stations = load("stations");
const km = (fc, key) => {
  const sum = (list) => list.reduce((s, f) => s + length(f, { units: "kilometers" }), 0);
  return `${Math.round(sum(fc.features.filter((f) => f.properties[key] !== undefined))).toLocaleString("en")} of ${Math.round(sum(fc.features)).toLocaleString("en")} km (${pct(sum(fc.features.filter((f) => f.properties[key] !== undefined)), sum(fc.features))})`;
};

const lines = [
  "## Time attributes",
  "",
  `\`scripts/enrich-time-osm.mjs\` generates this section. Raw disused ways with a usable OSM end-date tag: ${tagged.size}.`,
  "",
  "| Layer | Attribute | Features | Share |",
  "| --- | --- | --- | --- |",
  row("rail_disused", "closed_year (all)", closed, total),
  row("rail_disused", "closed_year from OSM tags", closedOsm, total),
  row("rail_disused", "closed_year from Wikipedia or Wikidata", closed - closedOsm, total),
  row("rail_disused", "opened_year", count(disused, "opened_year"), total),
  row("rail_active", "opened_year", count(active, "opened_year"), active.features.length),
  row("stations", "opened_year", count(stations, "opened_year"), stations.features.length),
  row("reactivation", "source_year", count(reactivation, "source_year"), reactivation.features.length),
  row("reactivation", "target_year", count(reactivation, "target_year"), reactivation.features.length),
  "",
  `By length: active opened_year ${km(active, "opened_year")}; disused opened_year ${km(disused, "opened_year")}; disused closed_year ${km(disused, "closed_year")}.`,
];
lines.push(
  "",
  "A disused line with no year shows only in 2026, so past years look sparser than the real network. The timeline panel carries a caption saying closing years exist for only some lines.",
);
const section = [START, ...lines, END].join("\n");
const doc = readFileSync(QA, "utf8");
const a = doc.indexOf(START);
const b = doc.indexOf(END);
const next = a >= 0 && b > a ? doc.slice(0, a) + section + doc.slice(b + END.length) : `${doc.trimEnd()}\n\n${section}\n`;
writeFileSync(QA, next);
console.log(`${tagged.size} ways with OSM end-date tags, ${added} closed_year added, ${closed}/${total} disused features dated (${pct(closed, total)}), ${closedOsm} from OSM`);
