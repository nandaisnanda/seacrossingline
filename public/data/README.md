# SEA Crossing Line data

Scripts build these files from OpenStreetMap and cited sources; see the data pipeline in the root `README.md`. They are not official survey data. `colonial.geojson` holds lines with a sourced opening year up to 1941 (`docs/DATA_QA.md`), and `reactivation.geojson` holds 5 of the 13 listed lines (`docs/reactivation_sources.md`). The coastline comes from Natural Earth 10m v5.1.1 and is public domain.

All files are GeoJSON `FeatureCollection`s using EPSG:4326 coordinates. Point coordinates are `[longitude, latitude]`.

- `land.geojson`: `Polygon` or `MultiPolygon` features with optional `properties.name` and `properties.source`. It holds the 11 Southeast Asian countries from Natural Earth 10m admin-0 v5.1.1, simplified for the web.
- `rail_active.geojson`: `LineString` features with `name`, `kind` (`rail` or `narrow_gauge`), optional `operator`, `osm_ids`, and optional integer `opened_year` with `opened_year_source` (URL). Yards and sidings are excluded. Built by `scripts/build-rail-sea.mjs`.
- `rail_disused.geojson`: `LineString` features with `name`, optional `status` (`disused` or `abandoned`), `osm_ids`, and optional integers `opened_year` and `closed_year`, each with a `_source` URL. Many features have no year.
- `reactivation.geojson`: `LineString` features with `name`, `stage` (`rencana`, `proses`, `selesai`), `length_km`, optional `source_url`, `source_year`, and `target_year`.
- `stations.geojson`, `volcanoes.geojson`: `Point` features from OSM with `name`, plus `kind`, optional `opened_year`, `opened_year_source`, `opened_year_basis` (`line` when the year comes from the line under the station) and `closed_year` for stations, or optional `ele` for volcanoes. Built by `scripts/build-landmarks.mjs`.
- `neighbors.geojson`, `bathymetry.geojson`, `borders.geojson`, `cities.geojson`: Natural Earth context (`scripts/build-context.py`). `bathymetry` has one nested feature per `depth`.
- `colonial.geojson`: `LineString` features with `name`, integer `year_built` (up to 1941), `year_source` and `osm_ids`.
- `meta.json`: the sample-data flag, update date, and source list used in the atlas footer and sample stamp.

Completed reactivation routes (`stage: "selesai"`) are treated as active and removed from the disused layer when names or coordinates match. Features follow the timeline strictly. A line or station hides before its `opened_year`. A disused line with both years draws as running until `closed_year`, then as closed. A feature with no year shows only in 2026. A reactivation plan shows from its `source_year`.

## Coastline source and attribution

Natural Earth vector data is public domain. The land polygons come from `ne_10m_admin_0_countries`, simplified for web display. Natural Earth does not require credit; the short citation is “Made with Natural Earth.” See [Natural Earth terms of use](https://www.naturalearthdata.com/about/terms-of-use/) and the [10m physical vectors download](https://www.naturalearthdata.com/downloads/10m-physical-vectors/).

## Validation and attribution

The client validates each file and skips invalid feature geometry or properties with a console warning. Invalid/missing files show an error notice in the map. OpenStreetMap-derived routes require attribution to OpenStreetMap contributors and compliance with ODbL. Route lengths are approximate and are not official survey measurements.