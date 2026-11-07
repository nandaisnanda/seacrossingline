// Usage: bun scripts/validate-data.ts <dir> [file ...]
// Fails if validateAtlasCollection drops any feature; prints size and counts.
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { validateAtlasCollection, atlasFiles, type AtlasFile } from "../src/components/atlas/atlas-data";

const [dir, ...only] = process.argv.slice(2);
const warn = console.warn;
let dropped = 0;
console.warn = (...a) => { dropped++; warn(...a); };
let bad = false;
for (const [key, file] of Object.entries(atlasFiles) as [AtlasFile, string][]) {
  if (only.length && !only.includes(file)) continue;
  const p = path.join(dir, file);
  const raw = JSON.parse(readFileSync(p, "utf8"));
  const before = dropped;
  const out = validateAtlasCollection(key, raw);
  const lost = raw.features.length - out.features.length;
  const kb = (statSync(p).size / 1024).toFixed(0);
  console.log(`${file}: ${out.features.length}/${raw.features.length} valid, ${kb} KB`);
  if (lost || dropped !== before) bad = true;
}
process.exit(bad ? 1 : 0);
