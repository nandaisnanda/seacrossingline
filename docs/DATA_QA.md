# Data QA

## Old-lines layer

`deriveColonial` in `src/components/atlas/atlas-data.ts` selects, in the browser, every line from `rail_active` and `rail_disused` whose `opened_year` is 1941 or earlier. The layer does not reconstruct the network of that time. It misses old lines with no sourced year. The cut-off is the last year before the Pacific War reached Southeast Asia.

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

## The 1925 Reitsma map

Do not digitize this map before 2029. Wikimedia Commons [deleted the complete Reitsma book](https://commons.wikimedia.org/wiki/Commons:Deletion_requests/File:Page1-1024px-Boekoe_Peringatan_dari_Staatsspoor-en_Tramwegen_di_Hindia-Belanda_1875-1925.pdf.jpg) and scheduled undeletion for 2029, 71 years after the author's reported death in 1958. The discussion found no source for that death year, so check it before relying on the date. When the map is clear to use, georeference it in QGIS with at least 8 control points, digitize to `data-raw/colonial_digitized.geojson` in EPSG:4326, and add a build step for it.

## Undated unnamed track

The 8,051 km of unnamed OSM ways stay undated. They have no page or tag to read a year from, and this project does not estimate years.

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
| reactivation | source_year | 12 / 12 | 100.0% |
| reactivation | target_year | 1 / 12 | 8.3% |

By length: active opened_year 17,145 of 25,824 km (66.4%); disused opened_year 3,616 of 7,111 km (50.8%); disused closed_year 2,480 of 7,111 km (34.9%).

A disused line with no year shows only in 2026, so past years look sparser than the real network. The timeline panel carries a caption saying closing years exist for only some lines.
<!-- time-attributes:end -->
