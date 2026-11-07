// Year parsing and the raw-way rule shared by the data scripts. The old-lines layer itself is derived in the browser
// by deriveColonial (src/components/atlas/atlas-data.ts), so no file is written here.
const MAX_YEAR = 1941;

// Accepts 1895, 1895-03, 1895-03-01, ~1900, 1890s. A decade resolves to its first year.
export function parseStartYear(value) {
  const m = /^~?(\d{4})s?(?:-\d{2}(?:-\d{2})?)?$/.exec(String(value ?? "").trim());
  return m ? Number(m[1]) : null;
}

const isClosed = (c) => c.length > 2 && c[0][0] === c.at(-1)[0] && c[0][1] === c.at(-1)[1];

export function classify(feature) {
  const p = feature.properties;
  const year = parseStartYear(p.start_date);
  if (year === null || year > MAX_YEAR) return { keep: false };
  if (feature.geometry.type !== "LineString") return { keep: false, reason: "not a LineString" };
  if (p.building || isClosed(feature.geometry.coordinates)) return { keep: false, reason: "building or closed outline, not track" };
  return { keep: true, year };
}
