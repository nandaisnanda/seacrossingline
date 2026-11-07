// Input:  public/data/rail_{active,disused}.geojson (line names), scripts/line-pages.json (name -> Wikipedia page, written by hand).
// Output: data-raw/wikipedia_years.json (gitignored): one record per line name with the page, infobox values and years.
// Reads the infobox opening and closing fields only. Nothing is estimated; a page without those fields gives no year.
// scripts/build-line-years.mjs turns the reviewed records into scripts/line-years.json.
// Usage: node scripts/fetch-wikipedia-years.mjs
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import length from "@turf/length";
import { UA, sleep } from "./lib/overpass.mjs";

const OUT = path.join("data-raw", "wikipedia_years.json");
const PAGES = path.join("scripts", "line-pages.json");
const GENERIC = /tanpa nama|^KTM$|^Main Line$|^Decauville$|^Lorry Tracks/i;
const OPEN_FIELD = /^(open|opened|opening|open_date|opendate|dibuka|tanggal_dibuka|dibuka_pada|mulai_beroperasi|beroperasi|mulai_operasi|start|began_operation|began|commenced|builder_open|khai_trương|ngày_mở_cửa|vận_hành|เปิดเมื่อ|วันเปิด|เปิดให้บริการ)$/i;
const CLOSE_FIELD = /^(close|closed|closure|close_date|closedate|ditutup|tanggal_ditutup|ditutup_pada|end|ended|ceased_operation|dinonaktifkan|nonaktif|ปิดเมื่อ|วันปิด)$/i;

const lengths = new Map();
for (const n of ["active", "disused"]) {
  for (const f of JSON.parse(readFileSync(path.join("public", "data", `rail_${n}.geojson`), "utf8")).features) {
    const name = f.properties.name;
    if (!GENERIC.test(name)) lengths.set(name, (lengths.get(name) ?? 0) + length(f, { units: "kilometers" }));
  }
}
const manual = existsSync(PAGES) ? JSON.parse(readFileSync(PAGES, "utf8")) : {};

// Candidate pages per name: the hand-written page first, then the Indonesian title pattern for Indonesian lines.
function candidates(name) {
  const out = [];
  if (manual[name]) out.push(manual[name]);
  const m = /^Jalur (Kereta Api|Trem) (.+)$/i.exec(name);
  if (m) {
    const rest = m[2].replace(/\s*[-–—]\s*/g, "–");
    const noun = m[1].toLowerCase() === "trem" ? "trem" : "kereta api";
    out.push(`id:Jalur ${noun} ${rest}`);
    if (noun === "trem") out.push(`id:Jalur kereta api ${rest}`);
  }
  return out;
}

async function pagesOf(lang, titles) {
  const url = `https://${lang}.wikipedia.org/w/api.php?${new URLSearchParams({ action: "query", format: "json", formatversion: "2", prop: "revisions", rvprop: "content", rvslots: "main", redirects: "1", titles: titles.join("|") })}`;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.ok) return res.json();
    if (attempt >= 4) throw new Error(`${lang}wiki HTTP ${res.status}`);
    await sleep(4000 * attempt);
  }
}

function infoboxFields(text) {
  const open = [], close = [];
  for (const line of text.split("\n")) {
    const m = /^\s*\|\s*([^=|]{2,40}?)\s*=\s*(.+?)\s*$/.exec(line);
    if (!m) continue;
    const field = m[1].replaceAll(" ", "_");
    if (OPEN_FIELD.test(field)) open.push(m[2]);
    else if (CLOSE_FIELD.test(field)) close.push(m[2]);
  }
  return { open, close };
}
const yearsIn = (values) => values.flatMap((v) => [...v.replace(/<ref.*?(<\/ref>|\/>)/g, "").matchAll(/(?<!\d)(1[89]\d{2}|20[0-2]\d)(?!\d)/g)].map((m) => Number(m[1])));

const wanted = new Map();
for (const name of lengths.keys()) for (const c of candidates(name)) wanted.set(c, null);
const byLang = new Map();
for (const c of wanted.keys()) {
  const i = c.indexOf(":");
  const lang = c.slice(0, i);
  byLang.set(lang, [...(byLang.get(lang) ?? []), c.slice(i + 1)]);
}
for (const [lang, titles] of byLang) {
  for (let i = 0; i < titles.length; i += 40) {
    const part = titles.slice(i, i + 40);
    const json = await pagesOf(lang, part);
    const back = new Map();
    for (const r of [...(json.query?.normalized ?? []), ...(json.query?.redirects ?? [])]) back.set(r.to, r.from);
    for (const p of json.query?.pages ?? []) {
      const text = p.revisions?.[0]?.slots?.main?.content;
      if (!text) continue;
      const fields = infoboxFields(text);
      let t = p.title;
      const asked = new Set([t]);
      while (back.has(t)) { t = back.get(t); asked.add(t); }
      for (const a of asked) if (wanted.has(`${lang}:${a}`)) wanted.set(`${lang}:${a}`, { lang, title: p.title, ...fields });
    }
    await sleep(400);
  }
}

const records = [];
for (const [name, km] of lengths) {
  const rec = { name, km: Math.round(km), page: null };
  for (const c of candidates(name)) {
    const w = wanted.get(c);
    if (!w) continue;
    rec.page = `https://${w.lang}.wikipedia.org/wiki/${encodeURIComponent(w.title.replaceAll(" ", "_"))}`;
    rec.open = w.open;
    rec.close = w.close;
    const o = yearsIn(w.open), cl = yearsIn(w.close);
    if (o.length) rec.opened = Math.min(...o);
    if (cl.length) rec.closed = Math.max(...cl);
    if (o.length || cl.length) break;
  }
  records.push(rec);
}
records.sort((a, b) => b.km - a.km);
writeFileSync(OUT, JSON.stringify(records, null, 1));
const total = records.reduce((s, r) => s + r.km, 0);
const dated = records.filter((r) => r.opened);
console.log(`${records.length} line names, ${total} km; page found ${records.filter((r) => r.page).length}; opened year ${dated.length} names, ${dated.reduce((s, r) => s + r.km, 0)} km; closed year ${records.filter((r) => r.closed).length} names`);
