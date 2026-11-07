// Input:  Overpass API, cached in data-raw/landmarks/osm_landmarks.json (gitignored).
// Output: public/data/stations.geojson, public/data/volcanoes.geojson (Point features).
// Stations: railway=station|halt, also disused:/abandoned: forms, with a name. Elements closer than
// 1 km with the same name count as one station; opened_year comes from lib/rail-years.mjs. Volcanoes: natural=volcano, filtered by the rule below.
// Needs public/data/land.geojson (scripts/build-land.py) for the land test.
// Usage: node scripts/build-landmarks.mjs [--force]
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { exists, overpass } from "./lib/overpass.mjs";
import { yearsOf } from "./lib/rail-years.mjs";

const RAW = path.join("data-raw", "landmarks", "osm_landmarks.json");
const OUT = path.join("public", "data");
const BBOX = "-9.0,105.0,-5.4,114.7";
const round = (n) => Math.round(n * 1e4) / 1e4;

const query =
  `[out:json][timeout:170];(` +
  `nwr["railway"~"^(station|halt)$"](${BBOX});` +
  `nwr["disused:railway"~"^(station|halt)$"](${BBOX});` +
  `nwr["abandoned:railway"~"^(station|halt)$"](${BBOX});` +
  `nwr["natural"="volcano"](${BBOX});` +
  `);out center tags;`;

await mkdir(path.dirname(RAW), { recursive: true });
if (process.argv.includes("--force") || !(await exists(RAW))) {
  await writeFile(RAW, JSON.stringify(await overpass(query)));
}
const seaFiles = (await readdir(path.dirname(RAW))).filter((n) => n.startsWith("sea-"));
const seen = new Set();
const elements = [];
for (const file of [RAW, ...seaFiles.map((n) => path.join(path.dirname(RAW), n))]) {
  for (const el of JSON.parse(await readFile(file, "utf8")).elements) {
    const id = `${el.type}/${el.id}`;
    if (!seen.has(id)) { seen.add(id); elements.push(el); }
  }
}

const cleanName = (name) => name.replace(/^(bekas\s+)?stasiun\s+(kereta api\s+)?/i, "").trim();
const km = (a, b) => Math.hypot((a[0] - b[0]) * 110.6, (a[1] - b[1]) * 110.6);

// Land test: the bbox also catches south Sumatra, so a point must lie on land.geojson or within COAST_KM of it.
const COAST_KM = 3;
const land = JSON.parse(await readFile(path.join(OUT, "land.geojson"), "utf8"));
const rings = land.features.flatMap((f) => (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates)).map((p) => p[0]);
function inRing([x, y], r) {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    if (r[i][1] > y !== r[j][1] > y && x < ((r[j][0] - r[i][0]) * (y - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) inside = !inside;
  }
  return inside;
}
const margin = COAST_KM / 110;
const boxes = rings.map((r) => {
  const xs = r.map((v) => v[0]), ys = r.map((v) => v[1]);
  return { r, x0: Math.min(...xs) - margin, x1: Math.max(...xs) + margin, y0: Math.min(...ys) - margin, y1: Math.max(...ys) + margin };
});
const onLand = (p) => boxes.some((b) => p[0] >= b.x0 && p[0] <= b.x1 && p[1] >= b.y0 && p[1] <= b.y1 && (inRing(p, b.r) || b.r.some((v) => km(v, p) <= COAST_KM)));

// A station cannot predate its line: a station with no year of its own takes the earliest opening among the dated lines
// within LINE_KM, marked opened_year_basis "line". It leaves the timeline only when every line there has a closing year.
const LINE_KM = 0.3;
const lineIndex = [];
for (const n of ["rail_active", "rail_disused"]) {
  for (const f of JSON.parse(await readFile(path.join(OUT, `${n}.geojson`), "utf8")).features) {
    const xs = f.geometry.coordinates.map((c) => c[0]), ys = f.geometry.coordinates.map((c) => c[1]);
    lineIndex.push({ p: f.properties, c: f.geometry.coordinates, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) });
  }
}
function nearSegment([x, y], a, b) {
  const kx = 111.32 * Math.cos((y * Math.PI) / 180), ky = 110.57;
  const ax = (a[0] - x) * kx, ay = (a[1] - y) * ky, dx = (b[0] - a[0]) * kx, dy = (b[1] - a[1]) * ky;
  const t = dx || dy ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(ax + t * dx, ay + t * dy) <= LINE_KM;
}
function yearsFromLines(at) {
  const m = LINE_KM / 100;
  const near = lineIndex.filter((l) => at[0] >= l.x0 - m && at[0] <= l.x1 + m && at[1] >= l.y0 - m && at[1] <= l.y1 + m && l.c.some((v, i) => i > 0 && nearSegment(at, l.c[i - 1], v)));
  const dated = near.filter((l) => l.p.opened_year !== undefined).sort((a, b) => a.p.opened_year - b.p.opened_year);
  const out = {};
  if (dated.length) { out.opened = dated[0].p.opened_year; out.source = dated[0].p.opened_year_source; }
  if (near.length && near.every((l) => l.p.closed_year !== undefined)) out.closed = Math.max(...near.map((l) => l.p.closed_year));
  return out;
}

// Volcano rule: a mountain, not a mud pot, crater or plain. Named features with ele >= 1000 m, or "Gunung ..."
// with no ele tag. An entry with the same ele within 5 km, or an ele-less one within 3 km of another, is a duplicate.
const NOT_A_MOUNTAIN = /bledug|lumpur|kawah|plain|purba/i;
const isMountain = (name, ele) => !NOT_A_MOUNTAIN.test(name) && (ele === undefined ? /^gunung /i.test(name) : ele >= 1000);
const isDuplicateVolcano = (list, at, ele) =>
  list.some((v) => {
    const d = km(v.geometry.coordinates, at);
    const other = v.properties.ele;
    return (ele !== undefined && other === ele && d < 5) || ((ele === undefined || other === undefined) && d < 3);
  });

const stations = [];
const stationsByName = new Map();
const candidates = [];
for (const el of elements) {
  const t = el.tags ?? {};
  const lon = el.lon ?? el.center?.lon;
  const lat = el.lat ?? el.center?.lat;
  if (lon === undefined || !t.name) continue;
  const at = [round(lon), round(lat)];
  if (!onLand(at)) continue;
  if (t.natural === "volcano") {
    const parsed = Number.parseFloat(t.ele);
    const ele = Number.isFinite(parsed) ? Math.round(parsed) : undefined;
    if (isMountain(t.name, ele)) candidates.push({ type: "Feature", properties: { name: t.name, ...(ele === undefined ? {} : { ele }), osm_id: `${el.type}/${el.id}` }, geometry: { type: "Point", coordinates: at } });
    continue;
  }
  const name = cleanName(t.name);
  if (!name || stationsByName.get(name)?.some((c) => km(c, at) < 1)) continue;
  stationsByName.set(name, [...(stationsByName.get(name) ?? []), at]);
  const kind = (t.railway ?? t["disused:railway"] ?? t["abandoned:railway"]) === "halt" ? "halt" : "station";
  const y = yearsOf(t, `https://www.openstreetmap.org/${el.type}/${el.id}`, "station");
  const line = yearsFromLines(at);
  const closed = y.closed ?? line.closed;
  const dates = {
    ...(y.opened !== undefined ? { opened_year: y.opened, opened_year_source: y.openedSource } : line.opened !== undefined ? { opened_year: line.opened, opened_year_source: line.source, opened_year_basis: "line" } : {}),
    ...(closed !== undefined ? { closed_year: closed } : {}),
  };
  stations.push({ type: "Feature", properties: { name, kind, ...dates }, geometry: { type: "Point", coordinates: at } });
}
// Highest first, so a duplicate check keeps the entry that has an elevation.
candidates.sort((a, b) => (b.properties.ele ?? 0) - (a.properties.ele ?? 0));
const volcanoes = [];
for (const c of candidates) if (!isDuplicateVolcano(volcanoes, c.geometry.coordinates, c.properties.ele)) volcanoes.push(c);
await writeFile(path.join(OUT, "stations.geojson"), JSON.stringify({ type: "FeatureCollection", features: stations }) + "\n");
await writeFile(path.join(OUT, "volcanoes.geojson"), JSON.stringify({ type: "FeatureCollection", features: volcanoes }) + "\n");
console.log(`${elements.length} OSM elements -> ${stations.length} stations (${stations.filter((f) => f.properties.opened_year && !f.properties.opened_year_basis).length} own year, ${stations.filter((f) => f.properties.opened_year_basis).length} from their line, ${stations.filter((f) => f.properties.closed_year).length} closed), ${volcanoes.length} volcanoes`);
