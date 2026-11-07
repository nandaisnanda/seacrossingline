// Input: public/data/rail_disused.geojson (from build-rail-data.mjs); wikipedia/wikidata tags are
// looked up from the raw OSM files via osm_ids and are not written to the output.
// Output: data-raw/work/rail_disused.dated.geojson + data-raw/work/closed_year_report.json.
// closed_year is read from the `close` field of the {{Kotak info jalur kereta api}} infobox on
// Indonesian Wikipedia. Article lookup, in order:
//   1. OSM `wikipedia=id:<title>` tag
//   2. Wikidata sitelink (idwiki) of the OSM `wikidata` QID
//   3. the OSM name, normalised ("Jalur Kereta Api X" -> "Jalur kereta api X"), exact title only
// A year is accepted only when EVERY line of `close` holds plain 4-digit year(s). Several years
// (segments or a range) -> the latest (line fully closed). Vague text ("dekade 2000-an") -> no year; listed for review.
// Each dated feature gets closed_year_source = the article URL. No guesses.
// Usage: node scripts/enrich-closed-year.mjs, then copy data-raw/work/rail_disused.dated.geojson to public/data/rail_disused.geojson
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const WORK = path.join("data-raw", "work");
const UA = "sea-crossing-line-atlas-data-script/1.0 (Java railway atlas; static data build)";
const H = { "User-Agent": UA };
const API = "https://id.wikipedia.org/w/api.php";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const fc = JSON.parse(await readFile(path.join("public", "data", "rail_disused.geojson"), "utf8"));
const osmTags = new Map();
for (const box of ["west", "central", "east"]) {
  const j = JSON.parse(await readFile(path.join("data-raw", `osm_disused_${box}.geojson`), "utf8"));
  for (const f of j.features) osmTags.set(f.properties.osm_id, f.properties);
}
const tagsOf = (f, k) => [...new Set((f.properties.osm_ids ?? []).map((id) => osmTags.get(id)?.[k]).filter(Boolean))];

async function getJSON(url) {
  for (let a = 1; a <= 4; a++) {
    const res = await fetch(url, { headers: H });
    if (res.ok) return res.json();
    await sleep(3000 * a);
  }
  throw new Error(`HTTP failure: ${url}`);
}

// 2. QID -> idwiki title
const qids = [...new Set(fc.features.flatMap((f) => tagsOf(f, "wikidata")).filter((q) => /^Q\d+$/.test(q)))];
const sitelink = new Map();
for (let i = 0; i < qids.length; i += 50) {
  const b = qids.slice(i, i + 50);
  const d = await getJSON(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=sitelinks&sitefilter=idwiki&ids=${b.join("|")}`);
  for (const q of b) { const t = d.entities?.[q]?.sitelinks?.idwiki?.title; if (t) sitelink.set(q, t); }
}

const norm = (n) => n.replace(/^Jalur\s+Kereta\s+Api\b/i, "Jalur kereta api").replace(/^Jalur\s+Trem\b/i, "Jalur trem").replace(/\s+/g, " ").trim();
const isLineName = (n) => /^Jalur (kereta api|trem)/i.test(n);
const dashes = (t) => [...new Set([t, t.replace(/-/g, "–"), t.replace(/–/g, "-")])];

// Candidate titles per feature
const cand = fc.features.map((f) => {
  const p = f.properties;
  const out = [];
  for (const w of tagsOf(f, "wikipedia")) if (/^id:/.test(w)) out.push({ t: w.slice(3), how: "osm-wikipedia" });
  for (const q of tagsOf(f, "wikidata")) if (sitelink.has(q)) out.push({ t: sitelink.get(q), how: "wikidata-sitelink" });
  if (isLineName(p.name)) for (const t of dashes(norm(p.name))) out.push({ t, how: "name" });
  return out;
});

const titles = [...new Set(cand.flat().map((c) => c.t))];
const pages = new Map(); // requested title -> { title, wikitext }
for (let i = 0; i < titles.length; i += 40) {
  const b = titles.slice(i, i + 40);
  const d = await getJSON(`${API}?action=query&format=json&redirects=1&prop=revisions&rvprop=content&rvslots=main&titles=${encodeURIComponent(b.join("|"))}`);
  const map = new Map(b.map((t) => [t, t]));
  for (const k of ["normalized", "redirects"]) for (const r of d.query?.[k] ?? []) for (const [orig, cur] of map) if (cur === r.from) map.set(orig, r.to);
  const byTitle = new Map(Object.values(d.query?.pages ?? {}).map((p) => [p.title, p]));
  for (const [orig, cur] of map) {
    const pg = byTitle.get(cur);
    const wt = pg?.revisions?.[0]?.slots?.main?.["*"];
    if (wt) pages.set(orig, { title: cur, wikitext: wt });
  }
  await sleep(500);
}

// Parse infobox `close`
function infoboxClose(wt) {
  if (!/\{\{\s*Kotak info jalur kereta api/i.test(wt)) return null;
  const m = /\n\s*\|\s*close\s*=([\s\S]*?)(?=\n\s*\|\s*\w+\s*=|\n\}\})/i.exec(wt);
  if (!m) return { raw: "", years: [], ok: false };
  const raw = m[1].replace(/<!--[\s\S]*?-->/g, "").trim();
  if (!raw) return { raw, years: [], ok: false };
  const lines = raw.split(/\n/).map((l) => l.replace(/^\s*[*#]+\s*/, "").trim()).filter(Boolean);
  const years = [];
  let ok = true;
  for (const l of lines) {
    const ys = [...l.replace(/\([^)]*\)/g, "").matchAll(/\b(1[89]\d\d|20[0-2]\d)\b/g)].map((x) => Number(x[1]));
    const vague = /dekade|pertengahan|awal|akhir|sekitar|\bca\b|~|\?|sebelum|setelah/i.test(l.replace(/\([^)]*\)/g, ""));
    if (!ys.length || vague) { ok = false; continue; }
    years.push(...ys);
  }
  return { raw, years, ok: ok && years.length > 0 };
}

const byHow = {}; const review = []; let dated = 0;
const cache = new Map();
fc.features.forEach((f, i) => {
  if (f.properties.closed_year) return;
  for (const c of cand[i]) {
    const pg = pages.get(c.t);
    if (!pg) continue;
    if (!cache.has(pg.title)) cache.set(pg.title, infoboxClose(pg.wikitext));
    const r = cache.get(pg.title);
    if (!r) continue; // not a railway-line infobox: ignore this candidate
    if (!r.ok) { if (r.raw) review.push({ name: f.properties.name, article: pg.title, close: r.raw }); return; }
    f.properties.closed_year = Math.max(...r.years);
    f.properties.closed_year_source = `https://id.wikipedia.org/wiki/${encodeURIComponent(pg.title.replace(/ /g, "_"))}`;
    byHow[c.how] = (byHow[c.how] || 0) + 1;
    dated++;
    return;
  }
});

// Fallback pass: "Daftar jalur kereta api nonaktif di Indonesia" (Jawa section). Third column = closing
// date; the page cites it (Jan de Bruin 2003; Sejarah Perkeretaapian Indonesia 1997).
const LIST_TITLE = "Daftar jalur kereta api nonaktif di Indonesia";
const LIST_URL = `https://id.wikipedia.org/wiki/${encodeURIComponent(LIST_TITLE.replace(/ /g, "_"))}`;
async function listWikitext() {
  for (let a = 1; a <= 6; a++) {
    const res = await fetch(`${API}?action=query&format=json&prop=revisions&rvprop=content&rvslots=main&titles=${encodeURIComponent(LIST_TITLE)}`, { headers: H });
    const txt = await res.text();
    try { return Object.values(JSON.parse(txt).query.pages)[0].revisions[0].slots.main["*"]; } catch { await sleep(20000 * a); }
  }
  throw new Error("list page unavailable");
}
const pairKey = (s) => s.toLowerCase()
  .replace(/\[\[|\]\]/g, "").replace(/^.*\|/, "")
  .replace(/^(bekas|eks|ex|trase lama)\s+/i, "")
  .replace(/^(jalur|percabangan)\s+(kereta api|ka|trem|rel)?\s*/i, "")
  .replace(/[–—-]+/g, "-").replace(/\s*-\s*/g, "-").replace(/\s+/g, " ").trim();
const listWt = await listWikitext();
const jawa = listWt.slice(listWt.indexOf("== Jawa =="), (() => { const m = /\n==[^=]/.exec(listWt.slice(listWt.indexOf("== Jawa ==") + 10)); return m ? listWt.indexOf("== Jawa ==") + 10 + m.index : undefined; })());
const listYears = new Map(); // pairKey -> Set of years (ambiguous when sets differ)
for (const row of jawa.split(/\n\|-/)) {
  const cells = row.split(/\n\s*\|(?!\|)/).map((c) => c.trim()).filter(Boolean);
  const link = /\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/.exec(cells[0] ?? "");
  if (!link || cells.length < 3) continue;
  const closeCell = cells[2].replace(/<ref[\s\S]*?(<\/ref>|\/>)/g, "").replace(/\{\{[\s\S]*?\}\}/g, "");
  if (/dekade|pertengahan|awal|akhir|sekitar|ca\.|~|\?/i.test(closeCell)) continue;
  const ys = [...closeCell.matchAll(/\b(1[89]\d\d|20[0-2]\d)\b/g)].map((m) => Number(m[1]));
  if (!ys.length) continue;
  const k = pairKey(link[1]);
  const y = Math.max(...ys);
  if (!listYears.has(k)) listYears.set(k, new Set());
  listYears.get(k).add(y);
}
let datedByList = 0;
for (const f of fc.features) {
  if (f.properties.closed_year || !isLineName(f.properties.name)) continue;
  const ys = listYears.get(pairKey(f.properties.name));
  if (!ys || ys.size !== 1) continue; // unmatched or ambiguous
  f.properties.closed_year = [...ys][0];
  f.properties.closed_year_source = LIST_URL;
  datedByList++;
}
byHow["list-page"] = datedByList;
dated += datedByList;

// Manual entries: infobox parse failed on malformed wikitext, year read by hand from the cited article.
const MANUAL = [
  { name: "Jalur Trem Mojokerto–Gemekan", year: 1943, article: "Jalur trem Pabrik Spiritus Wates–Mojokerto Kota–Gemekan" },
];
for (const m of MANUAL)
  for (const f of fc.features)
    if (f.properties.name === m.name && !f.properties.closed_year) {
      f.properties.closed_year = m.year;
      f.properties.closed_year_source = `https://id.wikipedia.org/wiki/${encodeURIComponent(m.article.replace(/ /g, "_"))}`;
      dated++;
      byHow.manual = (byHow.manual || 0) + 1;
    }

await writeFile(path.join(WORK, "rail_disused.dated.geojson"), JSON.stringify(fc));
const uniq = (a) => [...new Map(a.map((x) => [x.article, x])).values()];
const report = {
  features: fc.features.length,
  articlesFetched: pages.size,
  featuresDated: dated,
  datedBy: byHow,
  distinctArticlesDated: new Set(fc.features.filter((f) => f.properties.closed_year_source).map((f) => f.properties.closed_year_source)).size,
  needManualReview: uniq(review),
};
await writeFile(path.join(WORK, "closed_year_report.json"), JSON.stringify(report, null, 2));
console.log({ ...report, needManualReview: report.needManualReview.length });
