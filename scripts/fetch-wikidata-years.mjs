// Input:  wikidata= and wikipedia= tags in data-raw/osm_{active,disused}_*.geojson and data-raw/landmarks/*.json.
// Output: data-raw/wikidata_years.json (gitignored): { items: { Q: { label, types, opened, closed, opened_prop, closed_prop } },
//         titles: { "lang:Title": Q } }. Fetches only items missing from the cache unless --force.
// Opened = P1619 official opening, else P729 service entry, else P571 inception.
// Closed = P3999 official closure, else P730 service retirement, else P576 dissolved.
// Only dates with year precision or finer count. Usage: node scripts/fetch-wikidata-years.mjs [--force]
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { UA, sleep } from "./lib/overpass.mjs";

const RAW = "data-raw";
const OUT = path.join(RAW, "wikidata_years.json");
const API = "https://www.wikidata.org/w/api.php";
const OPENED = ["P1619", "P729", "P571"];
const CLOSED = ["P3999", "P730", "P576"];
const BATCH = 50;

const cache = !process.argv.includes("--force") && existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : { items: {}, titles: {} };
const qids = new Set();
const titles = new Set();
const note = (t) => {
  for (const q of String(t.wikidata ?? "").split(";")) if (/^Q\d+$/.test(q.trim())) qids.add(q.trim());
  const m = /^([a-z-]{2,12}):(.+)$/.exec(String(t.wikipedia ?? "").trim());
  if (!t.wikidata && m && !m[2].includes("#")) titles.add(`${m[1]}:${m[2].replaceAll("_", " ")}`);
};
for (const n of readdirSync(RAW).filter((x) => /^osm_(active|disused)_.*\.geojson$/.test(x))) {
  for (const f of JSON.parse(readFileSync(path.join(RAW, n), "utf8")).features) note(f.properties);
}
for (const n of readdirSync(path.join(RAW, "landmarks"))) {
  for (const el of JSON.parse(readFileSync(path.join(RAW, "landmarks", n), "utf8")).elements) if (el.tags?.railway || el.tags?.["disused:railway"] || el.tags?.["abandoned:railway"]) note(el.tags);
}

async function api(params) {
  const url = `${API}?${new URLSearchParams({ format: "json", formatversion: "2", maxlag: "30", ...params })}`;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.ok) {
      const json = await res.json();
      if (!json.error) return json;
      if (json.error.code !== "maxlag" || attempt >= 8) throw new Error(`Wikidata: ${json.error.code}`);
    } else if (attempt >= 8) throw new Error(`Wikidata: HTTP ${res.status}`);
    await sleep(5000 * attempt);
  }
}

// Best-ranked year of a property, or null. Precision 9 means year; 10 month; 11 day.
function yearOf(entity, prop) {
  const all = (entity.claims?.[prop] ?? []).filter((c) => c.rank !== "deprecated" && c.mainsnak?.datavalue?.value?.precision >= 9);
  const best = all.filter((c) => c.rank === "preferred");
  const use = best.length ? best : all;
  const years = use.map((c) => Number(/^\+?(-?\d+)-/.exec(c.mainsnak.datavalue.value.time)?.[1])).filter(Number.isFinite);
  return years.length ? Math.min(...years) : null;
}
const firstYear = (e, props) => {
  for (const p of props) {
    const y = yearOf(e, p);
    if (y !== null) return [y, p];
  }
  return [null, null];
};
const label = (e) => e.labels?.en?.value ?? e.labels?.id?.value ?? Object.values(e.labels ?? {})[0]?.value ?? e.id;

function store(e) {
  const [opened, opened_prop] = firstYear(e, OPENED);
  const [closed, closed_prop] = firstYear(e, CLOSED);
  const types = (e.claims?.P31 ?? []).map((c) => c.mainsnak?.datavalue?.value?.id).filter(Boolean);
  cache.items[e.id] = { label: label(e), types, opened, closed, opened_prop, closed_prop };
}

// Wikipedia titles without a wikidata tag: resolve per language.
const byLang = new Map();
for (const t of titles) {
  if (t in cache.titles) continue;
  const i = t.indexOf(":");
  const lang = t.slice(0, i);
  byLang.set(lang, [...(byLang.get(lang) ?? []), t.slice(i + 1)]);
}
for (const [lang, list] of byLang) {
  for (let i = 0; i < list.length; i += BATCH) {
    const part = list.slice(i, i + BATCH);
    const json = await api({ action: "wbgetentities", sites: `${lang.replaceAll("-", "_")}wiki`, titles: part.join("|"), props: "labels|claims|sitelinks", languages: "en|id" });
    for (const e of Object.values(json.entities ?? {})) {
      if (!e.id || e.missing !== undefined) continue;
      store(e);
      const title = e.sitelinks?.[`${lang.replaceAll("-", "_")}wiki`]?.title;
      if (title) cache.titles[`${lang}:${title}`] = e.id;
    }
    for (const t of part) cache.titles[`${lang}:${t}`] ??= null;
    await sleep(500);
  }
}

const missing = [...qids].filter((q) => !cache.items[q]);
for (let i = 0; i < missing.length; i += BATCH) {
  const json = await api({ action: "wbgetentities", ids: missing.slice(i, i + BATCH).join("|"), props: "labels|claims", languages: "en|id" });
  for (const e of Object.values(json.entities ?? {})) if (e.id && e.missing === undefined) store(e);
  await sleep(500);
}

// Type labels, so a line can be told from an operator or a place when the data is reviewed.
const typeIds = [...new Set(Object.values(cache.items).flatMap((v) => v.types))].filter((q) => !cache.types?.[q]);
cache.types ??= {};
for (let i = 0; i < typeIds.length; i += BATCH) {
  const json = await api({ action: "wbgetentities", ids: typeIds.slice(i, i + BATCH).join("|"), props: "labels", languages: "en" });
  for (const e of Object.values(json.entities ?? {})) if (e.id) cache.types[e.id] = e.labels?.en?.value ?? e.id;
  await sleep(500);
}

writeFileSync(OUT, JSON.stringify(cache));
const items = Object.values(cache.items);
console.log(`${qids.size} tagged items, ${titles.size} wikipedia titles, ${items.length} cached, ${items.filter((v) => v.opened).length} with an opening year, ${items.filter((v) => v.closed).length} with a closing year`);
