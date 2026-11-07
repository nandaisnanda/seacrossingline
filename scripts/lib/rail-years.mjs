// Opening and closing years of one OSM object, from its own tags, then from the Wikidata item those tags name,
// then from the cited table in scripts/line-years.json. Returns no year when the sources hold none.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const WIKIDATA = path.join("data-raw", "wikidata_years.json");
const TABLE = path.join("scripts", "line-years.json");
const MIN_YEAR = 1860;
const MAX_YEAR = new Date().getFullYear();

// Accepts 1895, 1895-03, 1895-03-01, ~1900, 1890s. A decade resolves to its first year.
export function parseYear(value) {
  const m = /^~?(\d{4})s?(?:-\d{2}(?:-\d{2})?)?$/.exec(String(value ?? "").trim());
  if (!m) return null;
  const y = Number(m[1]);
  return y >= MIN_YEAR && y <= MAX_YEAR ? y : null;
}

const OPEN_TAGS = ["start_date", "opening_date", "railway:start_date"];
const CLOSE_TAGS = ["end_date", "disused:end_date", "abandoned:end_date"];
const LINE_TYPES = /railway line|abandoned railway|high-speed rail|single-track railway|tram system|heritage railway/i;
const STATION_TYPES = /station|railway stop|tram stop|terminus/i;

const cache = existsSync(WIKIDATA) ? JSON.parse(readFileSync(WIKIDATA, "utf8")) : { items: {}, titles: {}, types: {} };
const table = existsSync(TABLE) ? JSON.parse(readFileSync(TABLE, "utf8")).map((r) => ({ ...r, re: new RegExp(r.match, "i") })) : [];
const firstYear = (tags, keys) => {
  for (const k of keys) {
    const y = parseYear(tags[k]);
    if (y !== null) return y;
  }
  return null;
};

function itemOf(tags, typeRule) {
  const qs = String(tags.wikidata ?? "").split(";").map((s) => s.trim()).filter(Boolean);
  const m = /^([a-z-]{2,12}):(.+)$/.exec(String(tags.wikipedia ?? "").trim());
  const viaTitle = !qs.length && m ? cache.titles[`${m[1]}:${m[2].replaceAll("_", " ")}`] : null;
  for (const q of viaTitle ? [viaTitle] : qs) {
    const item = cache.items[q];
    // A way can name a bridge, a tunnel or a company. Their dates do not date the line.
    if (item && item.types.some((t) => typeRule.test(cache.types[t] ?? ""))) return [q, item];
  }
  return [null, null];
}

export function yearsOf(tags, osmUrl, kind = "line") {
  const out = {};
  const opened = firstYear(tags, OPEN_TAGS);
  const closed = firstYear(tags, CLOSE_TAGS);
  if (opened !== null) { out.opened = opened; out.openedSource = osmUrl; }
  if (closed !== null) { out.closed = closed; out.closedSource = osmUrl; }
  const [q, item] = itemOf(tags, kind === "station" ? STATION_TYPES : LINE_TYPES);
  if (item) {
    const url = `https://www.wikidata.org/wiki/${q}`;
    const year = (v) => (v !== null && v >= MIN_YEAR && v <= MAX_YEAR ? v : null);
    if (out.opened === undefined && year(item.opened) !== null) { out.opened = item.opened; out.openedSource = url; }
    if (out.closed === undefined && year(item.closed) !== null) { out.closed = item.closed; out.closedSource = url; }
  }
  return out;
}

// Cited table entries match the line name inside a bounding box [west, south, east, north].
export function tableYears(name, at) {
  for (const r of table) {
    if (!r.re.test(name ?? "")) continue;
    if (r.bbox && !(at[0] >= r.bbox[0] && at[0] <= r.bbox[2] && at[1] >= r.bbox[1] && at[1] <= r.bbox[3])) continue;
    const out = {};
    if (r.opened) { out.opened = r.opened; out.openedSource = r.source; }
    if (r.closed) { out.closed = r.closed; out.closedSource = r.source; }
    return out;
  }
  return {};
}
