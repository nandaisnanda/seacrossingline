# Data QA

## Old-lines layer (colonial.geojson)

`scripts/build-colonial-proxy.mjs` copies every line from `rail_active` and `rail_disused` whose `opened_year` is 1941 or earlier. The layer does not reconstruct the network of that time. It misses old lines with no sourced year. The cut-off is the last year before the Pacific War reached Southeast Asia.

## How years reach a line

`scripts/lib/rail-years.mjs` takes the first year it finds, in this order:

1. OSM tags on the way: `start_date`, `opening_date`, `railway:start_date`, `end_date`, `disused:end_date`, `abandoned:end_date`.
2. The Wikidata item the way names, or an item another way of the same line name names. Only items typed as a railway line count. Bridges, tunnels and companies do not date a line.
3. `scripts/line-years.json`, built by `scripts/build-line-years.mjs` from Wikipedia infoboxes and a few cited sentences. That script holds the review rules: a closing value naming one segment or station is ignored, and rows that map to the wrong page are dropped.

An opening year marks the first opening of the line on the page, so one section can be younger. Unnamed OSM ways have no page to read and stay undated: 6,736 km active and 1,315 km disused. No line year is estimated or interpolated.

## Timeline rule

A feature shows only where a source places it. A line or station hides before `opened_year`. A disused line with both years draws as running until `closed_year`, then as closed. A disused line with only `closed_year` shows from that year. With no year, a feature shows only in 2026, so past years look sparser than the real network. A reactivation plan shows from `source_year`.

A station with no year of its own takes the earliest opening among dated lines within 300 m, marked `opened_year_basis: "line"`. This is a lower bound: the station may have opened later than the line. It closes only when every line within 300 m has a closing year.

OSM tags Den Chai–Chiang Khong as `railway=rail`, but Thai Wikipedia schedules the opening for 2571 BE (2028), so `build-rail-sea.mjs` leaves it out.

## Digitizing the 1925 map

1. Download the 1925 Reitsma map from Wikimedia Commons, after checking its license on the file page.
2. Georeference it in QGIS with at least 8 control points spread across Java. Stations and junctions that still exist make good points.
3. Digitize the lines as a new layer. Set `name` on each line, plus `company` (`SS` or `NIS`) and `year_built` where the map or an archive source supports them.
4. Export GeoJSON in EPSG:4326 to `data-raw/colonial_digitized.geojson`.

Then rerun the colonial task. It validates the file, simplifies it at 0.0003 and publishes it with the Reitsma citation.

<!-- time-attributes:start -->
## Time attributes

`scripts/enrich-time-osm.mjs` generates this section. Raw disused ways with a usable OSM end-date tag: 65.

| Layer | Attribute | Features | Share |
| --- | --- | --- | --- |
| rail_disused | closed_year (all) | 193 / 2188 | 8.8% |
| rail_disused | closed_year from OSM tags | 1 / 2188 | 0.0% |
| rail_disused | closed_year from Wikipedia or Wikidata | 192 / 2188 | 8.8% |
| rail_disused | opened_year | 306 / 2188 | 14.0% |
| rail_active | opened_year | 1761 / 3440 | 51.2% |
| stations | opened_year | 2671 / 3696 | 72.3% |
| colonial | year_built | 983 / 983 | 100.0% |
| reactivation | source_year | 5 / 5 | 100.0% |
| reactivation | target_year | 1 / 5 | 20.0% |

By length: active opened_year 17,145 of 25,824 km (66.4%); disused opened_year 3,616 of 7,111 km (50.8%); disused closed_year 2,480 of 7,111 km (34.9%).

Under 30% of disused lines have `closed_year`, so the timeline shows most lines as always present.

Proposed, not implemented: a small caption on the timeline reading "Tahun tutup hanya tersedia untuk sebagian jalur".
<!-- time-attributes:end -->
