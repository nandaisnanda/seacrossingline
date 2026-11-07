// Shared helpers for Overpass fetch scripts.
import { readFile, access } from "node:fs/promises";

export const OUT = "data-raw";
export const ENDPOINT = "https://overpass-api.de/api/interpreter";
export const UA = "sea-crossing-line-atlas-data-script/1.0 (Southeast Asia railway atlas; static data build)";
export const PAUSE_MS = 10_000;
const MAX_ATTEMPTS = 3;
const RETRY_STATUS = new Set([429, 502, 503, 504]);

// (south, west, north, east)
export const BOXES = {
  west: [-8.9, 104.9, -5.8, 108.3],
  central: [-8.9, 108.2, -5.8, 111.6],
  east: [-9.0, 111.5, -5.8, 114.9],
};

// Southeast Asia outside Java: (south, west, north, east). Tiles reach into China and India; land.geojson clips those.
export const SEA_TILES = {
  myanmar: [9.5, 92, 28.6, 101.2],
  thailand: [5.5, 97.3, 20.6, 105.7],
  indochina: [8, 102, 23.5, 110],
  malaya: [0.8, 99.5, 7.5, 105],
  borneo: [-4.5, 108.5, 7.5, 119.5],
  sumatra: [-6.2, 95, 6, 106.2],
  "east-indonesia": [-11.5, 114, 2.5, 141.5],
  philippines: [4.5, 116.5, 21, 127],
};

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const exists = (f) => access(f).then(() => true, () => false);
export const readJSON = async (f) => JSON.parse(await readFile(f, "utf8"));

export async function overpass(query) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA },
        body: "data=" + encodeURIComponent(query),
      });
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status} ${res.statusText}`);
        err.retry = RETRY_STATUS.has(res.status);
        throw err;
      }
      const json = await res.json();
      if (json.remark && /runtime|memory|timed out/i.test(json.remark)) {
        const err = new Error(`Overpass remark: ${json.remark}`);
        err.retry = true;
        throw err;
      }
      return json;
    } catch (e) {
      lastErr = e;
      const retry = e.retry ?? true; // network errors are retryable
      if (!retry || attempt === MAX_ATTEMPTS) break;
      const wait = 15_000 * 2 ** (attempt - 1);
      console.warn(`  attempt ${attempt} failed (${e.message}); retrying in ${wait / 1000}s`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

// Ways with geometry -> LineString features; all OSM tags kept, plus osm_id.
export function toGeoJSON(json) {
  const features = [];
  for (const el of json.elements ?? []) {
    if (el.type !== "way" || !Array.isArray(el.geometry)) continue;
    const coordinates = el.geometry.filter(Boolean).map((p) => [p.lon, p.lat]);
    if (coordinates.length < 2) continue;
    features.push({
      type: "Feature",
      properties: { osm_id: el.id, ...(el.tags ?? {}) },
      geometry: { type: "LineString", coordinates },
    });
  }
  return { type: "FeatureCollection", features };
}
