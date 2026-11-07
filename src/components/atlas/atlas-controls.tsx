import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ChevronDown, Info, Languages, Pause, Play, Search } from "lucide-react";
import type { Visibility } from "./atlas-page-types";
import { LATEST_YEAR } from "./atlas-data";
import { textForYear, type AtlasLanguage, type AtlasText } from "./atlas-i18n";

export const MIN_YEAR = 1867;
// The last year before the Pacific War reached Southeast Asia: the fullest map of the early networks.
export const DEFAULT_YEAR = 1941;
export const MAX_YEAR = LATEST_YEAR;

export function Cartouche({ year, t }: { year: number; t: AtlasText }) {
  return (
    <header className="cartouche" aria-label={t.appTitle}>
      <span className="cartouche-kicker">{t.kicker}</span>
      <h1>{t.appTitle}</h1>
      <div className="cartouche-rule" aria-hidden="true">
        <i />
      </div>
      <p>{t.subtitle}</p>
      <span className="cartouche-year">
        {t.stateOfYear} {year}
      </span>
    </header>
  );
}

export type Totals = { active: number; disused: number; planned: number };

const legendKeys: Array<{
  key: keyof Visibility;
  mark: string;
  label: keyof AtlasText;
  note: keyof AtlasText;
  total?: keyof Totals;
}> = [
  {
    key: "active",
    mark: "legend-mark-active",
    label: "active",
    note: "activeNote",
    total: "active",
  },
  {
    key: "disused",
    mark: "legend-mark-disused",
    label: "disused",
    note: "disusedNote",
    total: "disused",
  },
  {
    key: "reactivation",
    mark: "legend-mark-reactivation",
    label: "reactivation",
    note: "reactivationNote",
    total: "planned",
  },
  { key: "colonial", mark: "legend-mark-colonial", label: "colonial", note: "colonialNote" },
];

export function Legend({
  visible,
  onToggle,
  totals,
  language,
  t,
}: {
  visible: Visibility;
  onToggle: (key: keyof Visibility) => void;
  totals: Totals;
  language: AtlasLanguage;
  t: AtlasText;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpen(window.matchMedia("(min-width: 901px)").matches);
  }, []);
  const locale = language === "id" ? "id-ID" : "en-US";
  return (
    <section className={`legend-panel ${open ? "legend-open" : ""}`} aria-label={t.legend}>
      <button
        type="button"
        className="legend-tab"
        onClick={() => setOpen((state) => !state)}
        aria-expanded={open}
        aria-label={open ? t.closeLayers : t.openLayers}
      >
        <span>{t.legend}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div className="legend-rows">
          {legendKeys.map((row) => (
            <label key={row.key} className="legend-row" title={String(t[row.note])}>
              <input
                type="checkbox"
                checked={visible[row.key]}
                onChange={() => onToggle(row.key)}
              />
              <span className={`legend-mark ${row.mark}`} aria-hidden="true" />
              <span className="legend-copy">
                {t[row.label]} ·{" "}
                {row.total ? `${totals[row.total].toLocaleString(locale)} km` : t[row.note]}
              </span>
            </label>
          ))}
          <div className="legend-row legend-static">
            <span className="legend-mark mark-station" aria-hidden="true" />
            <span className="legend-copy">{t.stationsLegend}</span>
          </div>
          <div className="legend-row legend-static">
            <span className="legend-mark mark-volcano" aria-hidden="true" />
            <span className="legend-copy">{t.volcanoesLegend}</span>
          </div>
          <div className="legend-row legend-static">
            <span className="legend-mark mark-border" aria-hidden="true" />
            <span className="legend-copy">{t.bordersLegend}</span>
          </div>
          <div className="legend-row legend-static">
            <span className="legend-mark mark-depth" aria-hidden="true" />
            <span className="legend-copy">{t.depthLegend}</span>
          </div>
        </div>
      )}
    </section>
  );
}

export function TimeControl({
  year,
  onChange,
  playing,
  onPlay,
  language,
  t,
}: {
  year: number;
  onChange: (year: number) => void;
  playing: boolean;
  onPlay: () => void;
  language: AtlasLanguage;
  t: AtlasText;
}) {
  const span = MAX_YEAR - MIN_YEAR;
  const place = (value: number) => ({ "--p": (value - MIN_YEAR) / span }) as CSSProperties;
  return (
    <section className="time-panel" aria-label={t.timeline}>
      <button
        type="button"
        className="icon-button play-button"
        aria-label={playing ? t.pause : t.play}
        onClick={onPlay}
      >
        {playing ? <Pause size={14} /> : <Play size={14} />}
      </button>
      <div className="time-track">
        <span className="time-year" style={place(year)} aria-hidden="true">
          {year}
        </span>
        <input
          aria-label={t.year}
          aria-valuetext={`${t.year} ${year}`}
          type="range"
          min={MIN_YEAR}
          max={MAX_YEAR}
          step="1"
          value={year}
          onChange={(event) => onChange(Number(event.target.value))}
          className="year-slider"
        />
        {[1867, 1900, 1942, 1990, MAX_YEAR].map((tick) => (
          <span key={tick} className="time-tick" style={place(tick)} aria-hidden="true">
            <i />
            <b>{tick}</b>
          </span>
        ))}
      </div>
      <p className="time-era" aria-live="polite">
        {textForYear(year, language)}
      </p>
      <p className="time-caption">{t.closedYearCaption}</p>
    </section>
  );
}

export function ZoomControls({
  onZoomIn,
  onZoomOut,
  t,
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  t: AtlasText;
}) {
  return (
    <div className="zoom-controls" role="group">
      <button type="button" aria-label={t.zoomIn} title={t.zoomIn} onClick={onZoomIn}>
        +
      </button>
      <button type="button" aria-label={t.zoomOut} title={t.zoomOut} onClick={onZoomOut}>
        −
      </button>
    </div>
  );
}

export function CompassRose({
  bearing,
  onReset,
  t,
}: {
  bearing: number;
  onReset: () => void;
  t: AtlasText;
}) {
  return (
    <button
      className="compass-rose"
      type="button"
      aria-label={`${t.north} (${Math.round(bearing)}°)`}
      title={t.north}
      onClick={onReset}
    >
      <svg viewBox="0 0 48 48" aria-hidden="true" style={{ transform: `rotate(${-bearing}deg)` }}>
        <circle cx="24" cy="24" r="17" fill="none" stroke="currentColor" strokeWidth=".8" />
        <path
          d="M24 3 27 24 24 45 21 24Z M3 24 24 21 45 24 24 27Z"
          fill="none"
          stroke="currentColor"
          strokeWidth=".8"
          strokeLinejoin="round"
        />
        <path d="M24 3 27 24 21 24Z" fill="currentColor" />
      </svg>
    </button>
  );
}

export function AtlasTools({
  language,
  onLanguage,
  onAbout,
  query,
  results,
  onQuery,
  onSelect,
  t,
}: {
  language: AtlasLanguage;
  onLanguage: (language: AtlasLanguage) => void;
  onAbout: () => void;
  query: string;
  results: Array<{ name: string }>;
  onQuery: (value: string) => void;
  onSelect: (name: string) => void;
  t: AtlasText;
}) {
  const [searching, setSearching] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (searching) input.current?.focus();
  }, [searching]);
  const closeSearch = () => {
    setSearching(false);
    onQuery("");
  };
  return (
    <div className="atlas-tools">
      <div className="atlas-tool-row">
        <button
          type="button"
          className="icon-button"
          aria-label={t.language}
          title={language === "id" ? "ID · EN" : "EN · ID"}
          onClick={() => onLanguage(language === "id" ? "en" : "id")}
        >
          <Languages size={17} />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={t.search}
          title={t.search}
          aria-expanded={searching}
          onClick={() => (searching ? closeSearch() : setSearching(true))}
        >
          <Search size={17} />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={t.about}
          title={t.about}
          onClick={onAbout}
        >
          <Info size={17} />
        </button>
      </div>
      {searching && (
        <div
          className="atlas-search"
          onKeyDown={(event) => {
            if (event.key === "Escape") closeSearch();
          }}
        >
          <input
            ref={input}
            type="search"
            aria-label={t.search}
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder={t.search}
          />
          {query && results.length > 0 && (
            <ul className="search-results">
              {results.map((feature) => (
                <li key={feature.name}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(feature.name);
                      setSearching(false);
                    }}
                  >
                    {feature.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export type DataSource = {
  layer: string;
  name: string;
  license: string;
  url: string;
  note: string;
};

const OSM_COPYRIGHT_URL = "https://www.openstreetmap.org/copyright";

const formatDistance = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km} km`);

export function Footer({
  distanceKm,
  widthPx,
  t,
}: {
  distanceKm: number;
  widthPx: number;
  t: AtlasText;
}) {
  return (
    <footer className="atlas-footer">
      <span
        className="scale-mark"
        role="img"
        aria-label={`${t.scale}: ${formatDistance(distanceKm)}`}
      >
        <i style={{ width: `${widthPx}px` }} />
        <span>{formatDistance(distanceKm)}</span>
      </span>
      <span className="footer-attribution">
        <a href={OSM_COPYRIGHT_URL} target="_blank" rel="noreferrer">
          {t.osmCredit}
        </a>
      </span>
    </footer>
  );
}

export function AboutData({
  open,
  onClose,
  sources,
  showColonialNote,
  t,
}: {
  open: boolean;
  onClose: () => void;
  sources: DataSource[];
  showColonialNote: boolean;
  t: AtlasText;
}) {
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="data-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialog}
        tabIndex={-1}
        className="data-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="data-dialog-title"
      >
        <button type="button" className="dialog-close" onClick={onClose} aria-label={t.close}>
          ×
        </button>
        <span className="cartouche-kicker">SEA CROSSING LINE · ATLAS</span>
        <h2 id="data-dialog-title">{t.aboutTitle}</h2>
        <p>{t.aboutBody}</p>
        <ul className="about-stats">
          {t.aboutStats.map((stat) => (
            <li key={stat}>{stat}</li>
          ))}
        </ul>
        <h3>{t.aboutYearsTitle}</h3>
        <p>{t.aboutTimeline}</p>
        {showColonialNote && <p>{t.colonialProxyNote}</p>}
        <p>{t.landmarksNote}</p>
        <h3>{t.aboutBaseTitle}</h3>
        <p>{t.contextNote}</p>
        <p>{t.ornamentsNote}</p>
        <p>{t.caveat}</p>
        <h3>{t.sourcesTitle}</h3>
        <ul className="source-list">
          {sources.map((s) => (
            <li key={s.name}>
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.name}
              </a>{" "}
              · {s.license}
              <small>
                {s.layer} — {s.note}
              </small>
            </li>
          ))}
        </ul>
        <h3>{t.aboutCreditTitle}</h3>
        <p>
          <a href={OSM_COPYRIGHT_URL} target="_blank" rel="noreferrer">
            {t.osmCredit}
          </a>{" "}
          {t.creditRest}
        </p>
        <p>{t.licenses}</p>
      </section>
    </div>
  );
}

export function ErrorCartouche({ message, t }: { message: string; t: AtlasText }) {
  return (
    <section className="error-cartouche" role="alert">
      <span className="cartouche-kicker">SEA CROSSING LINE · DATA</span>
      <h2>{t.errorTitle}</h2>
      <p>{message}</p>
    </section>
  );
}
