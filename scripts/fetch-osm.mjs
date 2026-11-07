// Input: Overpass API. Output: data-raw/osm/tile-<n>-<class>.json (gitignored).
// Query: all railway ways with railway in (rail, narrow_gauge, disused, abandoned)
// or disused:railway / abandoned:railway, inside Java bbox split into lon tiles.
import { mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";

const OUT = path.join("data-raw", "osm");
const MIRRORS = ["https://overpass-api.de/api/interpreter"];
const S = -9.0, N = -5.7;
const LON = Array.from({ length: 13 }, (_, i) => +(105.0 + i * 0.8).toFixed(1));
const CLASSES = {
  live: (b) => `way["railway"~"^(rail|narrow_gauge)$"](${b});`,
  disused: (b) => `way["railway"~"^(disused|abandoned)$"](${b});`,
  prefixed: (b) => `way["disused:railway"](${b});way["abandoned:railway"](${b});`,
};

await mkdir(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(q) {
  let lastErr;
  for (let attempt = 0; attempt < 8; attempt++) {
    const url = MIRRORS[attempt % MIRRORS.length];
    try {
      const res = await fetch(url, { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "sea-crossing-line-atlas-data-script" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.remark && /runtime|memory|timed out/i.test(json.remark)) throw new Error(`remark: ${json.remark}`);
      return json;
    } catch (e) { lastErr = e; console.warn(`  retry ${attempt + 1}: ${e.message}`); await sleep(10000 * (attempt + 1)); }
  }
  throw lastErr;
}

for (let i = 0; i < LON.length - 1; i++) {
  const b = `${S},${LON[i]},${N},${LON[i + 1]}`;
  for (const [cls, f] of Object.entries(CLASSES)) {
    const file = path.join(OUT, `tile-${i}-${cls}.json`);
    try { await access(file); console.log("skip", file); continue; } catch {}
    const q = `[out:json][timeout:180][maxsize:1073741824];(${f(b)});out tags geom;`;
    const json = await run(q);
    await writeFile(file, JSON.stringify(json));
    console.log(file, json.elements.length, "ways", json.osm3s?.timestamp_osm_base);
    await sleep(2000);
  }
}
