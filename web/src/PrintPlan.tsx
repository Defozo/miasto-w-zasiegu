import { useId, useState } from "react";
import { isNativeApp, nativeRequest } from "./native";
import { createPortal } from "react-dom";
import { Printer } from "lucide-react";
import { metres } from "./api";
import type { Coordinates, LocationPoint, Profile, Route } from "./types";
import "./print-plan.css";

interface Props {
  route: Route;
  start: LocationPoint | null;
  end: LocationPoint | null;
  via: (LocationPoint | null)[];
  profile: Profile;
  viewingSaved: boolean;
}

const mobilityNames: Record<Profile["mobility"], string> = {
  manual: "Wózek ręczny",
  power: "Wózek elektryczny",
  stroller: "Wózek dziecięcy",
  walking: "Pieszo / balkonik",
};

function distance(value: number) {
  return Number.isFinite(value) && value >= 0 ? metres(value) : "brak danych";
}

function measurement(value: string, unit: string) {
  return value.trim() ? `${value.replace(".", ",")} ${unit}` : "nie podano";
}

function Point({
  letter,
  title,
  point,
  fallback,
}: {
  letter: string;
  title: string;
  point: LocationPoint | null;
  fallback?: Coordinates;
}) {
  const coordinates = point?.coordinates ?? fallback;
  return (
    <li className="print-plan-point">
      <span className="print-plan-letter" aria-hidden="true">
        {letter}
      </span>
      <div>
        <h3>{title}</h3>
        <p>{point?.label || "Punkt na mapie, bez zapisanego adresu"}</p>
        {!point?.label && coordinates && (
          <p className="print-plan-point-detail">
            Współrzędne: {coordinates[1].toFixed(5)},{" "}
            {coordinates[0].toFixed(5)}
          </p>
        )}
        {point?.precision === "approximate" && (
          <p className="print-plan-point-detail">
            Przybliżone położenie. Punkt nie potwierdza miejsca wejścia.
          </p>
        )}
      </div>
    </li>
  );
}

export default function PrintPlan({
  route,
  start,
  end,
  via,
  profile,
  viewingSaved,
}: Props) {
  const hintId = useId();
  const [printError, setPrintError] = useState("");
  const titleId = useId();
  const computed = route.source.computedAt;
  const computedAt =
    typeof computed === "string" && Number.isFinite(Date.parse(computed))
      ? new Date(computed)
      : null;
  const duration =
    Number.isFinite(route.durationS) && route.durationS >= 0
      ? `około ${Math.max(1, Math.round(route.durationS / 60))} min`
      : "brak danych";
  const printed = (
    <article className="print-plan-document" aria-labelledby={titleId}>
      <header className="print-plan-header">
        <p className="print-plan-brand">Miasto w zasięgu · Kraków bez barier</p>
        <h1 id={titleId}>Plan na drogę</h1>
        <p>Adresy i instrukcje do zabrania ze sobą.</p>
        <dl className="print-plan-summary">
          <div>
            <dt>Długość trasy</dt>
            <dd>{distance(route.distanceM)}</dd>
          </div>
          <div>
            <dt>Szacowany czas</dt>
            <dd>{duration}</dd>
          </div>
        </dl>
        <p className="print-plan-date">
          {computedAt ? (
            <>
              Trasa obliczona:{" "}
              <time dateTime={computedAt.toISOString()}>
                {computedAt.toLocaleString("pl-PL", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Europe/Warsaw",
                })}
              </time>{" "}
              (czas Krakowa).
            </>
          ) : (
            "Data obliczenia trasy jest nieznana."
          )}
        </p>
        {viewingSaved && (
          <p className="print-plan-saved">
            Kopia zapisanego planu. Trasa nie została ponownie przeliczona;
            pokazujemy potrzeby zapisane razem z nią.
          </p>
        )}
      </header>

      <section className="print-plan-caution" aria-label="Ważne przed drogą">
        <h2>Sprawdź warunki na swojej drodze</h2>
        <p>
          Plan uwzględnia znane bariery i wybrane potrzeby. Nie wszędzie mamy
          aktualne pomiary. Przejezdność całej trasy nie jest potwierdzona, a
          warunki mogą się zmienić.
        </p>
        <p>
          Wydruk jest zapasem do przeglądania. Nie pokazuje Twojej pozycji GPS
          ani bieżących zmian. Zatrzymaj się w bezpiecznym miejscu, aby
          sprawdzić instrukcje.
        </p>
      </section>

      <section aria-label="Adresy i przystanki">
        <h2>Od startu do celu</h2>
        <ol className="print-plan-points">
          <Point
            letter="A"
            title="Start"
            point={start}
            fallback={route.geometry.coordinates[0]}
          />
          {via.map((point, index) => (
            <Point
              key={index}
              letter={String(index + 1)}
              title={`Przystanek ${index + 1}`}
              point={point}
            />
          ))}
          <Point
            letter="B"
            title="Cel"
            point={end}
            fallback={route.geometry.coordinates.at(-1)}
          />
        </ol>
      </section>

      <section
        className="print-plan-profile"
        aria-label="Potrzeby użyte w planie"
      >
        <h2>Potrzeby użyte w planie</h2>
        <dl>
          <div>
            <dt>Sposób poruszania się</dt>
            <dd>{mobilityNames[profile.mobility]}</dd>
          </div>
          <div>
            <dt>Szerokość z wystającymi elementami</dt>
            <dd>{measurement(profile.widthCm, "cm")}</dd>
          </div>
          <div>
            <dt>Maksymalny podjazd</dt>
            <dd>{measurement(profile.maxIncline, "%")}</dd>
          </div>
          <div>
            <dt>Maksymalny krawężnik</dt>
            <dd>{measurement(profile.maxKerbCm, "cm")}</dd>
          </div>
          <div>
            <dt>Unikanie nieutwardzonej nawierzchni</dt>
            <dd>{profile.avoidUnpaved ? "tak" : "nie"}</dd>
          </div>
        </dl>
        <p>To wybrane ustawienia, nie potwierdzone pomiary całej drogi.</p>
      </section>

      <section aria-label="Instrukcje trasy">
        <h2>Krok po kroku</h2>
        {route.steps.length ? (
          <ol className="print-plan-steps">
            {route.steps.map((step, index) => (
              <li key={index}>
                <span className="print-plan-step-number" aria-hidden="true">
                  {index + 1}
                </span>
                <div>
                  <p>{step.instruction}</p>
                  <p className="print-plan-step-distance">
                    Odcinek: {distance(step.distanceM)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p>Ten plan nie zawiera szczegółowych instrukcji.</p>
        )}
      </section>

      {route.warnings.length > 0 && (
        <section aria-label="Informacje i braki danych">
          <h2>Co wiemy, a czego brakuje</h2>
          <ul className="print-plan-warnings">
            {route.warnings.map((warning, index) => (
              <li key={index}>
                {warning
                  .replaceAll("OSM", "mapie społecznościowej")
                  .replaceAll("ORS", "silnik tras")}
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="print-plan-footer">
        <p>
          Dane mapy: © autorzy OpenStreetMap.
          {route.source.engine === "openrouteservice" &&
            " Obliczenia trasy: openrouteservice."}
        </p>
        <p>Ta kopia zawiera adresy i potrzeby wybrane dla trasy.</p>
      </footer>
    </article>
  );
  return (
    <>
      <div className="print-plan-control">
        <button
          type="button"
          className="button secondary"
          aria-describedby={hintId}
          onClick={() => {
            setPrintError("");
            if (isNativeApp()) void nativeRequest('document.print').catch(e => setPrintError((e as Error).message));
            else window.print();
          }}
        >
          <Printer size={17} aria-hidden="true" />
          Wydrukuj plan
        </button>
        <small id={hintId}>Papier lub PDF, z adresami i potrzebami.</small>
        {printError && <p className="error-box" role="alert">{printError}</p>}
      </div>
      {createPortal(printed, document.body)}
    </>
  );
}
