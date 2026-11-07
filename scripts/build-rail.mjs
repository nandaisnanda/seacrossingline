// DEPRECATED: superseded by scripts/build-rail-data.mjs (writes public/data directly). Kept for reference.
// Input: data-raw/osm/tile-*-{live,disused}.json (Overpass, `out tags geom`).
// Output: data-raw/work/rail_active.geojson, rail_disused.geojson (LineString only).
// Rules: docs/DATA_PLAN.md section 2. Java scope: keep ways with a vertex inside
// or within TOL degrees of public/data/land.geojson; drops Madura and Bali.
import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const RAW = path.join("data-raw", "osm");
const OUT = path.join("data-raw", "work");
const TOL = 0.01;
const SERVICE_EXCLUDE = new Set(["yard", "siding", "spur", "crossover"]);

const land = JSON.parse(await readFile("public/data/land.geojson", "utf8"));
const rings = [];
for (const f of land.features) {
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const p of polys) rings.push(p[0]);
}
function inRing(x, y, r) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function distSeg(x, y, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = dx || dy ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy));
}
function nearLand(x, y) {
  for (const r of rings) {
    if (inRing(x, y, r)) return true;
    for (let i = 1; i < r.length; i++) {
      if (Math.abs(r[i][0] - x) > 0.1 && Math.abs(r[i - 1][0] - x) > 0.1) continue;
      if (distSeg(x, y, r[i - 1], r[i]) <= TOL) return true;
    }
  }
  return false;
}

const year = (v) => { const m = /^(\d{4})(-\d{2}(-\d{2})?)?$/.exec(String(v ?? "").trim()); return m ? Number(m[1]) : undefined; };
const round = (n) => Math.round(n * 1e5) / 1e5;

const ways = new Map();
for (const f of (await readdir(RAW)).filter((n) => n.endsWith(".json"))) {
  const j = JSON.parse(await readFile(path.join(RAW, f), "utf8"));
  for (const el of j.elements) if (el.type === "way" && el.geometry?.length >= 2) ways.set(el.id, el);
}

const stats = { total: ways.size, outside: 0, serviceExcluded: 0, unnamed: 0, ignored: 0 };
const groups = { active: new Map(), disused: new Map() };

for (const w of ways.values()) {
  const t = w.tags ?? {};
  let cls, kind, status;
  if (t.railway === "rail" || t.railway === "narrow_gauge") {
    if (SERVICE_EXCLUDE.has(t.service)) { stats.serviceExcluded++; continue; }
    cls = "active"; kind = t.railway;
  } else if (t.railway === "disused" || t.railway === "abandoned" || t["disused:railway"] || t["abandoned:railway"]) {
    cls = "disused";
    status = t.railway === "abandoned" || (!t.railway && t["abandoned:railway"] && !t["disused:railway"]) ? "abandoned" : "disused";
  } else { stats.ignored++; continue; }

  const pts = w.geometry.map((p) => [round(p.lon), round(p.lat)]).filter((p, i, a) => i === 0 || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
  if (pts.length < 2) continue;
  if (!pts.some((p) => nearLand(p[0], p[1]))) { stats.outside++; continue; }

  let name = t.name || t.ref;
  if (!name) { name = cls === "active" ? "Jalur tanpa nama" : "Jalur nonaktif tanpa nama"; stats.unnamed++; }
  const props = { name };
  if (cls === "active") {
    if (t.operator) props.operator = t.operator;
    props.kind = kind;
    if (t.usage) props.usage = t.usage;
  } else {
    props.status = status;
    if (/^Q\d+$/.test(t.wikidata ?? "")) props.wikidata = t.wikidata;
    if (/^id:/.test(t.wikipedia ?? "")) props.wikipedia = t.wikipedia;
    const cy = year(t["end_date"] ?? t["disused:end_date"] ?? t["abandoned:end_date"] ?? t["railway:end_date"]);
    if (cy) props.closed_year = cy;
  }
  const key = JSON.stringify(props);
  const g = groups[cls];
  if (!g.has(key)) g.set(key, { props, lines: [] });
  g.get(key).lines.push(pts);
}

// Join lines that meet end-to-end at nodes touched by exactly two lines of the same group.
function merge(lines) {
  const k = (p) => p[0] + "," + p[1];
  let ls = lines.map((l) => l.slice());
  for (;;) {
    const ends = new Map();
    ls.forEach((l, i) => { for (const p of [l[0], l[l.length - 1]]) { const a = ends.get(k(p)) ?? []; a.push(i); ends.set(k(p), a); } });
    let joined = false;
    for (const [, idx] of ends) {
      const u = [...new Set(idx)];
      if (u.length !== 2 || idx.length !== 2) continue;
      const [a, b] = u;
      let A = ls[a], B = ls[b];
      const ae = k(A[A.length - 1]), as = k(A[0]), bs = k(B[0]), be = k(B[B.length - 1]);
      if (ae === bs) A = A.concat(B.slice(1));
      else if (be === as) A = B.concat(A.slice(1));
      else if (ae === be) A = A.concat(B.slice(0, -1).reverse());
      else if (as === bs) A = B.slice(1).reverse().concat(A);
      else continue;
      ls[a] = A; ls.splice(b, 1); joined = true; break;
    }
    if (!joined) return ls;
  }
}

await mkdir(OUT, { recursive: true });
for (const cls of ["active", "disused"]) {
  const features = [];
  for (const { props, lines } of groups[cls].values())
    for (const coords of merge(lines)) features.push({ type: "Feature", properties: props, geometry: { type: "LineString", coordinates: coords } });
  await writeFile(path.join(OUT, `rail_${cls}.geojson`), JSON.stringify({ type: "FeatureCollection", features }));
  console.log(cls, features.length, "features");
}
console.log(stats);
