// Input:  data-raw/osm_{active,disused}_sea-*.geojson (fetch-osm-sea.mjs), public/data/land.geojson,
//         data-raw/java-baseline/rail_{active,disused}.geojson (Java as built by build-rail-data.mjs and
//         enriched with closed_year; copied there once so reruns stay idempotent),
//         data-raw/wikidata_years.json (fetch-wikidata-years.mjs), scripts/line-years.json (cited table).
// Output: public/data/rail_active.geojson, public/data/rail_disused.geojson = Java baseline + rest of Southeast Asia.
// Ways already in Java's raw files are skipped. A way counts only if a sampled vertex lies inside a Southeast Asian
// country. Ways join into one feature only when they share name, operator, class and years, so each feature carries
// the years of exactly its own ways. opened_year and closed_year stay absent when no source holds them.
// The tolerance grows until a file fits MAX_BYTES.
// Usage: node scripts/build-rail-sea.mjs
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import length from "@turf/length";
import { chain, dedupePts, key, mapActive, mapDisused, simplify } from "./lib/rail-geom.mjs";
import { tableYears, yearsOf } from "./lib/rail-years.mjs";

const RAW = "data-raw";
const OUT = path.join("public", "data");
const BASELINE = path.join(RAW, "java-baseline");
const MAX_BYTES = 1.45 * 1024 * 1024;
const round = (n) => Math.round(n * 1e4) / 1e4;
const wayUrl = (id) => `https://www.openstreetmap.org/way/${id}`;

const land = JSON.parse(await readFile(path.join(OUT, "land.geojson"), "utf8"));
const rings = land.features.flatMap((f) => f.geometry.coordinates.map((p) => p[0])).map((r) => {
  const xs = r.map((v) => v[0]), ys = r.map((v) => v[1]);
  return { r, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
});
function inRing(x, y, r) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if ((r[i][1] > y) !== (r[j][1] > y) && x < ((r[j][0] - r[i][0]) * (y - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c;
  }
  return c;
}
const onSea = ([x, y]) => rings.some((g) => x >= g.x0 && x <= g.x1 && y >= g.y0 && y <= g.y1 && inRing(x, y, g.r));
const keepWay = (pts) => {
  const step = Math.max(1, Math.floor(pts.length / 8));
  for (let i = 0; i < pts.length; i += step) if (onSea(pts[i])) return true;
  return onSea(pts[pts.length - 1]);
};

const names = await readdir(RAW);
async function rawWays(pattern) {
  const byId = new Map();
  for (const n of names.filter((x) => pattern.test(x))) {
    for (const f of JSON.parse(await readFile(path.join(RAW, n), "utf8")).features) if (!byId.has(f.properties.osm_id)) byId.set(f.properties.osm_id, f);
  }
  return byId;
}
const javaRaw = await rawWays(/^osm_(active|disused)_(west|central|east)\.geojson$/);
// A Wikidata line item dates the whole line, so its years reach ways of the same name that lack the tag.
// Names that point to two different items, and operator or generic names, are left out.
const GENERIC = /tanpa nama|^KTM$|^PNR$|^Main Line$/i;
const sameName = new Map();
const allRaw = await rawWays(/^osm_(active|disused)_.*\.geojson$/);
for (const f of allRaw.values()) {
  const n = f.properties.name;
  if (!n || GENERIC.test(n)) continue;
  const y = yearsOf(f.properties, wayUrl(f.properties.osm_id));
  if (!String(y.openedSource).includes("wikidata")) continue;
  const known = sameName.get(n);
  sameName.set(n, known === undefined || known?.opened === y.opened ? y : null);
}
const wayYears = (f) => {
  const own = yearsOf(f.properties, wayUrl(f.properties.osm_id));
  return { ...tableYears(f.properties.name, f.geometry.coordinates[0]), ...(sameName.get(f.properties.name) ?? {}), ...own };
};

// Java features span several ways: the earliest opening and latest closing among them date the feature.
function dateJava(feature) {
  const p = feature.properties;
  for (const id of p.osm_ids ?? []) {
    const w = javaRaw.get(id);
    if (!w) continue;
    const y = wayYears(w);
    if (y.opened !== undefined && (p.opened_year === undefined || y.opened < p.opened_year)) { p.opened_year = y.opened; p.opened_year_source = y.openedSource; }
    if (y.closed !== undefined && p.status && (p.closed_year === undefined || (String(p.closed_year_source).includes("openstreetmap") && y.closed > p.closed_year))) { p.closed_year = y.closed; p.closed_year_source = y.closedSource; }
  }
  return feature;
}

// OSM tags these railway=rail, but they have not opened: Den Chai–Chiang Khong is scheduled for 2028 (2571 BE),
// https://th.wikipedia.org/wiki/ทางรถไฟสายเด่นชัย–เชียงราย–เชียงของ
const NOT_OPEN = /เด่นชัย–เชียงราย–เชียงของ/;

function group(ways, mapper) {
  const groups = new Map();
  const stats = { ways: ways.length, wrongType: 0, outside: 0, kept: 0 };
  for (const f of ways) {
    const m = mapper(f.properties);
    if (!m) { stats.wrongType++; continue; }
    if (NOT_OPEN.test(m.props.name)) { stats.notOpen = (stats.notOpen ?? 0) + 1; continue; }
    const pts = dedupePts(f.geometry.coordinates.map(([x, y]) => [round(x), round(y)]));
    if (pts.length < 2) continue;
    if (!keepWay(pts)) { stats.outside++; continue; }
    stats.kept++;
    const y = wayYears(f);
    const k = JSON.stringify([m.props.name, m.props.operator ?? "", m.props.status ?? m.props.kind, y.opened ?? null, y.closed ?? null]);
    let g = groups.get(k);
    if (!g) {
      const props = { ...m.props };
      if (y.opened !== undefined) { props.opened_year = y.opened; props.opened_year_source = y.openedSource; }
      if (y.closed !== undefined && m.props.status) { props.closed_year = y.closed; props.closed_year_source = y.closedSource; }
      groups.set(k, (g = { props, lines: [], ends: [] }));
    }
    g.lines.push(pts);
    g.ends.push({ id: f.properties.osm_id, first: pts[0], last: pts[pts.length - 1] });
  }
  const parts = [];
  for (const g of groups.values()) {
    const lines = chain(g.lines);
    // Credit each way to the one chain holding both its ends, so a feature lists only its own ways.
    const sets = lines.map((l) => new Set(l.map(key)));
    const ids = lines.map(() => []);
    for (const e of g.ends) {
      const i = sets.findIndex((s) => s.has(key(e.first)) && s.has(key(e.last)));
      ids[i < 0 ? 0 : i].push(e.id);
    }
    lines.forEach((line, i) => parts.push({ props: { ...g.props, osm_ids: ids[i] }, line }));
  }
  return { parts, stats };
}

const render = (parts, tol) => parts.flatMap(({ props, line }) => {
  const c = dedupePts(simplify(line, tol).map(([x, y]) => [round(x), round(y)]));
  return c.length >= 2 ? [{ type: "Feature", properties: props, geometry: { type: "LineString", coordinates: c } }] : [];
});

for (const [cls, mapper] of [["active", mapActive], ["disused", mapDisused]]) {
  const baseline = JSON.parse(await readFile(path.join(BASELINE, `rail_${cls}.geojson`), "utf8")).features.map(dateJava);
  const raw = await rawWays(new RegExp(`^osm_${cls}_sea-.*\\.geojson$`));
  for (const id of javaRaw.keys()) raw.delete(id);
  const { parts, stats } = group([...raw.values()].filter((f) => f.geometry?.type === "LineString"), mapper);
  const file = path.join(OUT, `rail_${cls}.geojson`);
  let tol = 0.0005;
  for (;;) {
    const features = render(parts, tol);
    await writeFile(file, JSON.stringify({ type: "FeatureCollection", features: [...baseline, ...features] }));
    const bytes = (await stat(file)).size;
    if (bytes <= MAX_BYTES || tol > 0.02) {
      const km = features.reduce((s, f) => s + length(f, { units: "kilometers" }), 0);
      const all = [...baseline, ...features];
      const opened = all.filter((f) => f.properties.opened_year !== undefined).length;
      const closed = all.filter((f) => f.properties.closed_year !== undefined).length;
      console.log(`${cls}: Java ${baseline.length} + SEA ${features.length} features (${km.toFixed(0)} km), ${JSON.stringify(stats)}, tol ${tol.toFixed(5)}, ${(bytes / 1024).toFixed(0)} KB, opened_year ${opened}, closed_year ${closed}`);
      break;
    }
    tol *= 1.4;
  }
}
