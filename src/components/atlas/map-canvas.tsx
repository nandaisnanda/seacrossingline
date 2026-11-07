import { useEffect, useRef } from "react";
import { LATEST_YEAR, type AtlasCollection, type AtlasData, type AtlasFeature } from "./atlas-data";
import { loadContext } from "./atlas-context";
import { loadLandmarks } from "./atlas-landmarks";
import {
  addOrnamentImages,
  ornamentGlyphs,
  rhumbLines,
  seaOrnaments,
  wavePoints,
} from "./atlas-ornaments";
import type { Visibility } from "./atlas-page-types";
import { playDrawOn } from "./draw-on";
import "maplibre-gl/dist/maplibre-gl.css";

export type ScaleState = { distanceKm: number; widthPx: number };
export type SelectedLine = AtlasFeature & {
  geometry: { type: "LineString"; coordinates: [number, number][] };
};

type MapCanvasProps = {
  data: AtlasData;
  year: number;
  visible: Visibility;
  onSelect: (feature: SelectedLine | null) => void;
  onBearing: (bearing: number) => void;
  onScale: (scale: ScaleState) => void;
  onReady: (map: import("maplibre-gl").Map) => void;
  onHover: (feature: AtlasFeature | null, point: { x: number; y: number } | null) => void;
};

const railwayLayers = ["active", "disused", "reactivation", "colonial"] as const;

export function MapCanvas({
  data,
  year,
  visible,
  onSelect,
  onBearing,
  onScale,
  onReady,
  onHover,
}: MapCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const callbackRefs = useRef({ onSelect, onBearing, onScale, onReady, onHover });
  const dataRef = useRef(data);
  const visibleRef = useRef(visible);
  const yearRef = useRef(year);
  useEffect(() => {
    callbackRefs.current = { onSelect, onBearing, onScale, onReady, onHover };
  }, [onSelect, onBearing, onScale, onReady, onHover]);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);
  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);
  useEffect(() => {
    yearRef.current = year;
  }, [year]);

  useEffect(() => {
    let disposed = false;
    let map: import("maplibre-gl").Map | undefined;
    let observer: ResizeObserver | undefined;
    let cancelDrawOn: (() => void) | undefined;
    void import("maplibre-gl")
      .then((maplibre) => {
        if (disposed || !hostRef.current) return;
        maplibre.setWorkerUrl(`${import.meta.env.BASE_URL}maplibre-gl-worker.mjs`);
        const palette = getAtlasMapPalette();
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const createdMap = new maplibre.Map({
          container: hostRef.current,
          style: {
            version: 8,
            sources: {},
            layers: [
              { id: "paper", type: "background", paint: { "background-color": palette.sea } },
            ],
          },
          center: [115, 8],
          zoom: 3.4,
          minZoom: 2,
          maxZoom: 18,
          maxBounds: [
            [70, -30],
            [165, 45],
          ],
          attributionControl: false,
          dragRotate: true,
          pitchWithRotate: false,
          cooperativeGestures: false,
          fadeDuration: reducedMotion ? 0 : 350,
        });
        map = createdMap;
        mapRef.current = createdMap;
        createdMap.on("load", () => {
          if (!createdMap) return;
          const current = dataRef.current;
          createdMap.addSource("land", {
            type: "geojson",
            data: current.land,
            tolerance: 0.375,
            buffer: 64,
          });
          createdMap.addSource("orn-rhumb", { type: "geojson", data: rhumbLines() });
          createdMap.addLayer({
            id: "orn-rhumb",
            type: "line",
            source: "orn-rhumb",
            paint: {
              "line-color": palette.ink,
              "line-width": 0.5,
              "line-opacity": ["interpolate", ["linear"], ["zoom"], 3, 0.2, 8, 0.14, 10, 0],
            },
          });
          // Water lines sit under the land fill, so only the outer half shows beyond the coast.
          createdMap.addLayer({
            id: "water-line-4",
            type: "line",
            source: "land",
            layout: { "line-join": "round" },
            paint: {
              "line-color": palette.ink,
              "line-width": ["interpolate", ["linear"], ["zoom"], 5.5, 4, 8, 26],
              "line-opacity": 0.035,
            },
          });
          createdMap.addLayer({
            id: "water-line-3",
            type: "line",
            source: "land",
            layout: { "line-join": "round" },
            paint: {
              "line-color": palette.ink,
              "line-width": ["interpolate", ["linear"], ["zoom"], 5.5, 3, 8, 16],
              "line-opacity": 0.05,
            },
          });
          createdMap.addLayer({
            id: "water-line-2",
            type: "line",
            source: "land",
            layout: { "line-join": "round" },
            paint: {
              "line-color": palette.ink,
              "line-width": ["interpolate", ["linear"], ["zoom"], 5.5, 2, 8, 9],
              "line-opacity": 0.09,
            },
          });
          createdMap.addLayer({
            id: "water-line-1",
            type: "line",
            source: "land",
            layout: { "line-join": "round" },
            paint: {
              "line-color": palette.ink,
              "line-width": ["interpolate", ["linear"], ["zoom"], 5.5, 1.2, 8, 4],
              "line-opacity": 0.18,
            },
          });
          createdMap.addLayer({
            id: "land-fill",
            type: "fill",
            source: "land",
            paint: { "fill-color": palette.land, "fill-opacity": 1 },
          });
          // Hand-colouring along the coast, as on printed maps of the period.
          createdMap.addLayer({
            id: "land-tint",
            type: "line",
            source: "land",
            layout: { "line-join": "round" },
            paint: {
              "line-color": palette.ochre,
              "line-width": ["interpolate", ["linear"], ["zoom"], 5.5, 1, 8, 5],
              "line-opacity": 0.26,
            },
          });
          createdMap.addLayer({
            id: "land-outline",
            type: "line",
            source: "land",
            paint: { "line-color": palette.ink, "line-width": 0.8, "line-opacity": 0.85 },
          });

          railwayLayers.forEach((key) => {
            const collection: AtlasCollection = current[key];
            createdMap.addSource(key, {
              type: "geojson",
              data: collection,
              lineMetrics: true,
              tolerance: 0.45,
              buffer: 128,
            });
          });
          const reactivationColor = [
            "match",
            ["get", "stage"],
            "selesai",
            palette.sage,
            palette.ochre,
          ];
          const disusedColor = [
            "match",
            ["get", "status"],
            "abandoned",
            palette.inkSoft,
            palette.oxblood,
          ];
          const specs = {
            active: { color: palette.ink, width: 1.1 },
            disused: { color: disusedColor, width: 1, dash: [4, 3] },
            reactivation: { color: reactivationColor, width: 1.8 },
            colonial: { color: palette.slate, width: 0.9, dash: [2, 2] },
          } as const;
          railwayLayers.forEach((key) => {
            const spec = specs[key];
            const dash = "dash" in spec ? { "line-dasharray": [...spec.dash] } : {};
            // Toggles only fade opacity; the draw-on below runs once and never again.
            createdMap.addLayer({
              id: key,
              type: "line",
              source: key,
              paint: {
                "line-color": spec.color as never,
                "line-width": spec.width,
                "line-opacity": layerOpacity(visibleRef.current)[key],
                "line-opacity-transition": { duration: reducedMotion ? 0 : 300, delay: 0 },
                ...dash,
              },
            });
          });
          // A line that has closed by today still ran in its own years: drawn from the disused source in the active style.
          createdMap.addLayer({
            id: "disused-running",
            type: "line",
            source: "disused",
            filter: ["==", ["get", "name"], ""],
            paint: {
              "line-color": specs.active.color as never,
              "line-width": specs.active.width,
              "line-opacity": visibleRef.current.active ? 0.92 : 0,
            },
          });
          // Hover repaints the same line one pixel wider at full opacity, in its own color.
          railwayLayers.forEach((key) => {
            const spec = specs[key];
            const dash = "dash" in spec ? { "line-dasharray": [...spec.dash] } : {};
            createdMap.addLayer({
              id: `${key}-hover`,
              type: "line",
              source: key,
              filter: ["==", ["get", "name"], ""],
              paint: {
                "line-color": spec.color as never,
                "line-width": spec.width + 1,
                "line-opacity": 1,
                ...dash,
              },
            });
          });
          // Cross-ties on active lines, the classic railway symbol, once lines stand clear of each other.
          createdMap.addLayer(
            {
              id: "active-ties",
              type: "line",
              source: "active",
              minzoom: 6.5,
              paint: {
                "line-color": palette.ink,
                "line-width": ["interpolate", ["linear"], ["zoom"], 6.5, 3, 12, 6],
                "line-dasharray": [0.18, 4],
                "line-opacity": visibleRef.current.active ? 0.6 : 0,
              },
            },
            "active",
          );
          void Promise.all([
            addOrnamentImages(createdMap, ornamentGlyphs(palette.ink, palette.land)),
            loadContext(),
          ]).then(async ([, context]) => {
            if (disposed) return;
            // Nested depth bands: each one adds a little slate, so the sea darkens with depth.
            createdMap.addSource("bathymetry", {
              type: "geojson",
              data: context.bathymetry as never,
            });
            createdMap.addLayer(
              {
                id: "sea-depth",
                type: "fill",
                source: "bathymetry",
                paint: {
                  "fill-color": palette.slate,
                  "fill-opacity": ["interpolate", ["linear"], ["zoom"], 5.5, 0.045, 7.5, 0],
                },
              },
              "orn-rhumb",
            );
            createdMap.addLayer(
              {
                id: "sea-isobath",
                type: "line",
                source: "bathymetry",
                paint: {
                  "line-color": palette.slate,
                  "line-width": 0.5,
                  "line-opacity": ["interpolate", ["linear"], ["zoom"], 5.5, 0.28, 7.5, 0],
                  "line-dasharray": [3, 3],
                },
              },
              "orn-rhumb",
            );
            // Land outside Southeast Asia sits under the region's own layers, paler, and carries no railway data.
            createdMap.addSource("neighbors", {
              type: "geojson",
              data: context.neighbors as never,
            });
            createdMap.addLayer(
              {
                id: "neighbor-water",
                type: "line",
                source: "neighbors",
                layout: { "line-join": "round" },
                paint: {
                  "line-color": palette.ink,
                  "line-width": ["interpolate", ["linear"], ["zoom"], 5.5, 1.5, 8, 7],
                  "line-opacity": 0.07,
                },
              },
              "land-fill",
            );
            createdMap.addLayer(
              {
                id: "neighbor-fill",
                type: "fill",
                source: "neighbors",
                paint: { "fill-color": palette.paper, "fill-opacity": 1 },
              },
              "land-fill",
            );
            createdMap.addLayer(
              {
                id: "neighbor-outline",
                type: "line",
                source: "neighbors",
                paint: { "line-color": palette.ink, "line-width": 0.6, "line-opacity": 0.45 },
              },
              "land-fill",
            );
            createdMap.addSource("borders", { type: "geojson", data: context.borders as never });
            createdMap.addLayer(
              {
                id: "borders",
                type: "line",
                source: "borders",
                layout: { "line-join": "round" },
                paint: {
                  "line-color": palette.oxblood,
                  "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.6, 8, 1.4],
                  "line-opacity": 0.55,
                  "line-dasharray": [4, 2, 1, 2],
                },
              },
              "active",
            );
            const sea = seaOrnaments();
            createdMap.addSource("orn-sea", {
              type: "geojson",
              data: {
                type: "FeatureCollection",
                features: [...wavePoints(current.land).features, ...sea.features],
              },
            });
            createdMap.addLayer(
              {
                id: "orn-sea",
                type: "symbol",
                source: "orn-sea",
                layout: {
                  "icon-image": ["get", "icon"],
                  "icon-size": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    3,
                    ["*", 0.7, ["get", "size"]],
                    6,
                    ["*", 1.1, ["get", "size"]],
                    9,
                    ["*", 1.8, ["get", "size"]],
                  ],
                  "icon-allow-overlap": true,
                  "icon-ignore-placement": true,
                },
                paint: {
                  "icon-opacity": ["interpolate", ["linear"], ["zoom"], 3, 0.95, 8, 0.8, 10, 0],
                },
              },
              "neighbor-water",
            );
            const { stations, volcanoes } = await loadLandmarks();
            if (disposed) return;
            createdMap.addSource("volcanoes", { type: "geojson", data: volcanoes });
            createdMap.addLayer(
              {
                id: "volcanoes",
                type: "symbol",
                source: "volcanoes",
                layout: {
                  "icon-image": "volcano",
                  "icon-size": [
                    "interpolate",
                    ["linear"],
                    ["zoom"],
                    3,
                    0.24,
                    5.25,
                    0.42,
                    8,
                    0.9,
                    12,
                    1.4,
                  ],
                  "icon-allow-overlap": true,
                  "icon-ignore-placement": true,
                },
              },
              "active",
            );
            createdMap.addSource("stations", { type: "geojson", data: stations });
            createdMap.addLayer({
              id: "stations",
              type: "circle",
              source: "stations",
              minzoom: 5,
              paint: {
                "circle-radius": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  5,
                  ["*", 0.9, ["match", ["get", "kind"], "halt", 0.7, 1]],
                  8,
                  ["*", 2.2, ["match", ["get", "kind"], "halt", 0.7, 1]],
                  12,
                  ["*", 4.5, ["match", ["get", "kind"], "halt", 0.7, 1]],
                ],
                "circle-color": palette.land,
                "circle-stroke-color": palette.ink,
                "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 5, 0.5, 12, 1.3],
              },
            });
          });
          const bounds = new maplibre.LngLatBounds();
          current.land.features.forEach((feature) => {
            if (feature.geometry.type === "Polygon") {
              feature.geometry.coordinates.forEach((ring) =>
                ring.forEach((point) => bounds.extend(point)),
              );
            } else if (feature.geometry.type === "MultiPolygon") {
              feature.geometry.coordinates.forEach((polygon) =>
                polygon.forEach((ring) => ring.forEach((point) => bounds.extend(point))),
              );
            }
          });
          // A resize keeps centre and zoom, so an unchanged view means the viewer has not moved the map since the fit.
          const viewOf = () =>
            `${createdMap.getZoom().toFixed(4)},${createdMap.getCenter().lng.toFixed(5)},${createdMap.getCenter().lat.toFixed(5)}`;
          let fittedView = "";
          createdMap.on("moveend", (event) => {
            if ((event as unknown as { autoFit?: boolean }).autoFit) fittedView = viewOf();
          });
          const fitRegion = () => {
            const narrow = createdMap.getContainer().clientWidth <= 900;
            const padding = narrow
              ? { top: 70, right: 12, bottom: 205, left: 12 }
              : { top: 24, right: 70, bottom: 150, left: 285 };
            createdMap.fitBounds(
              bounds,
              { padding, duration: reducedMotion ? 0 : 450, maxZoom: 5.5 },
              { autoFit: true },
            );
          };
          fitRegion();
          updateMapState(createdMap, visibleRef.current, yearRef.current, current);
          if (!reducedMotion) {
            const targets = railwayLayers.flatMap((key) => {
              const source = createdMap.getSource(key) as
                import("maplibre-gl").GeoJSONSource | undefined;
              return source
                ? [
                    {
                      setData: (next: AtlasCollection) => source.setData(next as never),
                      collection: current[key],
                    },
                  ]
                : [];
            });
            cancelDrawOn = playDrawOn(targets);
          }
          const scale = () => callbackRefs.current.onScale(getScale(createdMap));
          createdMap.on("move", scale);
          createdMap.on("zoom", scale);
          scale();
          createdMap.on("rotate", () => callbackRefs.current.onBearing(createdMap.getBearing()));
          // Hidden layers stay rendered at zero opacity, so they must be left out of hit tests.
          const shownLayers = () => [
            ...railwayLayers.filter((key) => visibleRef.current[key]),
            ...(visibleRef.current.active ? ["disused-running"] : []),
          ];
          createdMap.on("click", (event) => {
            const feature = createdMap
              .queryRenderedFeatures(event.point, { layers: shownLayers() })
              .find((item) => item.geometry.type === "LineString");
            if (!feature) {
              callbackRefs.current.onSelect(null);
              return;
            }
            callbackRefs.current.onSelect(feature as unknown as SelectedLine);
          });
          createdMap.on("mousemove", (event) => {
            const feature = createdMap
              .queryRenderedFeatures(event.point, { layers: shownLayers() })
              .find((item) => item.geometry.type === "LineString");
            const cursorPoint = { x: event.point.x, y: event.point.y };
            if (!feature) {
              createdMap.getCanvas().style.setProperty("cursor", "");
              railwayLayers.forEach((key) => setHover(createdMap, key, ""));
              callbackRefs.current.onHover(null, null);
              return;
            }
            const key = String(feature.source) as (typeof railwayLayers)[number];
            createdMap.getCanvas().style.setProperty("cursor", "crosshair");
            railwayLayers.forEach((layer) =>
              setHover(
                createdMap,
                layer,
                layer === key ? String(feature.properties?.["name"] ?? "") : "",
              ),
            );
            callbackRefs.current.onHover(feature as unknown as AtlasFeature, cursorPoint);
          });
          let initialFitScheduled = false;
          let refit: ReturnType<typeof setTimeout> | undefined;
          observer = new ResizeObserver(() => {
            createdMap.resize();
            if (initialFitScheduled) {
              // Follow rotation and window resizes until the viewer has moved the map themselves.
              clearTimeout(refit);
              refit = setTimeout(() => {
                if (!disposed && viewOf() === fittedView) fitRegion();
              }, 200);
              return;
            }
            initialFitScheduled = true;
            requestAnimationFrame(() => requestAnimationFrame(fitRegion));
          });
          if (hostRef.current) observer.observe(hostRef.current);
          callbackRefs.current.onReady(createdMap);
        });
      })
      .catch((error: unknown) => console.error("Atlas map could not start:", error));

    return () => {
      disposed = true;
      cancelDrawOn?.();
      observer?.disconnect();
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (map?.isStyleLoaded()) updateMapState(map, visible, year, data);
  }, [visible, year, data]);

  return (
    <div
      className="atlas-map"
      ref={hostRef}
      aria-label="Peta interaktif jaringan kereta api Asia Tenggara"
      role="application"
    />
  );
}

function getAtlasMapPalette() {
  const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  const read = (token: string) => {
    const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    if (!context) return value;
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    const pixel = context.getImageData(0, 0, 1, 1).data;
    context.clearRect(0, 0, 1, 1);
    return `rgb(${pixel[0] ?? 0}, ${pixel[1] ?? 0}, ${pixel[2] ?? 0})`;
  };
  return {
    paper: read("--atlas-paper"),
    land: read("--atlas-land"),
    sea: read("--atlas-sea"),
    ink: read("--atlas-ink"),
    inkSoft: read("--atlas-ink-soft"),
    oxblood: read("--atlas-oxblood"),
    ochre: read("--atlas-ochre"),
    sage: read("--atlas-sage"),
    slate: read("--atlas-slate"),
  };
}

export function setLineHighlight(map: import("maplibre-gl").Map | null, name: string) {
  if (!map) return;
  railwayLayers.forEach((layer) => setHover(map, layer, name));
}

function setHover(
  map: import("maplibre-gl").Map | undefined,
  key: (typeof railwayLayers)[number],
  name: string,
) {
  if (!map) return;
  [`${key}-hover`].forEach((layer) => {
    if (map.getLayer(layer)) map.setFilter(layer, ["==", ["get", "name"], name]);
  });
}

function layerOpacity(visible: Visibility): Record<(typeof railwayLayers)[number], number> {
  return {
    colonial: visible.colonial ? 0.9 : 0,
    active: visible.active ? 0.92 : 0,
    disused: visible.disused ? 0.9 : 0,
    reactivation: visible.reactivation ? 1 : 0,
  };
}

function updateMapState(
  map: import("maplibre-gl").Map,
  visible: Visibility,
  year: number,
  data: AtlasData,
) {
  Object.entries(layerOpacity(visible)).forEach(([layer, value]) => {
    if (map.getLayer(layer)) map.setPaintProperty(layer, "line-opacity", value);
  });
  if (map.getLayer("active-ties"))
    map.setPaintProperty("active-ties", "line-opacity", visible.active ? 0.6 : 0);
  if (map.getLayer("disused-running"))
    map.setPaintProperty("disused-running", "line-opacity", visible.active ? 0.92 : 0);
  if (map.getLayer("colonial"))
    map.setFilter("colonial", [
      "any",
      ["!", ["has", "year_built"]],
      ["<=", ["get", "year_built"], year],
    ]);
  // These filters mirror lineStateForYear and isStationVisibleForYear in atlas-data.ts.
  type Filter = import("maplibre-gl").ExpressionSpecification;
  const today = year >= LATEST_YEAR;
  const opened: Filter = [
    "case",
    ["has", "opened_year"],
    ["<=", ["get", "opened_year"], year],
    today,
  ];
  const setFilter = (layer: string, filter: Filter) => {
    if (map.getLayer(layer)) map.setFilter(layer, filter);
  };
  setFilter("active", opened);
  setFilter("active-ties", opened);
  setFilter("stations", [
    "all",
    opened,
    ["case", ["has", "closed_year"], [">", ["get", "closed_year"], year], true],
  ]);
  setFilter("disused", [
    "case",
    ["has", "closed_year"],
    ["<=", ["get", "closed_year"], year],
    opened,
  ]);
  setFilter("disused-running", [
    "all",
    ["has", "opened_year"],
    ["has", "closed_year"],
    ["<=", ["get", "opened_year"], year],
    [">", ["get", "closed_year"], year],
  ]);
  setFilter("reactivation", [
    "case",
    ["has", "source_year"],
    ["<=", ["get", "source_year"], year],
    today,
  ]);
  void data;
}

function getScale(map: import("maplibre-gl").Map | undefined): ScaleState {
  if (!map) return { distanceKm: 50, widthPx: 72 };
  const latitude = map.getCenter().lat;
  const metersPerPixel = (156543.03392 * Math.cos((latitude * Math.PI) / 180)) / 2 ** map.getZoom();
  // Largest round distance whose bar fits in 140 px; the width is exact, never clamped.
  const choices = [0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 25, 50, 100, 200, 500, 1000];
  const maxKm = (140 * metersPerPixel) / 1000;
  const distanceKm = choices.filter((candidate) => candidate <= maxKm).at(-1) ?? 0.02;
  return { distanceKm, widthPx: (distanceKm * 1000) / metersPerPixel };
}

export type { AtlasData };
