import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CITY_RADIUS_KM, type CityDetails } from "./atlas-city";
import { cityDisplayName, type CityFeature } from "./atlas-context";
import { countryNames, type AtlasLanguage, type AtlasText } from "./atlas-i18n";

export function CityPopup({
  city,
  details,
  year,
  language,
  onClose,
  onLine,
  t,
}: {
  city: CityFeature;
  details: CityDetails;
  year: number;
  language: AtlasLanguage;
  onClose: () => void;
  onLine: (name: string) => void;
  t: AtlasText;
}) {
  const { name, names, country, capital, pop } = city.properties;
  const shown = cityDisplayName(city, year);
  // Under the modern name, list what it was called before; under an older name, say what it is called now.
  const earlier = [...new Set((names ?? []).map(([, old]) => old))]
    .filter((old) => old !== name)
    .join(", ");
  const otherName = shown === name ? earlier : name;
  const locale = language === "id" ? "id-ID" : "en-US";
  const countryName = country
    ? ((countryNames[language] as Record<string, string>)[country] ?? country)
    : "—";
  return (
    <aside className="stamp-popup city-popup" aria-live="polite" aria-label={t.cityRecord}>
      <Button
        variant="ghost"
        size="icon"
        className="stamp-close"
        onClick={onClose}
        aria-label={t.close}
      >
        <X size={17} />
      </Button>
      <span className="stamp-eyebrow">
        {t.cityRecord} · {year}
      </span>
      <h2>{shown}</h2>
      {otherName && (
        <p className="city-other-name">
          {shown === name ? t.cityFormerly : t.cityToday} {otherName}
        </p>
      )}
      <div className="record-fields">
        <div>
          <small>{t.cityCountry}</small>
          <strong>
            {countryName}
            {capital ? ` · ${t.cityCapital}` : ""}
          </strong>
        </div>
        {typeof pop === "number" && pop > 0 && (
          <div>
            <small>{t.cityPopulation}</small>
            <strong>≈ {pop.toLocaleString(locale)}</strong>
          </div>
        )}
        <div>
          <small>
            {t.cityStations} {CITY_RADIUS_KM} km
          </small>
          <strong>{details.stations.toLocaleString(locale)}</strong>
        </div>
        <div>
          <small>{t.cityFirstLine}</small>
          <strong>{details.firstOpened ?? t.yearUnknown}</strong>
        </div>
      </div>
      <h3 className="city-lines-title">
        {t.cityLines} {CITY_RADIUS_KM} km
      </h3>
      {details.lines.length > 0 && (
        <ul className="city-lines">
          {details.lines.map((line) => (
            <li key={line.name}>
              <button type="button" onClick={() => onLine(line.name)}>
                {line.name}
              </button>
              <span>
                {line.opened ?? "?"}
                {line.closed ? `–${line.closed}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
      {details.lines.length === 0 && details.unnamedLines === 0 && (
        <p className="year-unknown-note">{t.cityNoLines}</p>
      )}
      {(details.moreLines > 0 || details.unnamedLines > 0) && (
        <p className="year-unknown-note">
          {details.moreLines > 0 ? `+${details.moreLines} ${t.cityMoreLines}` : ""}
          {details.moreLines > 0 && details.unnamedLines > 0 ? " · " : ""}
          {details.unnamedLines > 0 ? `${details.unnamedLines} ${t.cityUnnamedLines}` : ""}
        </p>
      )}
      <p className="year-unknown-note">{t.cityNote}</p>
    </aside>
  );
}
