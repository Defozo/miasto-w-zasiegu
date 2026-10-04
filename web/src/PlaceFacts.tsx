import type { Place } from "./types";
import { formatOpeningHours } from "../../shared/opening-hours.mjs";
import "./place-facts.css";

const ACCESS: Record<string, string> = {
  customers: "Tylko dla klientów. Sprawdź warunki korzystania.",
  private: "Miejsce prywatne. Nie zakładaj możliwości wejścia.",
  no: "Źródło podaje zakaz dostępu.",
  permit: "Wymagane zezwolenie na korzystanie.",
  residents: "Tylko dla mieszkańców.",
  members: "Tylko dla członków.",
  destination: "Dostęp dla osób, których celem jest to miejsce.",
  delivery: "Dostęp dla dostaw.",
  yes: "Według mapy: dostęp publiczny.",
  public: "Według mapy: dostęp publiczny.",
  permissive: "Właściciel dopuszcza korzystanie. Sprawdź obowiązujące warunki.",
  designated: "Miejsce przeznaczone do tego rodzaju korzystania według mapy.",
};
const normalize = (value: string | null | undefined) =>
  value?.trim().toLowerCase() ?? "";

function feeLabel(value: string | null | undefined) {
  switch (normalize(value)) {
    case "yes":
      return "Według źródła: płatne.";
    case "no":
      return "Według źródła: bezpłatne.";
    case "donation":
      return "Według źródła: dobrowolna opłata.";
    case "":
      return "Brak danych o opłatach.";
    default:
      return `Opłaty podane w źródle: ${value?.trim()}.`;
  }
}

export default function PlaceFacts({ place }: { place: Place }) {
  const access = normalize(place.accessRestriction);
  const restricted =
    Boolean(access) &&
    !["yes", "public", "permissive", "designated"].includes(access);
  const accessLabel = !access
    ? "Brak danych o zasadach dostępu."
    : (ACCESS[access] ??
      `Warunki dostępu podane w źródle: ${place.accessRestriction?.trim()}. Sprawdź je przed wejściem.`);
  return (
    <section className="place-facts" aria-label="Zasady korzystania">
      <h2>Zasady korzystania</h2>
      {place.municipalParkingFacts && (
        <>
          <h3>Parking według danych miasta</h3>
          <dl>
            <div><dt>Liczba miejsc</dt><dd>{place.municipalParkingFacts.capacity ?? "Brak danych"}</dd></div>
            <div><dt>Miejsca dla osób z niepełnosprawnościami</dt><dd>{place.municipalParkingFacts.disabledSpaces ?? "Brak danych"}</dd></div>
            <div><dt>Miejsca dla aut elektrycznych</dt><dd>{place.municipalParkingFacts.electricSpaces ?? "Brak danych"}</dd></div>
            <div><dt>Doba parkingowa</dt><dd>{place.municipalParkingFacts.operatingHours ?? "Brak danych"}</dd></div>
          </dl>
          <p className="place-facts-note">To liczba miejsc w ewidencji, a nie liczba wolnych miejsc. Nie potwierdza dostępnego przejścia przez parking.</p>
          {place.dataConflicts?.map(conflict => (
            <p key={conflict.field} className="place-facts-restricted">
              Rozbieżność źródeł ({conflict.field === "capacity" ? "liczba miejsc" : "miejsca dla osób z niepełnosprawnościami"}): OpenStreetMap podaje {conflict.osm}, miasto {conflict.municipal}.
            </p>
          ))}
        </>
      )}
      {place.municipalFacts ? (
        <>
          <h3>Przystanek według danych miasta</h3>
          <dl>
            <div>
              <dt>Numer stanowiska</dt>
              <dd>{place.municipalFacts.stopCode || "Brak danych"}</dd>
            </div>
            <div>
              <dt>Rodzaj przystanku</dt>
              <dd>{place.municipalFacts.stopType || "Brak danych"}</dd>
            </div>
            <div>
              <dt>Nawierzchnia peronu</dt>
              <dd>{place.municipalFacts.platformSurface || "Brak danych"}</dd>
            </div>
            <div>
              <dt>Rodzaj krawężnika</dt>
              <dd>{place.municipalFacts.kerbType || "Brak danych"}</dd>
            </div>
            <div>
              <dt>Ławki poza wiatą</dt>
              <dd>
                {place.municipalFacts.benchesOutsideShelter ?? "Brak danych"}
              </dd>
            </div>
            <div>
              <dt>Wiaty</dt>
              <dd>{place.municipalFacts.shelters ?? "Brak danych"}</dd>
            </div>
          </dl>
          <p className="place-facts-note">
            Rodzaj krawężnika nie podaje jego wysokości. Te dane nie
            potwierdzają dostępnego dojścia ani wjazdu do autobusu lub tramwaju.
            Ławki należą do przystanku; nie znamy ich dokładnego położenia.
          </p>
        </>
      ) : null}
      <dl>
        <div className={restricted ? "place-facts-restricted" : undefined}>
          <dt>Dostęp do miejsca</dt>
          <dd>{restricted ? <strong>{accessLabel}</strong> : accessLabel}</dd>
        </div>
        <div>
          <dt>Godziny według źródła</dt>
          <dd>
            {formatOpeningHours(place.openingHours) ??
              "Brak danych o godzinach."}
          </dd>
        </div>
        <div>
          <dt>Opłaty</dt>
          <dd>{feeLabel(place.fee)}</dd>
        </div>
      </dl>
      {place.openingHours?.trim() ? (
        <p className="place-facts-note">
          Te godziny nie potwierdzają, że miejsce jest teraz otwarte.
        </p>
      ) : null}
      {place.coordinateKind === "representative-center" ? (
        <p className="place-facts-position">
          Punkt orientacyjny obszaru lub budynku. Nie wskazuje sprawdzonego
          wejścia.
        </p>
      ) : null}
    </section>
  );
}
