// Input:  data-raw/osm_{active,disused}_{west,central,east}.geojson (raw OSM, LineString, tags + osm_id)
// Output: public/data/rail_active.geojson, public/data/rail_disused.geojson (LineString only)
// Steps: merge boxes + dedupe by osm_id -> clip to Java (+ Madura bbox fallback) -> map schema
//        -> dissolve named ways by name+operator+status -> explode -> simplify -> round 5 dp.
// Active drops service=yard/siding/spur/crossover. Sets no closed_year / start_date / year property.
// Usage: node scripts/build-rail-data.mjs [outDir]   (default public/data)
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import length from "@turf/length";
import { chain, dedupePts, distSeg, mapActive, mapDisused, simplify } from "./lib/rail-geom.mjs";

const RAW = "data-raw";
const OUT = process.argv[2] ?? path.join("public", "data");
const BUFFER_KM = 1;
const BUFFER_DEG = BUFFER_KM / 111.32; // ~0.009 deg; lat/lon treated as isotropic at this scale
const MADURA = { lon: [112.6, 114.2], lat: [-7.3, -6.8] };
const TOLERANCE = Number(process.env.SIMPLIFY ?? 0.0004);
const MAX_BYTES = 1.5 * 1024 * 1024;

// ---------- land ----------
const land = JSON.parse(await readFile("public/data/land.geojson", "utf8"));
const rings = [];
for (const f of land.features) {
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const p of polys) rings.push(p[0]);
}
const landBox = rings.flat().reduce((b, [x, y]) => ({ x0: Math.min(b.x0, x), x1: Math.max(b.x1, x), y0: Math.min(b.y0, y), y1: Math.max(b.y1, y) }), { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 });
function inRing(x, y, r) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function nearLand(x, y) {
  if (x < landBox.x0 - BUFFER_DEG || x > landBox.x1 + BUFFER_DEG || y < landBox.y0 - BUFFER_DEG || y > landBox.y1 + BUFFER_DEG) return false;
  for (const r of rings) {
    if (inRing(x, y, r)) return true;
    for (let i = 1; i < r.length; i++) if (distSeg(x, y, r[i - 1], r[i]) <= BUFFER_DEG) return true;
  }
  return false;
}
// Does land.geojson cover Madura? Probe a few points on the island.
const maduraInLand = [[113.3, -7.05], [113.0, -7.1], [113.6, -7.0], [114.0, -7.0], [112.8, -7.15]].some(([x, y]) => rings.some((r) => inRing(x, y, r)));
const inMaduraBox = (x, y) => x >= MADURA.lon[0] && x <= MADURA.lon[1] && y >= MADURA.lat[0] && y <= MADURA.lat[1];
const keepGeom = (coords) => coords.some(([x, y]) => nearLand(x, y) || (!maduraInLand && inMaduraBox(x, y)));

// ---------- geometry helpers ----------
const round = (n) => Math.round(n * 1e5) / 1e5;
// ---------- load ----------
async function load(cls) {
  const byId = new Map();
  let raw = 0;
  for (const box of ["west", "central", "east"]) {
    const j = JSON.parse(await readFile(path.join(RAW, `osm_${cls}_${box}.geojson`), "utf8"));
    for (const f of j.features) {
      raw++;
      const id = f.properties?.osm_id;
      if (id == null || f.geometry?.type !== "LineString") continue;
      if (!byId.has(id)) byId.set(id, f);
    }
  }
  return { raw, ways: [...byId.values()] };
}

async function build(cls, mapper, tol) {
  const { raw, ways } = await load(cls);
  const stats = { raw, unique: ways.length, wrongType: 0, outside: 0, kept: 0 };
  const groups = new Map();
  const singles = [];
  for (const f of ways) {
    const m = mapper(f.properties);
    if (!m) { stats.wrongType++; continue; }
    const pts = dedupePts(f.geometry.coordinates.map(([x, y]) => [round(x), round(y)]));
    if (pts.length < 2) continue;
    if (!keepGeom(pts)) { stats.outside++; continue; }
    stats.kept++;
    const id = f.properties.osm_id;
    if (!m.named) { singles.push({ props: { ...m.props, osm_ids: [id] }, lines: [pts] }); continue; }
    const k = JSON.stringify([m.props.name, m.props.operator ?? "", m.props.status ?? m.props.kind]);
    let g = groups.get(k);
    if (!g) groups.set(k, (g = { props: m.props, lines: [], ids: [] }));
    g.lines.push(pts);
    g.ids.push(id);
  }
  const features = [];
  const push = (props, coords) => {
    const c = dedupePts(simplify(coords, tol).map(([x, y]) => [round(x), round(y)]));
    if (c.length >= 2) features.push({ type: "Feature", properties: props, geometry: { type: "LineString", coordinates: c } });
  };
  // Dissolve = chain connected segments; any disjoint remainder becomes its own LineString (explode).
  for (const g of groups.values()) {
    for (const l of chain(g.lines)) push({ ...g.props, osm_ids: g.ids }, l);
  }
  for (const s of singles) push(s.props, s.lines[0]);
  return { features, stats };
}

async function writeOut(cls, features) {
  const file = path.join(OUT, `rail_${cls}.geojson`);
  await writeFile(file, JSON.stringify({ type: "FeatureCollection", features }));
  return { file, bytes: (await stat(file)).size };
}

// ---------- run ----------
await mkdir(OUT, { recursive: true });
console.log(maduraInLand
  ? "land.geojson covers Madura: Madura kept by 1 km land buffer."
  : `land.geojson does NOT cover Madura (extent lon ${landBox.x0.toFixed(2)}-${landBox.x1.toFixed(2)}, lat ${landBox.y0.toFixed(2)}-${landBox.y1.toFixed(2)}, Java only). Madura ways kept via bbox lon ${MADURA.lon.join("-")}, lat ${MADURA.lat.join(" to ")}.`);

for (const [cls, mapper] of [["active", mapActive], ["disused", mapDisused]]) {
  let tol = TOLERANCE;
  let res = await build(cls, mapper, tol);
  let out = await writeOut(cls, res.features);
  while (out.bytes > MAX_BYTES && tol < 0.01) {
    tol *= 1.5;
    console.log(`${cls}: ${(out.bytes / 1048576).toFixed(2)} MB over target, retrying with tolerance ${tol.toFixed(5)}`);
    res = await build(cls, mapper, tol);
    out = await writeOut(cls, res.features);
  }
  const km = res.features.reduce((s, f) => s + length(f, { units: "kilometers" }), 0);
  const multi = res.features.filter((f) => f.geometry.type !== "LineString").length;
  console.log(`${cls}: raw ${res.stats.raw}, unique ${res.stats.unique}, wrong type ${res.stats.wrongType}, outside ${res.stats.outside}, kept ${res.stats.kept}`);
  console.log(`${cls}: ${res.features.length} features, ${km.toFixed(1)} km, ${(out.bytes / 1024).toFixed(0)} KB, tolerance ${tol.toFixed(5)}, non-LineString ${multi} -> ${out.file}`);
}
