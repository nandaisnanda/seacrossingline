#!/usr/bin/env python3
"""Snap reactivation lines to existing OSM rail geometry.

Input : public/data/rail_disused.geojson, rail_active.geojson (LineString only),
        scripts/reactivation-lines.json, station coordinates from Overpass.
Output: public/data/reactivation.geojson, data-raw/reactivation/report.json

Method: build a graph whose nodes are line vertices (rounded to 1e-5 deg) and whose
edges are consecutive vertices. Simplification in build-rail-data.mjs drops the shared
vertex at many T-junctions, so a dead-end way may join another component by a short
connector to the nearest point on that line (at most --gap-m metres, default GAP_M).
Each route reports its connector metres. Each station is snapped to the nearest graph
vertex, or to the nearest point on a line when simplification left no vertex within
reach, and the shortest path joins consecutive stops. No straight line is ever drawn
between stations.

Razed track: two corridors survive in OSM only as railway=razed, which the published rail
layers leave out. The ways named in RAZED_NAMES join the graph for this script only.
A stop with no OSM station may use a place coordinate from `places` in the config.
A line may set `validate_stops` when its stated length covers only part of the route.

A line is accepted only if a cited source states a length and the routed length (or the
`validate_stops` part of it) is within 30% of it. Everything else is reported as unresolved with a reason.

Usage:
  python -I scripts/route-between.py                 # all lines, write outputs
  python -I scripts/route-between.py --from Madiun --to Slahung [--expected-km 40] [--gap-m 100]
"""
import argparse
import json
import math
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

import networkx as nx
from shapely.geometry import LineString, Point
from shapely.ops import nearest_points
from shapely.strtree import STRtree

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data"
RAW = ROOT / "data-raw" / "reactivation"
CONFIG = ROOT / "scripts" / "reactivation-lines.json"
ENDPOINT = "https://overpass-api.de/api/interpreter"
UA = "sea-crossing-line-atlas-data-script/1.0 (Java railway atlas; static data build)"
JAVA_BBOX = "-9.0,104.9,-5.8,114.9"  # south,west,north,east
TOLERANCE = 0.30
MAX_SNAP_M = 1500  # station farther than this from any rail vertex is not snapped
GAP_M = 50  # longest connector between a dead end and another line; about the 0.0004 deg simplify tolerance
PREC = 5
BRIDGE_NAME = "Jalur Trem Jurnatan\u2013Rembang"
BRIDGE_M = 1000
RAZED_NAMES = ("Jalur KA Cirebon-Kadipaten", "Jalur KA Cirebon Prujakan-Kegiren", "Jalur Trem Jurnatan–Rembang")


def haversine_m(a, b):
    (lon1, lat1), (lon2, lat2) = a, b
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi, dl = p2 - p1, math.radians(lon2 - lon1)
    h = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6371008.8 * math.asin(math.sqrt(h))


def path_length_km(coords):
    return sum(haversine_m(coords[i], coords[i + 1]) for i in range(len(coords) - 1)) / 1000


def key(pt):
    return (round(pt[0], PREC), round(pt[1], PREC))


def build_graph(gap_m=GAP_M):
    g = nx.Graph()
    for fname, layer in (("rail_disused.geojson", "disused"), ("rail_active.geojson", "active")):
        fc = json.loads((DATA / fname).read_text(encoding="utf-8"))
        for f in fc["features"]:
            if f["geometry"]["type"] != "LineString":
                continue
            pts = [key(c) for c in f["geometry"]["coordinates"]]
            for a, b in zip(pts, pts[1:]):
                if a != b:
                    g.add_edge(a, b, weight=haversine_m(a, b), layer=layer)
    for pts in fetch_razed():
        for a, b in zip(pts, pts[1:]):
            if a != b and not g.has_edge(a, b):
                g.add_edge(a, b, weight=haversine_m(a, b), layer="razed")
    if gap_m:
        add_connectors(g, gap_m)
    bridge_named(g)
    return g


def bridge_named(g):
    """Join dead ends of one named corridor (BRIDGE_NAME) across simplification gaps up to BRIDGE_M."""
    fc = json.loads((DATA / "rail_disused.geojson").read_text(encoding="utf-8"))
    ways = [[key(c) for c in f["geometry"]["coordinates"]] for f in fc["features"] if f["properties"].get("name") == BRIDGE_NAME]
    ways += [w for w in fetch_razed() if w[0][0] > 110]
    ends = {n for w in ways for n in (w[0], w[-1]) if n in g and g.degree(n) <= 2}
    comp = {n: i for i, c in enumerate(nx.connected_components(g)) for n in c}
    for x, y in sorted(((x, y) for x in ends for y in ends if x < y and comp[x] != comp[y]),
                       key=lambda t: haversine_m(*t)):
        d = haversine_m(x, y)
        if d <= BRIDGE_M and comp[x] != comp[y]:
            g.add_edge(x, y, weight=d, layer="connector")
            old = comp[y]
            comp = {n: (comp[x] if c == old else c) for n, c in comp.items()}


def add_connectors(g, gap_m):
    """Join each dead end to the nearest point on every other component within gap_m."""
    comp = {n: i for i, c in enumerate(nx.connected_components(g)) for n in c}
    edges = list(g.edges)
    lines = [LineString(e) for e in edges]
    tree = STRtree(lines)
    deg = gap_m / 100000  # generous degree buffer; exact metres checked below
    splits, links = {}, []
    for end in [n for n in g if g.degree(n) == 1]:
        best = {}
        for i in tree.query(Point(end).buffer(deg)):
            i = int(i)
            c = comp[edges[i][0]]
            if c == comp[end]:
                continue
            q = nearest_points(lines[i], Point(end))[0]
            d = haversine_m(end, (q.x, q.y))
            if d <= gap_m and (c not in best or d < best[c][0]):
                best[c] = (d, i, key((q.x, q.y)))
        for d, i, q in best.values():
            splits.setdefault(i, set()).add(q)
            links.append((end, q))
    for i, pts in splits.items():
        u, v = edges[i]
        layer = g.edges[u, v]["layer"]
        chain = [u] + sorted(pts - {u, v}, key=lambda p: haversine_m(u, p)) + [v]
        g.remove_edge(u, v)
        for x, y in zip(chain, chain[1:]):
            g.add_edge(x, y, weight=haversine_m(x, y), layer=layer)
    for x, y in links:
        if x != y and not g.has_edge(x, y):
            g.add_edge(x, y, weight=haversine_m(x, y), layer="connector")


def route_stats(g, coords):
    """Metres of route per layer, plus the longest single connector."""
    by, longest = {"disused": 0.0, "active": 0.0, "razed": 0.0, "connector": 0.0}, 0.0
    for a, b in zip(coords, coords[1:]):
        e = g.edges[tuple(a), tuple(b)]
        by[e["layer"]] += e["weight"]
        if e["layer"] == "connector":
            longest = max(longest, e["weight"])
    return {"disused_km": round(by["disused"] / 1000, 1), "active_km": round(by["active"] / 1000, 1), "razed_km": round(by["razed"] / 1000, 1),
            "connector_m": round(by["connector"]), "longest_connector_m": round(longest)}


def overpass(query):
    body = ("data=" + urllib.parse.quote(query)).encode()
    last = None
    for attempt in range(1, 4):
        try:
            req = urllib.request.Request(
                ENDPOINT, data=body, headers={"User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded"}
            )
            with urllib.request.urlopen(req, timeout=180) as r:
                return json.load(r)
        except Exception as e:  # network or 429/504: back off and retry
            last = e
            time.sleep(15 * 2 ** (attempt - 1))
    raise RuntimeError(f"Overpass failed: {last}")


def fetch_razed():
    """Razed ways of the corridors in RAZED_NAMES as vertex lists, cached in data-raw."""
    RAW.mkdir(parents=True, exist_ok=True)
    cache = RAW / "razed_java.json"
    if cache.exists():
        return [[tuple(c) for c in w] for w in json.loads(cache.read_text(encoding="utf-8"))]
    names = "|".join(RAZED_NAMES)
    q = f'[out:json][timeout:170];way["railway"="razed"]["name"~"^({names})$"]({JAVA_BBOX});out geom;'
    ways = [[key((p["lon"], p["lat"])) for p in el["geometry"]] for el in overpass(q).get("elements", [])]
    cache.write_text(json.dumps(ways), encoding="utf-8")
    return ways


def fetch_all_stations():
    """Every station-like OSM element in the Java bbox, cached in data-raw."""
    RAW.mkdir(parents=True, exist_ok=True)
    cache = RAW / "stations_java.json"
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    q = (
        f"[out:json][timeout:170];("
        f'nwr["railway"~"^(station|halt|disused_station|abandoned_station)$"]({JAVA_BBOX});'
        f'nwr["disused:railway"~"^(station|halt)$"]({JAVA_BBOX});'
        f'nwr["abandoned:railway"~"^(station|halt)$"]({JAVA_BBOX});'
        f");out center tags;"
    )
    found = []
    for el in overpass(q).get("elements", []):
        lon = el.get("lon", el.get("center", {}).get("lon"))
        lat = el.get("lat", el.get("center", {}).get("lat"))
        if lon is None:
            continue
        t = el.get("tags", {})
        kind = t.get("railway") or t.get("disused:railway") or t.get("abandoned:railway")
        names = [t[k] for k in ("name", "name:id", "alt_name", "old_name", "official_name") if k in t]
        found.append({"osm": f"{el['type']}/{el['id']}", "lon": lon, "lat": lat, "railway": kind, "names": names})
    cache.write_text(json.dumps(found, ensure_ascii=False, indent=0), encoding="utf-8")
    return found


def norm(name):
    n = name.strip().lower()
    for prefix in ("stasiun kereta api ", "stasiun ka ", "stasiun ", "halte "):
        if n.startswith(prefix):
            n = n[len(prefix):]
    return n.strip()


def fetch_stations(names):
    """Match stops to OSM stations: exact name first, then 'Name <suffix>' if no exact hit."""
    everything = fetch_all_stations()
    out = {}
    for name in names:
        target = norm(name)
        exact = [s for s in everything if any(norm(n) == target for n in s["names"])]
        out[name] = exact or [s for s in everything if any(norm(n).startswith(target + " ") for n in s["names"])]
    return out


class Snapper:
    def __init__(self, g):
        self.nodes = list(g.nodes)
        self.tree = STRtree([Point(n) for n in self.nodes])

    def nearest(self, lon, lat):
        i = int(self.tree.nearest(Point(lon, lat)))
        n = self.nodes[i]
        return n, haversine_m((lon, lat), n)

    def on_line(self, g, lon, lat):
        """Split the nearest edge at the point closest to (lon, lat) and return that new node."""
        edges = list(g.edges)
        lines = [LineString(e) for e in edges]
        i = int(STRtree(lines).nearest(Point(lon, lat)))
        q = nearest_points(lines[i], Point(lon, lat))[0]
        n, (u, v) = key((q.x, q.y)), edges[i]
        if n not in (u, v):
            layer = g.edges[u, v]["layer"]
            g.remove_edge(u, v)
            g.add_edge(u, n, weight=haversine_m(u, n), layer=layer)
            g.add_edge(n, v, weight=haversine_m(n, v), layer=layer)
        return n, haversine_m((lon, lat), n)


def route_stops(g, snap, stops, stations):
    """Chain shortest paths through the stops. Returns (coords, notes) or (None, reason)."""
    legs, prev_cands = [], None
    cand_sets = []
    for s in stops:
        cands = []
        for st in stations.get(s, []):
            node, d = snap.nearest(st["lon"], st["lat"])
            if d > MAX_SNAP_M:
                node, d = snap.on_line(g, st["lon"], st["lat"])
            if d <= MAX_SNAP_M:
                cands.append((node, d, st))
        if not stations.get(s):
            return None, f"station '{s}' not found in OSM (railway=station/halt/disused)"
        if not cands:
            return None, f"station '{s}' is more than {MAX_SNAP_M} m from any disused/active rail vertex"
        cand_sets.append(cands)
    # Try every candidate pair per leg, keep the shortest connecting path.
    chosen = None
    for cands_a, cands_b in zip(cand_sets, cand_sets[1:]):
        best = None
        for (na, _, _) in cands_a:
            for (nb, _, _) in cands_b:
                if na == nb or na not in g or nb not in g:
                    continue
                if not nx.has_path(g, na, nb):
                    continue
                p = nx.shortest_path(g, na, nb, weight="weight")
                ln = path_length_km(p)
                if best is None or ln < best[0]:
                    best = (ln, p)
        if best is None:
            return None, f"no connected rail path between '{stops[len(legs)]}' and '{stops[len(legs)+1]}' in OSM data (gap in graph)"
        legs.append(best[1])
    coords = []
    for leg in legs:
        leg = list(leg)
        # A waypoint on a dead-end spur makes the path go in and back out: drop the retraced part.
        while len(coords) >= 2 and len(leg) >= 2 and coords[-2] == leg[1]:
            coords.pop()
            leg.pop(0)
        coords.extend(leg if not coords else leg[1:])
    return [list(c) for c in coords], None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="frm")
    ap.add_argument("--to")
    ap.add_argument("--expected-km", type=float)
    ap.add_argument("--gap-m", type=float, default=GAP_M)
    ap.add_argument("--dry-run", action="store_true", help="print results, write nothing")
    args = ap.parse_args()

    g = build_graph(args.gap_m)
    snap = Snapper(g)

    if args.frm and args.to:
        st = fetch_stations([args.frm, args.to])
        coords, err = route_stops(g, snap, [args.frm, args.to], st)
        if err:
            print("unresolved:", err)
            return 1
        km = path_length_km(coords)
        print(f"{args.frm} -> {args.to}: {km:.1f} km, {len(coords)} vertices")
        if args.expected_km:
            dev = abs(km - args.expected_km) / args.expected_km
            print(f"vs expected {args.expected_km} km: {dev:+.0%} ->", "accept" if dev <= TOLERANCE else "unresolved")
        return 0

    cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
    names = sorted({s for ln in cfg["lines"] for s in ln["stops"]})
    stations = fetch_stations(names)
    for name, (lon, lat) in cfg.get("places", {}).items():
        stations[name] = [{"lon": lon, "lat": lat, "names": [name]}]

    features, report = [], []
    for ln in cfg["lines"]:
        entry = {"name": ln["name"], "stops": ln["stops"]}
        coords, err = route_stops(g, snap, ln["stops"], stations)
        if err:
            entry.update(status="unresolved", reason=err)
            report.append(entry)
            continue
        km = path_length_km(coords)
        entry["routed_km"] = round(km, 1)
        if ln.get("same_corridor_as"):
            entry.update(status="same corridor", reason=f"drawn once as {ln['same_corridor_as']}")
            report.append(entry)
            continue
        entry.update(route_stats(g, coords))
        lengths = ln.get("lengths") or []
        if not lengths:
            entry.update(status="unresolved",
                         reason=f"routed {km:.1f} km, but no source states a length for these terminals")
            report.append(entry)
            continue
        check_km = km
        if ln.get("validate_stops"):
            part, err = route_stops(g, snap, ln["validate_stops"], stations)
            if err:
                entry.update(status="unresolved", reason=err)
                report.append(entry)
                continue
            check_km = path_length_km(part)
            entry["validated_km"] = round(check_km, 1)
        devs = [(abs(check_km - x["km"]) / x["km"], x) for x in lengths]
        dev, match = min(devs, key=lambda t: t[0])
        entry.update(stated_km=[x["km"] for x in lengths], deviation=round(dev, 3))
        if dev > TOLERANCE:
            entry.update(status="unresolved",
                         reason=f"routed {check_km:.1f} km deviates {dev:.0%} from the closest stated {match['km']} km (limit {TOLERANCE:.0%})")
            report.append(entry)
            continue
        props = {"name": ln["name"], "stage": ln.get("stage", "rencana"), "length_km": round(km, 1),
                 "source_url": cfg["source_url"], "source_year": cfg["source_year"]}
        if ln.get("target_year"):
            props["target_year"] = ln["target_year"]
        features.append({"type": "Feature", "properties": props,
                         "geometry": {"type": "LineString", "coordinates": coords}})
        entry["status"] = "resolved"
        report.append(entry)

    out = {"type": "FeatureCollection", "features": features}
    if not args.dry_run:
        (DATA / "reactivation.geojson").write_text(json.dumps(out, ensure_ascii=False) + "\n", encoding="utf-8")
        (RAW / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    for e in report:
        detail = e.get("reason") or f"{e['routed_km']} km"
        stats = {k: e[k] for k in ("validated_km", "disused_km", "active_km", "razed_km", "connector_m", "longest_connector_m") if k in e}
        print(f"{e['status']:10} {e['name']}: {detail} {stats or ''}")
    same = sum(e["status"] == "same corridor" for e in report)
    print(f"\n{len(features)} drawn, {same} same corridor, {len(report) - len(features) - same} unresolved")
    return 0


if __name__ == "__main__":
    sys.exit(main())
