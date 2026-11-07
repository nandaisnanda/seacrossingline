// Geometry helpers shared by build-rail-data.mjs and build-rail-sea.mjs.
export const key = (p) => p[0] + "," + p[1];

export function distSeg(x, y, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = dx || dy ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy));
}

export function dedupePts(c) {
  return c.filter((p, i, a) => i === 0 || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
}

// Join lines meeting end to end where exactly two lines touch the node.
export function chain(lines) {
  let ls = lines.map((l) => l.slice());
  for (;;) {
    const ends = new Map();
    ls.forEach((l, i) => {
      for (const p of [l[0], l[l.length - 1]]) {
        const a = ends.get(key(p)) ?? [];
        a.push(i);
        ends.set(key(p), a);
      }
    });
    let joined = false;
    for (const idx of ends.values()) {
      if (idx.length !== 2 || idx[0] === idx[1]) continue;
      const [a, b] = idx;
      let A = ls[a];
      const B = ls[b];
      const ae = key(A[A.length - 1]), as = key(A[0]), bs = key(B[0]), be = key(B[B.length - 1]);
      if (ae === bs) A = A.concat(B.slice(1));
      else if (be === as) A = B.concat(A.slice(1));
      else if (ae === be) A = A.concat(B.slice(0, -1).reverse());
      else if (as === bs) A = B.slice(1).reverse().concat(A);
      else continue;
      ls[a] = A;
      ls.splice(b, 1);
      joined = true;
      break;
    }
    if (!joined) return ls;
  }
}

// Douglas-Peucker on lon/lat degrees (iterative).
export function simplify(pts, tol) {
  if (pts.length <= 2) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let max = 0, mi = -1;
    for (let i = s + 1; i < e; i++) {
      const d = distSeg(pts[i][0], pts[i][1], pts[s], pts[e]);
      if (d > max) { max = d; mi = i; }
    }
    if (max > tol) { keep[mi] = 1; stack.push([s, mi], [mi, e]); }
  }
  return pts.filter((_, i) => keep[i]);
}

const LINE_VALUES = new Set(["rail", "tram", "narrow_gauge", "light_rail", "funicular", "monorail", "yes"]);
const SERVICE_EXCLUDE = new Set(["yard", "siding", "spur", "crossover"]);

export function mapActive(t) {
  if (t.railway !== "rail" && t.railway !== "narrow_gauge") return null;
  if (SERVICE_EXCLUDE.has(t.service)) return null;
  const props = { name: t.name || t.ref || "Jalur tanpa nama", kind: t.railway };
  if (t.operator) props.operator = t.operator;
  return { props, named: Boolean(t.name || t.ref) };
}

export function mapDisused(t) {
  const lineLike = (v) => v !== undefined && LINE_VALUES.has(v);
  const isDisusedWay = t.railway === "disused" || t.railway === "abandoned" ||
    (t.railway === undefined && (lineLike(t["abandoned:railway"]) || lineLike(t["disused:railway"])));
  if (!isDisusedWay) return null;
  const status = t.railway === "abandoned" || t["abandoned:railway"] ? "abandoned" : "disused";
  const props = { name: t.name || t.old_name || "Jalur nonaktif tanpa nama", status };
  if (t.operator) props.operator = t.operator;
  return { props, named: Boolean(t.name || t.old_name) };
}
