import { ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AtlasLanguage, AtlasText } from "./atlas-i18n";
import type { SelectedLine } from "./map-canvas";
import { length as turfLength } from "@turf/length";
import { lineString } from "@turf/helpers";

const stageLabels = {
  id: { rencana: "Rencana", proses: "Dalam proses", selesai: "Selesai" },
  en: { rencana: "Planned", proses: "In progress", selesai: "Complete" },
};

export function StampPopup({
  feature,
  language,
  onClose,
  t,
}: {
  feature: SelectedLine | null;
  language: AtlasLanguage;
  onClose: () => void;
  t: AtlasText;
}) {
  if (!feature) return null;
  const properties = feature.properties;
  const stage =
    typeof properties["stage"] === "string" && properties["stage"] in stageLabels[language]
      ? (properties["stage"] as keyof typeof stageLabels.id)
      : null;
  const sources = [
    ...new Set(
      ["source_url", "opened_year_source", "year_source", "closed_year_source"].map(
        (key) => properties[key],
      ),
    ),
  ].filter((value): value is string => typeof value === "string" && URL.canParse(value));
  const openedYear =
    properties["opened_year"] ?? properties["year_built"] ?? properties["source_year"];
  const lengthKm =
    typeof properties["length_km"] === "number"
      ? Number(properties["length_km"])
      : turfLength(lineString(feature.geometry.coordinates), { units: "kilometers" });
  const isDisused = properties["status"] === "disused" || properties["status"] === "abandoned";
  const closedKnown = typeof properties["closed_year"] === "number";
  const statusText =
    properties["status"] === "disused"
      ? t.statusDisused
      : properties["status"] === "abandoned"
        ? t.statusAbandoned
        : t.statusActive;
  return (
    <aside className="stamp-popup" aria-live="polite" aria-label={t.record}>
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
        {t.record} · {String(openedYear ?? t.yearUnknown)}
      </span>
      <h2>{String(properties["name"] ?? "Jalur kereta")}</h2>
      {stage && (
        <div className={`stage-label stage-${stage}`}>
          <i aria-hidden="true" />
          {stageLabels[language][stage]}
        </div>
      )}
      <div className="record-fields">
        <div>
          <small>{t["status"]}</small>
          <strong>{stage ? stageLabels[language][stage] : statusText}</strong>
        </div>
        <div>
          <small>{t["company"]}</small>
          <strong>{String(properties["company"] ?? properties["operator"] ?? "—")}</strong>
        </div>
        <div>
          <small>{t.built}</small>
          <strong>{openedYear === undefined ? t.yearUnknown : String(openedYear)}</strong>
        </div>
        {isDisused && (
          <div>
            <small>{t.closed}</small>
            <strong>{closedKnown ? String(properties["closed_year"]) : t.yearUnknown}</strong>
          </div>
        )}
        {!isDisused && closedKnown && (
          <div>
            <small>{t.closed}</small>
            <strong>{String(properties["closed_year"])}</strong>
          </div>
        )}
        <div>
          <small>{t.length}</small>
          <strong>≈ {lengthKm.toFixed(1)} km</strong>
        </div>
      </div>
      {isDisused && !closedKnown && <p className="year-unknown-note">{t.yearUnknownNote}</p>}
      {sources.map((url) => (
        <a key={url} href={url} target="_blank" rel="noreferrer">
          {t.source} · {new URL(url).hostname.replace(/^www\./, "")}
          <ExternalLink size={13} />
        </a>
      ))}
    </aside>
  );
}
