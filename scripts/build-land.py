#!/usr/bin/env python3
"""Build public/data/land.geojson from Natural Earth 10m admin-0 countries v5.1.1 (public domain).

Input : ne_10m_admin_0_countries.geojson, downloaded once to data-raw/natural_earth/.
Output: public/data/land.geojson, one MultiPolygon holding the 11 Southeast Asian countries.
Other Natural Earth land in view comes from scripts/build-context.py.
Usage: python -I scripts/build-land.py
"""
import json
import urllib.request
from pathlib import Path

from shapely.geometry import MultiPolygon, Polygon, shape

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data-raw" / "natural_earth" / "ne_10m_admin_0_countries.geojson"
OUT = ROOT / "public" / "data" / "land.geojson"
URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.1/geojson/ne_10m_admin_0_countries.geojson"
UA = "sea-crossing-line-data-script/1.0 (Southeast Asia railway atlas; static data build)"
SEA = {"Myanmar", "Thailand", "Laos", "Cambodia", "Vietnam", "Malaysia", "Singapore", "Brunei", "Indonesia", "Philippines", "East Timor"}
SIMPLIFY_DEG = 0.004
MIN_AREA = 0.0015


def rings(polys):
    def ring(r):
        return [[round(x, 4), round(y, 4)] for x, y in r.coords]

    return [[ring(p.exterior)] + [ring(i) for i in p.interiors] for p in polys]


def main():
    if not RAW.exists():
        RAW.parent.mkdir(parents=True, exist_ok=True)
        req = urllib.request.Request(URL, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=300) as r:
            RAW.write_bytes(r.read())
    polys = []
    found = set()
    for f in json.loads(RAW.read_text(encoding="utf-8"))["features"]:
        if f["properties"].get("ADMIN") not in SEA:
            continue
        found.add(f["properties"]["ADMIN"])
        g = shape(f["geometry"])
        for p in g.geoms if isinstance(g, MultiPolygon) else [g]:
            s = p.simplify(SIMPLIFY_DEG, preserve_topology=True)
            if isinstance(s, Polygon) and s.is_valid and s.area >= MIN_AREA:
                polys.append(s)
    assert found == SEA, f"missing countries: {SEA - found}"
    polys.sort(key=lambda p: -p.area)
    geom = MultiPolygon(polys)
    feature = {
        "type": "Feature",
        "properties": {"name": "Southeast Asia", "source": "Natural Earth 10m admin-0 countries v5.1.1"},
        "geometry": {"type": "MultiPolygon", "coordinates": rings(polys)},
    }
    OUT.write_text(json.dumps({"type": "FeatureCollection", "features": [feature]}) + "\n", encoding="utf-8")
    print(f"{len(polys)} polygons, bounds {tuple(round(v, 2) for v in geom.bounds)}, {OUT.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
