import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  MapCanvas,
  setLineHighlight,
  type ScaleState,
  type SelectedLine,
} from "@/components/atlas/map-canvas";
import { type CityFeature, cityDisplayName, loadContext } from "@/components/atlas/atlas-context";
import { cityDetails } from "@/components/atlas/atlas-city";
import { CityPopup } from "@/components/atlas/city-popup";
import { type LandmarkFeature, loadLandmarks } from "@/components/atlas/atlas-landmarks";
import {
  type DataSource,
  AboutData,
  AtlasTools,
  Cartouche,
  CompassRose,
  DEFAULT_YEAR,
  ErrorCartouche,
  Footer,
  Legend,
  MIN_YEAR,
  TimeControl,
  ZoomControls,
} from "@/components/atlas/atlas-controls";
import {
  atlasCopy,
  eraStarts,
  type AtlasLanguage,
  type AtlasText,
} from "@/components/atlas/atlas-i18n";
import {
  isFeatureVisibleForYear,
  isStationVisibleForYear,
  LATEST_YEAR,
  lineStateForYear,
  loadAtlasData,
  mergeCompletedReactivate,
  type AtlasData,
  type AtlasFeature,
} from "@/components/atlas/atlas-data";
import type { Visibility } from "@/components/atlas/atlas-page-types";
import { StampPopup } from "@/components/atlas/stamp-popup";
import { Graticule } from "@/components/atlas/graticule";
import { length as turfLength } from "@turf/length";
import { lineString } from "@turf/helpers";
import { bearing as turfBearing } from "@turf/bearing";

import "@/components/atlas/atlas.css";

const INITIAL_VISIBILITY: Visibility = {
  active: true,
  disused: true,
  reactivation: true,
  colonial: false,
};
type DataMeta = { sample: boolean; updated?: string; notes?: string; sources?: DataSource[] };

// Crawlers need absolute URLs, so these tags ship only when the deployed address is known.
const SITE_URL = (import.meta.env["VITE_SITE_URL"] as string | undefined)?.replace(/\/$/, "");

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SEA Crossing Line — Atlas Kereta Api" },
      {
        name: "description",
        content: "Jelajahi jaringan kereta api Asia Tenggara dari 1867 hingga hari ini.",
      },
      { property: "og:title", content: "SEA Crossing Line — Atlas Kereta Api" },
      {
        property: "og:description",
        content: "Atlas interaktif jalur kereta aktif dan nonaktif di Asia Tenggara.",
      },
      { property: "og:type", content: "website" },
      ...(SITE_URL
        ? [
            { property: "og:url", content: `${SITE_URL}/` },
            { property: "og:image", content: `${SITE_URL}/og.png` },
            { property: "og:image:width", content: "1200" },
            { property: "og:image:height", content: "630" },
            { name: "twitter:card", content: "summary_large_image" },
          ]
        : []),
    ],
    links: SITE_URL ? [{ rel: "canonical", href: `${SITE_URL}/` }] : [],
  }),
  component: AtlasPage,
});

function AtlasPage() {
  const [year, setYear] = useState<number>(DEFAULT_YEAR);
  const [playing, setPlaying] = useState(false);
  const [visible, setVisible] = useState(INITIAL_VISIBILITY);
  const [language, setLanguage] = useState<AtlasLanguage>("id");
  const [data, setData] = useState<AtlasData | null>(null);
  const [meta, setMeta] = useState<DataMeta>({ sample: true, sources: [] });
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<SelectedLine | null>(null);
  const [city, setCity] = useState<CityFeature | null>(null);
  const [stations, setStations] = useState<LandmarkFeature[]>([]);
  const [bearing, setBearing] = useState(0);
  const [scale, setScale] = useState<ScaleState>({ distanceKm: 50, widthPx: 72 });
  const [totals, setTotals] = useState({ active: 0, disused: 0, planned: 0 });
  const [aboutOpen, setAboutOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hovered, setHovered] = useState<{
    feature: AtlasFeature;
    point: { x: number; y: number };
  } | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const [mapInstance, setMapInstance] = useState<import("maplibre-gl").Map | null>(null);
  const reducedMotion =
    typeof window === "undefined" ||
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const t: AtlasText = atlasCopy[language];

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    let cancelled = false;
    void import("maplibre-gl").catch((reason: unknown) => {
      console.error("Atlas map library could not preload:", reason);
    });
    void Promise.all([
      loadAtlasData(),
      fetch(`${import.meta.env.BASE_URL}data/meta.json`)
        .then((response) =>
          response.ok ? (response.json() as Promise<DataMeta>) : { sample: true, sources: [] },
        )
        .catch(() => ({ sample: true, sources: [] })),
    ])
      .then(([loaded, dataMeta]) => {
        if (cancelled) return;
        setData(mergeCompletedReactivate(loaded));
        setMeta(dataMeta);
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setError(reason instanceof Error ? reason.message : "Data peta tidak dapat dibaca.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedYear = Number(params.get("year"));
    const layers = params.get("layers")?.split(",");
    if (Number.isInteger(requestedYear) && requestedYear >= 1867 && requestedYear <= 2026)
      setYear(requestedYear);
    if (params.get("lang") === "en" || params.get("lang") === "id")
      setLanguage(params.get("lang") as AtlasLanguage);
    if (layers)
      setVisible({
        active: layers.includes("active"),
        disused: layers.includes("disused"),
        reactivation: layers.includes("reactivation"),
        colonial: layers.includes("colonial"),
      });
  }, []);

  useEffect(() => {
    void loadLandmarks().then((landmarks) => setStations(landmarks.stations.features));
  }, []);

  // Lengths once per data load; the legend then only re-adds them as the timeline moves.
  const lengths = useMemo(() => {
    if (!data) return null;
    const measure = (features: AtlasFeature[]) =>
      features.map((feature) => ({
        properties: feature.properties,
        km:
          feature.geometry.type === "LineString"
            ? turfLength(lineString(feature.geometry.coordinates as [number, number][]), {
                units: "kilometers",
              })
            : 0,
      }));
    return {
      active: measure(data.active.features),
      disused: measure(data.disused.features),
      reactivation: measure(data.reactivation.features),
    };
  }, [data]);
  useEffect(() => {
    if (!lengths) return;
    // A disused line that still ran in this year counts as active, as the map draws it.
    const add = (
      lines: typeof lengths.active,
      keep: (properties: AtlasFeature["properties"]) => boolean,
    ) => lines.reduce((total, line) => (keep(line.properties) ? total + line.km : total), 0);
    const running =
      add(lengths.active, (p) => lineStateForYear("active", p, year) === "running") +
      add(lengths.disused, (p) => lineStateForYear("disused", p, year) === "running");
    const closed = add(lengths.disused, (p) => lineStateForYear("disused", p, year) === "closed");
    const planned = add(lengths.reactivation, (p) =>
      isFeatureVisibleForYear("reactivation", p, year),
    );
    setTotals({
      active: visible.active ? Math.round(running) : 0,
      disused: visible.disused ? Math.round(closed) : 0,
      planned: visible.reactivation ? Math.round(planned) : 0,
    });
  }, [lengths, visible, year]);

  // Years where a label or era changes hold a little longer, so the new name can be read as it appears.
  const [cityList, setCityList] = useState<CityFeature[]>([]);
  useEffect(() => {
    void loadContext().then((context) =>
      setCityList(context.cities.features as unknown as CityFeature[]),
    );
  }, []);
  const holdYears = useMemo(
    () =>
      new Set<number>([
        ...eraStarts,
        SEA_NAME_END,
        ...countryPoints.map((land) => land.until ?? SEA_NAME_END),
        ...cityList.flatMap((city) => [
          ...(city.properties.names ?? []).map(([until]) => until),
          ...(city.properties.founded ? [city.properties.founded] : []),
        ]),
      ]),
    [cityList],
  );

  useEffect(() => {
    if (!playing || reducedMotion) return;
    if (year >= LATEST_YEAR) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(
      () => setYear((current) => current + 1),
      holdYears.has(year) ? YEAR_HOLD_MS : YEAR_STEP_MS,
    );
    return () => window.clearTimeout(timer);
  }, [playing, year, reducedMotion, holdYears]);

  useEffect(() => {
    if (reducedMotion || !mapReady) return;
    const timer = window.setTimeout(
      () => document.querySelector(".atlas-map-stage")?.classList.add("intro-complete"),
      600,
    );
    return () => window.clearTimeout(timer);
  }, [mapReady, reducedMotion]);

  const allLines = useMemo(
    () =>
      data
        ? [
            ...data.active.features,
            ...data.disused.features,
            ...data.reactivation.features,
            ...data.colonial.features,
          ]
        : [],
    [data],
  );
  const results = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return needle
      ? [
          ...new Set(
            allLines
              .map((feature) => String(feature.properties["name"] ?? ""))
              .filter((name) => name.toLocaleLowerCase().includes(needle)),
          ),
        ]
          .slice(0, 6)
          .map((name) => ({ name }))
      : [];
  }, [allLines, query]);

  const toggleLayer = useCallback(
    (key: keyof Visibility) => setVisible((current) => ({ ...current, [key]: !current[key] })),
    [],
  );
  const closeAbout = useCallback(() => setAboutOpen(false), []);
  const setScaleFromMap = useCallback((value: ScaleState) => setScale(value), []);
  const chooseLine = useCallback(
    (name: string) => {
      const match = allLines.find((feature) => feature.properties["name"] === name);
      if (!match || match.geometry.type !== "LineString") return;
      setLineHighlight(mapRef.current, name);
      setQuery("");
      setCity(null);
      setSelected(match as SelectedLine);
      const coordinates = match.geometry.coordinates as [number, number][];
      const lng = coordinates.reduce((sum, point) => sum + point[0], 0) / coordinates.length;
      const lat = coordinates.reduce((sum, point) => sum + point[1], 0) / coordinates.length;
      mapRef.current?.flyTo({ center: [lng, lat], zoom: 7.3, duration: reducedMotion ? 0 : 500 });
    },
    [allLines, reducedMotion],
  );

  const handleSelect = useCallback((feature: SelectedLine | null) => {
    setSelected(feature);
    setCity(null);
  }, []);
  const chooseCity = useCallback(
    (next: CityFeature) => {
      setSelected(null);
      setCity(next);
      const narrow = window.innerWidth <= 900;
      // Keep the city clear of the record card: to the left on desktop, above the sheet on a phone.
      mapRef.current?.flyTo({
        center: next.geometry.coordinates,
        zoom: 10.5,
        offset: narrow ? [0, -150] : [-130, 0],
        duration: reducedMotion ? 0 : 1100,
      });
    },
    [reducedMotion],
  );
  const details = useMemo(() => {
    if (!city || !data) return null;
    return cityDetails(
      city.geometry.coordinates,
      year,
      [
        { file: "active", features: data.active.features },
        { file: "disused", features: data.disused.features },
      ],
      stations,
    );
  }, [city, data, stations, year]);

  return (
    <main className="atlas-shell">
      <div className="atlas-map-stage">
        {data && (
          <MapCanvas
            year={year}
            visible={visible}
            data={data}
            onSelect={handleSelect}
            onBearing={setBearing}
            onScale={setScaleFromMap}
            onReady={(map) => {
              mapRef.current = map;
              setMapInstance(map);
              setMapReady(true);
            }}
            onHover={(feature, point) => setHovered(feature && point ? { feature, point } : null)}
          />
        )}
        <div className="map-wash" aria-hidden="true" />
        <div className="map-grain" aria-hidden="true" />
        <div className="map-vignette" aria-hidden="true" />
        <Graticule map={mapInstance} t={t} />
        <div className="map-neatline" aria-hidden="true" />
        <LandmarkLabels map={mapInstance} year={year} />
        <PlaceLabels
          map={mapInstance}
          year={year}
          cities={cityList}
          activeCity={city?.properties.name}
          onCity={chooseCity}
        />
        {!mapReady && !error && (
          <div className="map-loading" role="status" aria-label={t.loadingMap}>
            <span />
          </div>
        )}
        <Cartouche year={year} t={t} />
        <AtlasTools
          language={language}
          onLanguage={setLanguage}
          onAbout={() => setAboutOpen(true)}
          query={query}
          results={results}
          onQuery={setQuery}
          onSelect={chooseLine}
          t={t}
        />
        {data && (
          <Legend
            visible={visible}
            onToggle={toggleLayer}
            totals={totals}
            language={language}
            t={t}
          />
        )}
        <TimeControl
          year={year}
          onChange={setYear}
          playing={playing}
          onPlay={() => {
            if (!playing && year >= LATEST_YEAR) setYear(MIN_YEAR);
            setPlaying((state) => !state);
          }}
          language={language}
          t={t}
        />
        <ZoomControls
          onZoomIn={() => mapRef.current?.zoomIn({ duration: reducedMotion ? 0 : 300 })}
          onZoomOut={() => mapRef.current?.zoomOut({ duration: reducedMotion ? 0 : 300 })}
          t={t}
        />
        <CompassRose
          bearing={bearing}
          onReset={() => {
            mapRef.current?.easeTo({ bearing: 0, duration: reducedMotion ? 0 : 500 });
            setBearing(0);
          }}
          t={t}
        />
        <Footer distanceKm={scale.distanceKm} widthPx={scale.widthPx} t={t} />
        {selected && <TrainMark map={mapInstance} route={selected} />}
        {hovered && (
          <div
            className="line-hover-tag"
            style={{ left: hovered.point.x + 14, top: hovered.point.y + 14 }}
          >
            <strong>{String(hovered.feature.properties["name"] ?? "")}</strong>
            <span>
              {String(
                hovered.feature.properties["stage"] ??
                  hovered.feature.properties["status"] ??
                  hovered.feature.properties["operator"] ??
                  hovered.feature.properties["company"] ??
                  t.lineFallback,
              )}
            </span>
          </div>
        )}
        {selected && (
          <StampPopup
            feature={selected}
            language={language}
            t={t}
            onClose={() => setSelected(null)}
          />
        )}
        {city && details && (
          <CityPopup
            city={city}
            details={details}
            year={year}
            language={language}
            t={t}
            onClose={() => setCity(null)}
            onLine={chooseLine}
          />
        )}
        {error && <ErrorCartouche message={error} t={t} />}
        <AboutData
          open={aboutOpen}
          onClose={closeAbout}
          sources={meta.sources ?? []}
          showColonialNote={Boolean(meta.notes)}
          t={t}
        />
      </div>
    </main>
  );
}

const YEAR_STEP_MS = 180;
const YEAR_HOLD_MS = 900;
// Period sea names, and regional names with no `until` of their own, end with Indonesian independence.
const SEA_NAME_END = 1945;

// Label positions and the year each period name ends: independence, a formal renaming, or the formation of the modern state.
const countryPoints: Array<{
  modern: string;
  colonial: string;
  until?: number;
  coordinates: [number, number];
}> = [
  { modern: "MYANMAR", colonial: "BIRMA", until: 1989, coordinates: [96.2, 21.6] },
  { modern: "THAILAND", colonial: "SIAM", until: 1939, coordinates: [101, 15.6] },
  { modern: "LAOS", colonial: "INDOCHINE", until: 1953, coordinates: [103.2, 19.4] },
  { modern: "VIETNAM", colonial: "ANNAM", coordinates: [107.3, 15.2] },
  { modern: "KAMBOJA", colonial: "CAMBODGE", until: 1953, coordinates: [104.9, 12.7] },
  { modern: "MALAYSIA", colonial: "MALAYA", until: 1963, coordinates: [102.4, 4.4] },
  { modern: "SUMATRA", colonial: "SUMATRA", coordinates: [101.6, -0.7] },
  { modern: "KALIMANTAN", colonial: "BORNEO", coordinates: [113.8, 0.5] },
  { modern: "SULAWESI", colonial: "CELEBES", coordinates: [120.9, -2.2] },
  { modern: "FILIPINA", colonial: "PHILIPPINES", until: 1946, coordinates: [121.4, 16.6] },
  { modern: "PAPUA", colonial: "NIEUW-GUINEA", until: 1963, coordinates: [136.5, -3.7] },
];

const seaPoints: Array<{
  modern: string;
  colonial: string;
  coordinates: [number, number];
  small?: boolean;
}> = [
  { modern: "SAMUDRA HINDIA", colonial: "INDISCHE OCEAAN", coordinates: [98, -9] },
  { modern: "TELUK BENGGALA", colonial: "BAY OF BENGAL", coordinates: [89.5, 15] },
  { modern: "LAUT ANDAMAN", colonial: "ANDAMAN SEA", coordinates: [95.8, 9.5], small: true },
  { modern: "LAUT CINA SELATAN", colonial: "CHINA SEA", coordinates: [113.5, 10.5] },
  { modern: "LAUT JAWA", colonial: "JAVA ZEE", coordinates: [111.5, -5.4], small: true },
  { modern: "LAUT SULAWESI", colonial: "CELEBES ZEE", coordinates: [122, 3.3], small: true },
  { modern: "LAUT BANDA", colonial: "BANDA ZEE", coordinates: [127, -5.9], small: true },
  { modern: "LAUT FILIPINA", colonial: "PHILIPPINE SEA", coordinates: [131.5, 16] },
  { modern: "SELAT MALAKA", colonial: "STRAAT VAN MALAKKA", coordinates: [99.8, 3.8], small: true },
];

function PlaceLabels({
  map,
  year,
  cities,
  activeCity,
  onCity,
}: {
  map: import("maplibre-gl").Map | null;
  year: number;
  cities: CityFeature[];
  activeCity: string | undefined;
  onCity: (city: CityFeature) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!map || !root.current) return;
    const markers = Array.from(root.current.querySelectorAll<HTMLElement>("[data-lng]"));
    const update = () => {
      const zoomOpacity = Math.max(0, Math.min(1, (map.getZoom() - 1.8) / 0.8));
      root.current?.style.setProperty(
        "--label-scale",
        `${Math.max(0.85, Math.min(2.2, 1 + (map.getZoom() - 4) * 0.2))}`,
      );
      // Markers are in priority order: a label that collides with an earlier one hides until zoom separates them.
      const placed: { x: number; y: number; w: number; h: number }[] = [];
      markers.forEach((marker) => {
        const point = map.project([Number(marker.dataset["lng"]), Number(marker.dataset["lat"])]);
        marker.style.left = `${point.x}px`;
        marker.style.top = `${point.y}px`;
        const box = { x: point.x, y: point.y, w: marker.offsetWidth, h: marker.offsetHeight };
        const collides = placed.some(
          (other) =>
            Math.abs(other.x - box.x) < (other.w + box.w) / 2 &&
            Math.abs(other.y - box.y) < (other.h + box.h) / 2,
        );
        marker.style.opacity = collides ? "0" : `${zoomOpacity}`;
        // A hidden city label must not catch clicks or keyboard focus.
        if (marker instanceof HTMLButtonElement) {
          marker.style.pointerEvents = collides ? "none" : "auto";
          marker.tabIndex = collides ? -1 : 0;
        }
        if (!collides) placed.push(box);
      });
    };
    update();
    map.on("move", update);
    map.on("zoom", update);
    return () => {
      map.off("move", update);
      map.off("zoom", update);
    };
  }, [map, cities, year]);
  return (
    <div className="geo-label-layer" ref={root}>
      {cities
        .filter((city) => !city.properties.founded || year >= city.properties.founded)
        .map((city) => (
          <button
            type="button"
            className={
              city.properties.name === activeCity ? "city-label city-label-active" : "city-label"
            }
            data-lng={city.geometry.coordinates[0]}
            data-lat={city.geometry.coordinates[1]}
            key={city.properties.name}
            onClick={() => onCity(city)}
          >
            {cityDisplayName(city, year)}
          </button>
        ))}
      {countryPoints.map((land) => (
        <span
          className="neighbor-label"
          aria-hidden="true"
          data-lng={land.coordinates[0]}
          data-lat={land.coordinates[1]}
          key={land.modern}
        >
          {year < (land.until ?? SEA_NAME_END) ? land.colonial : land.modern}
        </span>
      ))}
      {seaPoints.map((sea) => (
        <span
          className={sea.small ? "sea-label sea-label-small" : "sea-label"}
          aria-hidden="true"
          data-lng={sea.coordinates[0]}
          data-lat={sea.coordinates[1]}
          key={sea.modern}
        >
          {year < SEA_NAME_END ? sea.colonial : sea.modern}
        </span>
      ))}
    </div>
  );
}

/** Volcano names with their heights from zoom 6.6, station names from zoom 9.5. Only what fits in view is in the DOM. */
function LandmarkLabels({ map, year }: { map: import("maplibre-gl").Map | null; year: number }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!map || !root.current) return;
    const host = root.current;
    let volcanoes: LandmarkFeature[] = [];
    let stations: LandmarkFeature[] = [];
    let frame = 0;
    const draw = () => {
      frame = 0;
      const zoom = map.getZoom();
      const view = map.getBounds();
      const candidates = [
        ...(zoom >= 6.6 ? volcanoes : []).map((feature) => ({
          feature,
          className: "landmark-label volcano-label",
        })),
        ...(zoom >= 9.5
          ? stations.filter((s) => isStationVisibleForYear(s.properties, year))
          : []
        ).map((feature) => ({ feature, className: "landmark-label station-label" })),
      ]
        .filter(({ feature }) => view.contains(feature.geometry.coordinates))
        .slice(0, 80);
      // City and sea labels placed by PlaceLabels keep priority over these.
      const placed = Array.from(
        document.querySelectorAll<HTMLElement>(".city-label, .sea-label, .neighbor-label"),
      )
        .filter((label) => label.style.opacity !== "0" && label.offsetWidth > 0)
        .map((label) => ({
          x: label.offsetLeft,
          y: label.offsetTop,
          w: label.offsetWidth,
          h: label.offsetHeight,
        }));
      host.replaceChildren();
      candidates.forEach(({ feature, className }) => {
        const point = map.project(feature.geometry.coordinates);
        const label = document.createElement("span");
        label.className = className;
        const { name, ele } = feature.properties;
        label.textContent = ele === undefined ? name : `${name} · ${ele} m`;
        label.style.left = `${point.x}px`;
        label.style.top = `${point.y + 12}px`;
        host.append(label);
        const box = { x: point.x, y: point.y + 12, w: label.offsetWidth, h: label.offsetHeight };
        if (
          placed.some(
            (other) =>
              Math.abs(other.x - box.x) < (other.w + box.w) / 2 &&
              Math.abs(other.y - box.y) < (other.h + box.h) / 2,
          )
        )
          label.remove();
        else placed.push(box);
      });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    let cancelled = false;
    void loadLandmarks().then((landmarks) => {
      if (cancelled) return;
      volcanoes = [...landmarks.volcanoes.features].sort(
        (a, b) => (b.properties.ele ?? 0) - (a.properties.ele ?? 0),
      );
      stations = landmarks.stations.features;
      schedule();
    });
    map.on("move", schedule);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      map.off("move", schedule);
    };
  }, [map, year]);
  return <div className="geo-label-layer" ref={root} aria-hidden="true" />;
}

function TrainMark({
  map,
  route,
}: {
  map: import("maplibre-gl").Map | null;
  route: AtlasFeature | null;
}) {
  const trainRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!map || !route || route.geometry.type !== "LineString" || !trainRef.current) return;
    const coordinates = route.geometry.coordinates as [number, number][];
    if (coordinates.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      return;
    const segments = coordinates.slice(0, -1).flatMap((start, index) => {
      const end = coordinates[index + 1];
      return end
        ? [{ start, end, lengthKm: turfLength(lineString([start, end]), { units: "kilometers" }) }]
        : [];
    });
    const trackLength = segments.reduce((total, segment) => total + segment.lengthKm, 0);
    if (trackLength <= 0 || segments.length === 0) return;
    let frame = 0;
    const started = performance.now();
    const update = (now: number) => {
      const positionKm = (((now - started) / 18000) * trackLength) % trackLength;
      let distanceBeforeSegment = 0;
      let segment = segments[0];
      for (const candidate of segments) {
        segment = candidate;
        if (positionKm <= distanceBeforeSegment + candidate.lengthKm) break;
        distanceBeforeSegment += candidate.lengthKm;
      }
      if (!segment) return;
      const segmentProgress =
        segment.lengthKm > 0
          ? Math.min(1, Math.max(0, (positionKm - distanceBeforeSegment) / segment.lengthKm))
          : 0;
      const position: [number, number] = [
        segment.start[0] + (segment.end[0] - segment.start[0]) * segmentProgress,
        segment.start[1] + (segment.end[1] - segment.start[1]) * segmentProgress,
      ];
      const rotation = turfBearing(segment.start, segment.end);
      const pixel = map.project(position);
      trainRef.current?.style.setProperty(
        "transform",
        `translate3d(${pixel.x - 15}px, ${pixel.y - 15}px, 0) rotate(${rotation}deg)`,
      );
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [map, route]);
  return (
    <span className="train-mark" ref={trainRef} aria-hidden="true">
      <svg viewBox="0 0 42 42">
        <path d="M8 29h26l-3-13h-8V9h-8v7h-5l-2 13Zm4-9h14l1.7 6H10.6l1.4-6Z" />
        <circle cx="14" cy="32" r="3" />
        <circle cx="29" cy="32" r="3" />
        <path d="M23 12h8v3h-8ZM7 35h28v2H7Z" />
      </svg>
      <i />
      <i />
      <i />
    </span>
  );
}
