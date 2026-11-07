import { useEffect, useState } from "react";
import type { AtlasText } from "./atlas-i18n";

type Tick = { value: number; offset: number };
type Ticks = { lng: Tick[]; lat: Tick[] };

const STEPS = [0.0002, 0.0005, 0.001, 0.002, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10];

/** Picks the smallest degree step that keeps ticks at least `minPx` apart. */
export function niceStep(degreesPerPx: number, minPx: number): number {
  return STEPS.find((step) => step / degreesPerPx >= minPx) ?? (STEPS[STEPS.length - 1] as number);
}

export function ticksBetween(min: number, max: number, step: number): number[] {
  const values: number[] = [];
  for (let value = Math.ceil(min / step) * step; value <= max + 1e-9; value += step)
    values.push(Number(value.toFixed(4)));
  return values;
}

export function formatDegree(value: number, axis: "lng" | "lat", t: AtlasText): string {
  const hemisphere =
    axis === "lng" ? (value >= 0 ? t.hemiE : t.hemiW) : value >= 0 ? t.hemiN : t.hemiS;
  const magnitude = Math.abs(value);
  return `${Number(magnitude.toFixed(4))}°${hemisphere}`;
}

function measure(map: import("maplibre-gl").Map): Ticks {
  const canvas = map.getContainer();
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  // With a rotated map the edges no longer follow meridians, so the ticks are only drawn when north is up.
  if (!width || !height || Math.abs(map.getBearing()) > 0.5) return { lng: [], lat: [] };
  const northWest = map.unproject([0, 0]);
  const southEast = map.unproject([width, height]);
  const lngStep = niceStep((southEast.lng - northWest.lng) / width, 50);
  const latStep = niceStep((northWest.lat - southEast.lat) / height, 50);
  const lng = ticksBetween(northWest.lng, southEast.lng, lngStep).map((value) => ({
    value,
    offset: map.project([value, northWest.lat]).x,
  }));
  const lat = ticksBetween(southEast.lat, northWest.lat, latStep).map((value) => ({
    value,
    offset: map.project([northWest.lng, value]).y,
  }));
  // Keep ticks off the corners so the two label rows never collide.
  const inside = (limit: number) => (tick: Tick) => tick.offset >= 28 && tick.offset <= limit - 28;
  return { lng: lng.filter(inside(width)), lat: lat.filter(inside(height)) };
}

export function Graticule({ map, t }: { map: import("maplibre-gl").Map | null; t: AtlasText }) {
  const [ticks, setTicks] = useState<Ticks>({ lng: [], lat: [] });
  useEffect(() => {
    if (!map) return;
    const update = () => setTicks(measure(map));
    update();
    map.on("move", update);
    map.on("resize", update);
    map.on("rotate", update);
    return () => {
      map.off("move", update);
      map.off("resize", update);
      map.off("rotate", update);
    };
  }, [map]);
  return (
    <div className="graticule" aria-hidden="true">
      {ticks.lng.map((tick) => (
        <span className="grat-tick grat-top" style={{ left: tick.offset }} key={`n${tick.value}`}>
          <i />
          <b>{formatDegree(tick.value, "lng", t)}</b>
        </span>
      ))}
      {ticks.lng.map((tick) => (
        <span
          className="grat-tick grat-bottom"
          style={{ left: tick.offset }}
          key={`s${tick.value}`}
        >
          <i />
        </span>
      ))}
      {ticks.lat.map((tick) => (
        <span className="grat-tick grat-left" style={{ top: tick.offset }} key={`w${tick.value}`}>
          <i />
          <b>{formatDegree(tick.value, "lat", t)}</b>
        </span>
      ))}
      {ticks.lat.map((tick) => (
        <span className="grat-tick grat-right" style={{ top: tick.offset }} key={`e${tick.value}`}>
          <i />
        </span>
      ))}
    </div>
  );
}
