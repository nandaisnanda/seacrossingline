// Input:  data-raw/wikipedia_years.json (fetch-wikipedia-years.mjs), data-raw/wikidata_years.json (fetch-wikidata-years.mjs).
// Output: scripts/line-years.json: reviewed { match, opened, closed, source } rows that lib/rail-years.mjs reads.
// A line page may cover more than one section, so the year is the first opening of the line named on the page.
// Review rules live here so a rerun gives the same table:
//   DROP_OPENED  names whose mapped page describes a different or older line, or whose field records something else.
//   Closing values naming one segment or station do not date a whole line, so they are ignored.
//   PROSE        years read from article text where the infobox has none or records the start of construction.
//   WIKIDATA     names whose Wikidata item is known but which no way in OSM tags.
// Usage: node scripts/build-line-years.mjs
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const wikipedia = JSON.parse(readFileSync(path.join("data-raw", "wikipedia_years.json"), "utf8"));
const wikidata = JSON.parse(readFileSync(path.join("data-raw", "wikidata_years.json"), "utf8"));

const DROP_OPENED = new Set([
  "สายแก่งคอย - บัวใหญ่", // A later branch; the page dates the Northeastern main line.
  "Jalur Kereta Api Banjarsari–Purbalingga", // Redirects to the Purwokerto–Wonosobo page.
  "Jalur Kereta Api Purwosari–Boyolali", // The field records an acquisition by NISM, not an opening.
]);
const PARTIAL_CLOSE = /segmen|hanya|sampai|terminus|start date\|1932/i;

const SEMARANG = "https://id.wikipedia.org/wiki/Jalur_kereta_api_Semarang%E2%80%93Surakarta%E2%80%93Yogyakarta";
const GUNDIH = "https://id.wikipedia.org/wiki/Jalur_kereta_api_Gundih%E2%80%93Surabaya_Pasarturi";
const WHOOSH = "https://id.wikipedia.org/wiki/Kereta_cepat_Whoosh";
const CAMBODIA = "https://en.wikipedia.org/wiki/Rail_transport_in_Cambodia";
const MYANMAR = "https://en.wikipedia.org/wiki/Rail_transport_in_Myanmar";
const PROSE = [
  ["Đường sắt Bắc–Nam", 1905, "https://en.wikipedia.org/wiki/North%E2%80%93South_railway_(Vietnam)"], // The infobox gives completion, 1936; Hanoi–Vinh came first, 1899–1905.
  ["Jalur Kereta Api Gundih–Solo Balapan", 1867, SEMARANG], // "dibuka untuk umum pada tanggal 10 Agustus 1867"
  ["Jalur Kereta Api Solo Balapan–Yogyakarta", 1867, SEMARANG],
  ["Jalur Kereta Api Brumbung–Gundih", 1867, SEMARANG],
  ["Jalur Kereta Api Semarang–Brumbung", 1867, SEMARANG],
  ["Jalur Kereta Api Gambringan–Surabaya Pasarturi", 1900, GUNDIH],
  ["Jalur Kereta Api Gundih–Gambringan", 1900, GUNDIH], // "Segmen Surabaya–Lamongan, rampung 1 April 1900"
  ["Jalur Kereta Cepat Jakarta–Bandung", 2023, WHOOSH], // Inaugurated 2 October 2023.
  ["Kereta Cepat Jakarta–Bandung", 2023, WHOOSH],
  ["Kereta Cepat Indonesia China", 2023, WHOOSH],
  ["ទៀតពីភ្នំពេញទៅប៉ោយប៉ែត", 1932, CAMBODIA], // Phnom Penh–Poipet: "Phnom Penh Railway Station opening in 1932"
  ["ផ្លូវរថភ្លើងភ្នំពេញ", 1932, CAMBODIA],
  ["Mandalay to Myitkyinar Railway(မန္တလေး၊မြစ်ကြီးနားရထားလမ်း)", 1891, MYANMAR], // Mandalay to Shwebo in 1891.
  ["မန္တလေး-မြစ်ကြီးနားရထားလမ်း", 1891, MYANMAR],
  ["ရန်ကုန်-မန္တလေးရထားလမ်း", 1884, MYANMAR], // Yangon to Toungoo 1884, Mandalay 1889.
];
const WIKIDATA = {
  "Laluan Keretapi Barat Sabah": "Q1584305",
  "Sabah State Railway": "Q1584305",
  "Burma Mines Railway": "Q17027238",
  "Đường sắt Hà Nội - Đồng Đăng": "Q10841016",
  "Đường sắt Hà Nội - Hải Phòng": "Q10841014",
  "Đường sắt Hà Nội - Quan Triều": "Q10841017",
  "Đường sắt Kép – Lưu Xá": "Q10841018",
};

const rows = new Map();
for (const r of wikipedia) {
  if (!r.page) continue;
  const row = { name: r.name, source: r.page };
  if (r.opened && !DROP_OPENED.has(r.name)) row.opened = r.opened;
  if (r.closed && !r.close.some((v) => PARTIAL_CLOSE.test(v))) row.closed = r.closed;
  if (row.opened || row.closed) rows.set(r.name, row);
}
for (const [name, opened, source] of PROSE) rows.set(name, { ...rows.get(name), name, opened, source });
for (const [name, q] of Object.entries(WIKIDATA)) {
  const item = wikidata.items[q];
  if (item?.opened) rows.set(name, { name, opened: item.opened, ...(item.closed ? { closed: item.closed } : {}), source: `https://www.wikidata.org/wiki/${q}` });
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// OSM names these ways after the operator or generically, so the place decides the line. Boxes are [west, south, east, north].
const PLACED = [
  { match: "^KTM$", bbox: [102.1, 2.62, 106, 7], opened: 1910, source: "https://en.wikipedia.org/wiki/KTM_East_Coast_railway_line" },
  { match: "^KTM$", bbox: [99, 1, 105, 7], opened: 1885, source: "https://en.wikipedia.org/wiki/KTM_West_Coast_railway_line" },
  { match: "^Main Line$", bbox: [95, 16, 97.5, 23], opened: 1884, source: MYANMAR },
];
const table = [...PLACED, ...[...rows.values()].map(({ name, ...rest }) => ({ match: `^${escape(name)}$`, ...rest }))];
writeFileSync(path.join("scripts", "line-years.json"), JSON.stringify(table, null, 1) + "\n");
console.log(`${table.length} line rows, ${table.filter((r) => r.opened).length} with an opening year, ${table.filter((r) => r.closed).length} with a closing year`);
