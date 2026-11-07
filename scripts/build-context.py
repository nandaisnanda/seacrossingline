#!/usr/bin/env python3
"""Build the geographic context of the atlas from Natural Earth 10m v5.1.1 (public domain).

Input : Natural Earth GeoJSON, downloaded once to data-raw/natural_earth/.
Output: public/data/neighbors.geojson   land of non-Southeast-Asian countries, clipped to FRAME
        public/data/bathymetry.geojson  nested depth polygons, one feature per depth band
        public/data/borders.geojson     modern land borders that touch Southeast Asia
        public/data/cities.geojson      capitals and major cities; earlier names and spellings from PERIOD_NAMES
Usage: python -I scripts/build-context.py
"""
import json
import urllib.request
from pathlib import Path

from shapely.geometry import Polygon, box, shape

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data-raw" / "natural_earth"
OUT = ROOT / "public" / "data"
BASE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.1/geojson/"
UA = "sea-crossing-line-data-script/1.0 (Southeast Asia railway atlas; static data build)"
# Matches the maxBounds in map-canvas.tsx, so viewers never see where this data ends.
FRAME = box(70.0, -30.0, 165.0, 45.0)
SEA = {"Myanmar", "Thailand", "Laos", "Cambodia", "Vietnam", "Malaysia", "Singapore", "Brunei", "Indonesia", "Philippines", "East Timor"}
DEPTHS = {"K_200": 200, "J_1000": 1000, "I_2000": 2000, "H_3000": 3000, "G_4000": 4000, "F_5000": 5000, "E_6000": 6000, "D_7000": 7000, "C_8000": 8000, "B_9000": 9000, "A_10000": 10000}
# Earlier names of a city as (year the name ended, name), oldest first. The modern name applies after the last one.
# Renamings: Batavia 1942, Ujung Pandang 1971-1999, Tanjungkarang-Telukbetung 1983, Tourane to 1945, Saigon 1976,
# Rangoon 1989, Brunei Town 1970, Kutaradja 1963 (English Wikipedia articles on each city).
# Spellings: the Dutch-based spelling gave way in the 1947 Soewandi reform, and oe/dj/tj forms ended with the 1972 EYD.
PERIOD_NAMES = {
    "Jakarta": [(1942, "Batavia"), (1972, "Djakarta")],
    "Bogor": [(1945, "Buitenzorg")],
    "Yogyakarta": [(1947, "Djokjakarta"), (1972, "Jogjakarta")],
    "Surakarta": [(1947, "Soerakarta")],
    "Surabaya": [(1947, "Soerabaja"), (1972, "Surabaja")],
    "Bandung": [(1947, "Bandoeng")],
    "Cirebon": [(1947, "Cheribon"), (1972, "Tjirebon")],
    "Banjarmasin": [(1972, "Bandjarmasin")],
    "Banda Aceh": [(1947, "Koetaradja"), (1963, "Kutaradja")],
    "Bandar Lampung": [(1983, "Tanjungkarang-Telukbetung")],
    "Makassar": [(1971, "Makassar"), (1999, "Ujung Pandang")],
    "Ambon": [(1945, "Amboina")],
    "Ho Chi Minh City": [(1976, "Saigon")],
    "Da Nang": [(1945, "Tourane")],
    "Yangon": [(1989, "Rangoon")],
    "Bandar Seri Begawan": [(1970, "Brunei Town")],
    "General Santos": [(1954, "Buayan")],
}
# Natural Earth keeps an old spelling for these.
MODERN_NAMES = {"Bandjarmasin": "Banjarmasin"}
# Shown only from this year on.
FOUNDED = {"Naypyidaw": 2005, "Baguio": 1900, "Balikpapan": 1897}
ALWAYS = {"Jakarta", "Bogor", "Bandung", "Semarang", "Yogyakarta", "Surabaya", "Cirebon", "Malang"}


def load(name):
    path = RAW / f"{name}.geojson"
    if not path.exists():
        RAW.mkdir(parents=True, exist_ok=True)
        req = urllib.request.Request(BASE + path.name, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=300) as r:
            path.write_bytes(r.read())
    return json.loads(path.read_text(encoding="utf-8"))["features"]


def polygons(geom):
    if geom.is_empty:
        return []
    if isinstance(geom, Polygon):
        return [geom]
    return [p for g in getattr(geom, "geoms", []) for p in polygons(g)]


def clip(geoms, simplify, min_area):
    out = []
    for g in geoms:
        g = g if g.is_valid else g.buffer(0)
        clipped = g.intersection(FRAME)
        out += [p for p in polygons(clipped.simplify(simplify, preserve_topology=True)) if p.area >= min_area and p.is_valid]
    return out


def coords(polys, digits=3):
    def ring(r):
        return [[round(x, digits), round(y, digits)] for x, y in r.coords]

    return [[ring(p.exterior)] + [ring(i) for i in p.interiors] for p in polys]


def write(name, features):
    path = OUT / name
    path.write_text(json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{name}: {len(features)} features, {path.stat().st_size // 1024} KB")


def main():
    countries = load("ne_10m_admin_0_countries")
    other = [shape(f["geometry"]) for f in countries if f["properties"].get("ADMIN") not in SEA and shape(f["geometry"]).intersects(FRAME)]
    write("neighbors.geojson", [{
        "type": "Feature",
        "properties": {"name": "Neighbouring land", "source": "Natural Earth 10m admin-0 countries v5.1.1"},
        "geometry": {"type": "MultiPolygon", "coordinates": coords(clip(other, 0.03, 0.02))},
    }])

    bands = []
    for code, depth in DEPTHS.items():
        polys = clip([shape(f["geometry"]) for f in load(f"ne_10m_bathymetry_{code}")], 0.1, 0.06)
        print(f"  depth {depth}: {len(polys)} polygons")
        if polys:
            bands.append({"type": "Feature", "properties": {"depth": depth, "source": f"Natural Earth 10m bathymetry {code} v5.1.1"},
                          "geometry": {"type": "MultiPolygon", "coordinates": coords(polys)}})
    write("bathymetry.geojson", bands)

    sea = [shape(f["geometry"]) for f in countries if f["properties"].get("ADMIN") in SEA]
    near = [g.simplify(0.02) for g in sea]
    borders = []
    for f in load("ne_10m_admin_0_boundary_lines_land"):
        g = shape(f["geometry"])
        # Test each line alone: one feature can hold segments far apart, such as the whole India-Bangladesh border.
        for line in (g.geoms if hasattr(g, "geoms") else [g]):
            if line.geom_type != "LineString" or not line.intersects(FRAME):
                continue
            # A border that only touches the region at a tripoint, such as India-Bangladesh, is not ours.
            samples = [line.interpolate(t, normalized=True) for t in (0.1, 0.3, 0.5, 0.7, 0.9)]
            if sum(any(q.distance(s_) < 0.05 for s_ in near) for q in samples) < 3:
                continue
            simple = line.simplify(0.01)
            borders.append({"type": "Feature", "properties": {"name": f["properties"].get("name") or "Border", "source": "Natural Earth 10m boundary lines v5.1.1"},
                            "geometry": {"type": "LineString", "coordinates": [[round(x, 3), round(y, 3)] for x, y in simple.coords]}})
    write("borders.geojson", borders)

    cities = []
    for f in load("ne_10m_populated_places_simple"):
        p = f["properties"]
        name = MODERN_NAMES.get(p.get("name"), p.get("name"))
        if p.get("adm0name") not in SEA:
            continue
        capital = p.get("featurecla") == "Admin-0 capital"
        major = (p.get("scalerank") or 9) <= 5 and (p.get("pop_max") or 0) >= 300000
        if not (capital or major or name in ALWAYS):
            continue
        lon, lat = f["geometry"]["coordinates"]
        props = {"name": name, "country": p["adm0name"], "capital": capital, "pop": int(p.get("pop_max") or 0)}
        if name in FOUNDED:
            props["founded"] = FOUNDED[name]
        if name in PERIOD_NAMES:
            props["names"] = PERIOD_NAMES[name]
        cities.append({"type": "Feature", "properties": props, "geometry": {"type": "Point", "coordinates": [round(lon, 4), round(lat, 4)]}})
    # Priority order for label decluttering: capitals, then population.
    cities.sort(key=lambda c: (not c["properties"]["capital"], -c["properties"]["pop"]))
    missing = ALWAYS - {c["properties"]["name"] for c in cities}
    assert not missing, f"Natural Earth lacks: {missing}"
    write("cities.geojson", cities)
    print([c["properties"]["name"] for c in cities][:40])


if __name__ == "__main__":
    main()
