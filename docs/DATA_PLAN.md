# Data plan: replacing sample GeoJSON with sourced data

Status: historical. This plan guided the first import for Java. The live pipeline is in `README.md` and the current data state is in `docs/DATA_QA.md`, so the "current state" and timeline statements below no longer apply.

## 0. Current state

- `public/data/` holds five GeoJSON files plus `meta.json`, all illustrative samples (`meta.json` has `sample: true`).
- `land.geojson` has one feature (`name: "Java"`, Natural Earth 10m v5.1.1, MultiPolygon). It carries no Madura or Bali feature.
- `scripts/`, `docs/` and `data-raw/` did not exist before this file. `data-raw/` is not yet in `.gitignore`; add it before the first download.
- The sample `reactivation.geojson` and `rail_disused.geojson` reuse the same coordinates for "Kediri Sugar Tramway" and "Bandung–Ciwidey". `mergeCompletedReactivate` depends on that match (name or exact coordinates).

## 1. Schema per file

Source of truth: `src/components/atlas/atlas-data.ts`. All files are GeoJSON `FeatureCollection`, EPSG:4326, positions `[lon, lat]` with exactly two numbers (a third value such as elevation fails the tuple check). Features that fail validation are skipped with a console warning, so a bad export loses data silently.

| File | Geometry accepted | Required properties | Optional properties |
|---|---|---|---|
| `land.geojson` | `Polygon` or `MultiPolygon` (rings of at least 4 positions) | none | `name`: string; extra keys pass through |
| `rail_active.geojson` | **`LineString` only**, at least 2 positions | `name`: string | `operator`: string; extra keys pass through |
| `rail_disused.geojson` | **`LineString` only**, at least 2 positions | `name`: string | `status`: `"disused"` or `"abandoned"`; `closed_year`: integer |
| `reactivation.geojson` | **`LineString` only**, at least 2 positions | `name`: string; `stage`: `"rencana"`, `"proses"` or `"selesai"`; `length_km`: number >= 0 | `source_url`: valid URL; `source_year`, `target_year`: integers |
| `colonial.geojson` | **`LineString` only**, at least 2 positions | `name`: string | `company`: `"SS"` or `"NIS"`; `year_built`: integer |

Consequences for the pipeline:

- `MultiLineString`, `GeometryCollection`, `Point` and `null` geometry are all rejected. Explode every MultiLineString into one LineString feature per part, copying properties.
- `name` is required as a string on all four rail files. An unnamed way needs a documented fallback (section 4), not an empty or missing key. `name: ""` passes the schema but renders badly.
- Enum values are strict. `status` outside `disused|abandoned`, or `company` outside `SS|NIS`, drops the whole feature. A `null` value for an optional key also fails (`z.string().optional()` rejects `null`), so omit absent keys instead of writing `null`.
- `closed_year`, `year_built`, `source_year`, `target_year` must be integers. OSM date strings (`1998-05`) must be reduced to a year or omitted.
- Extra properties (`kind`, `osm_id`, `osm_type`, `gauge`) pass through because of `.passthrough()`. This permits `kind: "narrow_gauge"` on active lines and provenance keys, at the cost of file size.
- `isFeatureVisibleForYear` treats a missing year as always visible. Features without `closed_year` or `year_built` therefore show at every year.
- `mergeCompletedReactivate` removes disused features whose lowercased `name` or full coordinate array equals a `selesai` reactivation feature, and moves that feature into the active set. After a real OSM import, exact-coordinate matches will be rare, so name matching does the work. Name spelling must be consistent across files.

`meta.json` is not validated by zod here. Keep `sample`, `updated` (YYYY-MM-DD) and `sources` (string array). Set `sample: false` only when all five data files are real.

## 2. OSM tag to file mapping

| Target file | Include | Exclude | Properties written |
|---|---|---|---|
| `rail_active.geojson` | `railway=rail` | `service=yard`, `service=siding`, `service=spur`, `service=crossover`; also any way carrying `disused:railway=*` or `abandoned:railway=*` without a live `railway=*` tag | `name`, `operator` (from `operator` tag), plus `kind: "rail"` |
| `rail_active.geojson` | `railway=narrow_gauge` (same service exclusions) | same as above | `name`, `operator`, `kind: "narrow_gauge"` |
| `rail_disused.geojson` | `railway=disused`, `railway=abandoned`, any way with `disused:railway=*` or `abandoned:railway=*` | none by default; drop ways with no usable geometry | `name`, `status` (`disused` for `railway=disused` or `disused:railway`; `abandoned` for `railway=abandoned` or `abandoned:railway`), optional `closed_year` |

Open decisions for the other files, not covered by this task's brief:

- `reactivation.geojson`: OSM has no reliable tag for reactivation plans. Candidates are `railway=construction`, `railway=proposed` and `construction:railway=*`. Each feature also needs `stage`, `length_km` and a cited `source_url`, which come from DJKA or Kemenhub documents, not from OSM. Do not infer stage from OSM tags alone. Treat this file as hand-curated with citations.
- `colonial.geojson`: OSM does not tag SS or NIS ownership consistently. `start_date` and `operator` can seed candidates, but `company` needs an archive source (for example the Staatsspoorwegen/NIS network histories). Hand-curated with citations. Never fill `company` or `year_built` from a guess.
- `land.geojson`: Natural Earth 10m land, already in use. See the Madura/Bali risk below.

Tag details to resolve while building the Overpass query:

- Both `disused:railway=*` and `abandoned:railway=*` ways often also carry a live `railway=*` tag (for example a reused corridor). Decide the precedence rule once and document it: a live `railway=rail` or `narrow_gauge` tag wins, and the way goes to active.
- `railway=preserved`, `railway=light_rail`, `railway=subway`, `railway=tram` and `railway=funicular` are out of scope. `railway=light_rail` includes the Jakarta LRT and MRT, which the brief does not place in active rail. Confirm with the project owner before including them.
- Sugar-mill tramways are often `railway=narrow_gauge` plus `usage=industrial`. Whether those belong in "active" is a scope question. Default: include, because the brief says to, and keep `usage` as a passthrough property so the choice can be reversed later.
- Gauge (`gauge=1067`, `1435`, `600`, `750`) is useful passthrough data for `kind` verification.

## 3. Tooling and output locations

| Step | Tool | Input | Output |
|---|---|---|---|
| Fetch | Node script `scripts/fetch-osm.mjs` using Overpass API (`fetch`, no extra dependency) | bounding box or area for Java, Madura, Bali; query files in `scripts/queries/` | `data-raw/osm/*.json` (raw Overpass JSON, gitignored) |
| Convert | Node script `scripts/osm-to-geojson.mjs`, using `osmtogeojson` if the dependency is accepted, otherwise manual way-to-LineString conversion | `data-raw/osm/*.json` | `data-raw/work/*.geojson` (intermediate, gitignored) |
| Classify and clean | Node script `scripts/build-rail.mjs`: tag mapping, explode MultiLineString, name fallback, year parsing, drop zero-length lines | `data-raw/work/*.geojson` | `data-raw/work/rail_*.geojson` |
| Simplify | `npx mapshaper` with `-simplify` (Visvalingam, percentage chosen by size budget), `-explode`, `-clean` | `data-raw/work/rail_*.geojson` | `data-raw/work/*.simplified.geojson` |
| Validate | Node script `scripts/validate-data.mjs` that imports `validateAtlasCollection` and fails on any dropped feature, plus a file-size report | processed files | exit code and a report on stdout |
| Publish | Node script copies validated files, rounds coordinates, writes `meta.json` | validated files | `public/data/*.geojson`, `public/data/meta.json` |

Optional Python (`python -I`, venv, `shapely` and `networkx`), used only if the Node steps are not enough:

- `shapely`: `linemerge` to join collinear ways, `unary_union` for deduplication, checking whether lines fall inside the land polygon.
- `networkx`: detect disconnected fragments and orphan stubs, and group ways into named corridors.
- Any Python output goes to `data-raw/work/` and re-enters the Node pipeline. It never writes to `public/data/`.

Rules for this pipeline, from CLAUDE.md:

- Raw downloads stay in `data-raw/` and must be gitignored first. Only processed output goes to `public/data/`.
- Every feature in `public/data` must trace to a cited source or a script in `scripts/`. Each script header states its input, output and the OSM query it implements.
- Round coordinates to 5 decimals (about 1 m) in the publish step.
- `meta.json.sources` gets the Overpass query date, the OSM attribution ("OpenStreetMap contributors, ODbL 1.0") and any other source, and `updated` is set to the extraction date.
- The atlas UI must show OSM attribution once OSM data ships. Any new UI string goes through `atlas-i18n.ts` (id and en).

## 4. Risks

| Risk | Effect | Mitigation |
|---|---|---|
| Overpass timeouts or memory limits on a whole-island query | Truncated or empty response that looks valid | Split by sub-area (province or tiles) and merge. Set `[timeout:180]` and an explicit `[maxsize]`. Retry with backoff across mirrors. Record element counts per tile and compare with an independent count. |
| Overpass returns partial data on overload (`remark` field in the JSON) | Silent gaps in the network | Fail the fetch if the response contains a `remark` about runtime or memory. |
| Unnamed ways | `name` is required, so a missing name drops the feature | Order of fallback: `name`, then `ref`, then `operator` plus `railway` kind, then a clearly generic label such as "Jalur tanpa nama" with the OSM id kept as a property. Do not invent a historical name. Report the count of unnamed ways per file. |
| Ways split into many short segments | Thousands of features, with many sharing one name | Merge touching ways that have the same name and class with `linemerge`. Keep `osm_id` only if size allows. |
| MultiLineString from merges, `osmtogeojson` relations or mapshaper | Validator drops the feature | Explode and copy properties before writing. Validation script must fail on any rejected feature. |
| Madura and Bali fall outside the current land polygon | The land layer is a single "Java" feature, so rail on Madura or Bali floats over the sea | Decide scope first. If Java only, clip the OSM query to the Java land polygon plus a small buffer and document it. If Madura or Bali stay, add them as separate polygon features from Natural Earth. Check whether Madura is already inside the current MultiPolygon before deciding. Madura railways are mostly disused or abandoned, so the disused layer is the most affected. |
| Bali has no active passenger rail, and the main island link is only a ferry | Few or no Bali features | Treat as expected, not as an extraction failure. |
| Tag inconsistency (`railway=abandoned` ways that have since been rebuilt, `disused:` prefixes beside live tags) | Same corridor shown in two layers | Apply the precedence rule in section 2 and check overlaps with a geometry test before publish. |
| Wrong `kind` or `status` from missing tags | Misleading map | Default `status` only when the tag is present. Do not assign `abandoned` to a way that only says `railway=disused`. |
| Dates in `start_date`, `end_date`, `disused:end_date` use varied formats (`1998`, `~1998`, `1998-05`, `before 1950`) | Non-integer years rejected, or a wrong year | Parse only plain `YYYY` and `YYYY-MM`. Omit the property otherwise. Never fill `closed_year` from guesses. |
| File size | Slow first load, since all five files are fetched at start-up | Budget before simplifying: for example under 1.5 MB per rail file and 3 MB total uncompressed, and confirm gzip size on the host. Simplify with mapshaper, round to 5 decimals, drop unused passthrough properties. |
| Simplification damages topology (junctions drift apart, parallel tracks merge) | Visibly broken network | Use conservative tolerance, view results at several zoom levels, and compare line length before and after (accept a small percentage change, document it). |
| Industrial and sugar-mill narrow gauge bloats the active layer | Hundreds of short segments that dominate the map | Keep `usage` as a property so the UI or a later filter can separate them. Count them before deciding. |
| Overlap between `rail_disused` and `reactivation` | Duplicate lines at the same place | Treated by design for planned routes, but check that names agree so `mergeCompletedReactivate` works. |
| Licence and attribution | ODbL non-compliance | Add attribution to `meta.json` and the footer. Keep a record of query, date and OSM planet timestamp. |
| `meta.json.sample` stays `true` | UI still stamps sample data | Flip it to `false` only after all five files are replaced. Reactivation and colonial depend on hand-curated sources, so the flag may stay `true` for a while. |
| Windows paths and shell | Script failures from path separators or quoting | Use `node:path` and relative paths in scripts, and run with Node directly. |

## 5. Proposed order of work

1. Add `data-raw/` to `.gitignore`.
2. Decide the scope questions: Java only or plus Madura and Bali, which tags count as active, and how to treat industrial narrow gauge.
3. Write the Overpass queries and `fetch-osm.mjs`. Run one small tile first and inspect it.
4. Write the converter, classifier and validator. Validate against `atlas-data.ts` before touching `public/data/`.
5. Simplify, check size, publish `rail_active` and `rail_disused`.
6. Source `reactivation` and `colonial` separately with citations.
7. Update `meta.json`, attribution UI, tests, then run `bun run test` and `bun run build`.
