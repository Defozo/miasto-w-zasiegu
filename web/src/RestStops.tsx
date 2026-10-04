import {
  Armchair,
  Accessibility,
  Plus,
  ExternalLink,
  Leaf,
  MapPin,
} from "lucide-react";
import { dateLabel, metres } from "./api";
import { alreadyOnJourney } from "./journey-stops";
import type { LocationPoint, StopSuggestion } from "./types";
import "./rest-stops.css";

export default function RestStops({
  suggestions,
  start,
  end,
  via,
  onAdd,
  online,
  onMap,
}: {
  suggestions: StopSuggestion[];
  start: LocationPoint | null;
  end: LocationPoint | null;
  via: (LocationPoint | null)[];
  onAdd: (point: LocationPoint) => void;
  online: boolean;
  onMap: (point: LocationPoint) => void;
}) {
  const current = suggestions.filter(
    (stop) => !stop.validUntil || Date.parse(stop.validUntil) > Date.now(),
  );
  return (
    <details className="rest-stops">
      <summary>
        <Armchair size={22} aria-hidden="true" />
        <span>
          <strong>Przerwa po drodze</strong>
          <small>Miejsce na oddech lub toaletę</small>
        </span>
        <span className="rest-count">{current.length}</span>
      </summary>
      <div className="rest-stops-body">
        <p>
          Dodaj wybrane miejsce przed celem i przelicz trasę. Początek, cel i
          wcześniejsze przystanki pozostaną na swoim miejscu.
        </p>
        <p className="field-help">
          Odległość w linii prostej od planowanej drogi nie określa długości
          dojścia. Dostępność i godziny mogą wymagać sprawdzenia.
        </p>
        {current.length === 0 && (
          <p>
            Nie mamy teraz propozycji blisko tej trasy. Możesz dodać własny
            przystanek w polach adresów.
          </p>
        )}
        {!online && (
          <p role="status">
            Połącz się z internetem, aby dodać przystanek i obliczyć nową drogę.
          </p>
        )}
        {via.length >= 5 && (
          <p role="status">
            Masz już 5 przystanków. Usuń jeden w polach adresów, aby dodać inny.
          </p>
        )}
        <ul className="rest-stop-list">
          {current.map((stop) => {
            const present = alreadyOnJourney(stop.point, [start, ...via, end]);
            const Icon =
              stop.kind === "toilet"
                ? Accessibility
                : stop.kind === "bench"
                  ? Armchair
                  : Leaf;
            return (
              <li key={stop.id} className="rest-stop-card">
                <div className="rest-stop-heading">
                  <Icon size={21} aria-hidden="true" />
                  <h3>{stop.point.label}</h3>
                </div>
                <p className="rest-distance">
                  Około {metres(stop.distanceFromRouteMeters)} w linii prostej
                  od trasy
                </p>
                {stop.details.length > 0 && (
                  <p className="rest-details">{stop.details.join(" · ")}</p>
                )}
                {stop.restrictions?.length > 0 && (
                  <p className="rest-caution">{stop.restrictions.join(" ")}</p>
                )}
                <details className="rest-source">
                  <summary>Co wiemy o miejscu</summary>
                  {stop.warnings.length > 0 && (
                    <ul>
                      {stop.warnings.map((warning, index) => (
                        <li key={index}>{warning}</li>
                      ))}
                    </ul>
                  )}
                  <p>{stop.sourceLabel}</p>
                  {stop.observedAt && (
                    <p>Obserwacja: {dateLabel(stop.observedAt)}</p>
                  )}
                  {stop.validUntil && (
                    <p>
                      Do ponownego sprawdzenia: {dateLabel(stop.validUntil)}
                    </p>
                  )}
                  {!stop.observedAt && stop.dataUpdatedAt && (
                    <p>
                      Dane mapy: {dateLabel(stop.dataUpdatedAt)}. Data wpisu nie
                      potwierdza obecnych warunków.
                    </p>
                  )}
                  {stop.sourceUrl && (
                    <a href={stop.sourceUrl} target="_blank" rel="noreferrer">
                      Zobacz wpis źródłowy <ExternalLink size={13} />
                    </a>
                  )}
                </details>
                <button
                  type="button"
                  className="text-button rest-preview-button"
                  onClick={() => onMap(stop.point)}
                >
                  <MapPin size={16} /> Pokaż miejsce na mapie
                </button>
                <button
                  type="button"
                  className="button secondary full"
                  disabled={!online || present || via.length >= 5}
                  onClick={() => {
                    if (
                      !stop.validUntil ||
                      Date.parse(stop.validUntil) > Date.now()
                    )
                      onAdd(stop.point);
                  }}
                >
                  <Plus size={17} />
                  {present ? "Już w Twoim planie" : "Dodaj jako przystanek"}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </details>
  );
}
