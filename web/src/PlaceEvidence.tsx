import type { MunicipalDataStatus, Place } from "./types";
import "./place-evidence.css";

function evidenceDate(value: string | null | undefined) {
  if (!value || !Number.isFinite(Date.parse(value)))
    return "Źródło nie podaje daty";
  return new Date(value).toLocaleString("pl-PL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Warsaw",
  });
}

export function placeSourceLabel(place: Place) {
  return (
    place.provenance?.publisher ||
    (place.sourceLabel.includes("OpenStreetMap")
      ? "Mapa społecznościowa OpenStreetMap"
      : place.sourceLabel) ||
    "Źródło miejsca"
  );
}

export default function PlaceEvidence({
  place,
  municipalData,
}: {
  place: Place;
  municipalData?: MunicipalDataStatus | null;
}) {
  const provenance = place.provenance;
  const municipal = Boolean(place.municipalFacts || (place.municipalParkingFacts && !place.municipalParkingSource));
  const updated = provenance?.recordUpdatedAt ?? place.osmUpdatedAt;
  const fetched = provenance?.fetchedAt;
  const stale =
    municipal &&
    (municipalData?.stale ||
      provenance?.stale ||
      Boolean(fetched && Date.now() - Date.parse(fetched) > 48 * 3600_000));
  const failed =
    municipal &&
    (municipalData?.status === "error" || provenance?.syncStatus === "error");
  return (
    <section className="place-evidence" aria-label="Źródło i aktualność">
      <h2>Skąd to wiemy?</h2>
      {place.relatedSources?.map(source => (
        <div key={`${source.datasetId}:${source.recordId ?? source.recordUrl}`}>
          <p><a href={source.recordUrl} target="_blank" rel="noreferrer">{source.publisher}</a></p>
          <p>{source.attribution || source.publisher}. Pobrano: {evidenceDate(source.fetchedAt ?? source.importedAt)}. Zmiana źródła: {evidenceDate(source.recordUpdatedAt ?? source.sourceUpdatedAt)}.</p>
          <p><a href={source.termsUrl} target="_blank" rel="noreferrer">Warunki wykorzystania tego źródła</a></p>
          {(source.stale || source.syncStatus === "error") && <p className="place-evidence-warning" role="status">Nie potwierdzono aktualności tego źródła. Pokazujemy ostatni pobrany zapis.</p>}
        </div>
      ))}
      <a href={place.sourceUrl} target="_blank" rel="noreferrer">
        {placeSourceLabel(place)}
      </a>
      <p className="place-evidence-status">
        {place.verifiedAt
          ? `Sprawdzenie w terenie zapisano: ${evidenceDate(place.verifiedAt)}.`
          : "Informacje ze źródła. Nie potwierdziliśmy ich w terenie."}
      </p>
      {failed || stale ? (
        <p className="place-evidence-warning" role="status">
          {failed
            ? "Nie udało się odświeżyć danych miasta. Pokazujemy ostatni pobrany zapis."
            : "Dane miasta czekają na odświeżenie. Pokazujemy ostatni pobrany zapis."}
        </p>
      ) : null}
      <dl>
        <div>
          <dt>Zmiana wpisu w źródle</dt>
          <dd>{evidenceDate(updated)}</dd>
        </div>
        {fetched ? (
          <div>
            <dt>Pobrano do aplikacji</dt>
            <dd>{evidenceDate(fetched)}</dd>
          </div>
        ) : null}
        {provenance?.importedAt ? (
          <div>
            <dt>Wczytano do aplikacji</dt>
            <dd>{evidenceDate(provenance.importedAt)}</dd>
          </div>
        ) : null}
      </dl>
      <p className="place-evidence-note">
        Data zmiany wpisu nie oznacza daty sprawdzenia wszystkich udogodnień.
      </p>
      {provenance ? (
        <details>
          <summary>O zbiorze danych</summary>
          <dl>
            {provenance.snapshotAt ? (
              <div>
                <dt>Stan pobranej mapy</dt>
                <dd>{evidenceDate(provenance.snapshotAt)}</dd>
              </div>
            ) : null}
            {municipal ? (
              <div>
                <dt>Ostatnia zmiana całego zbioru</dt>
                <dd>{evidenceDate(provenance.sourceUpdatedAt)}</dd>
              </div>
            ) : null}
          </dl>
          {municipal ? (
            <p>
              Gmina Miejska Kraków,{" "}
              <a
                href="https://otwartedane.um.krakow.pl"
                target="_blank"
                rel="noreferrer"
              >
                Portal Otwarte Dane
              </a>
              . Źródło udostępnia daty zmian; nie podaje osobnej daty
              wytworzenia każdego pomiaru.
            </p>
          ) : null}
          <p>
            <a href={provenance.datasetUrl} target="_blank" rel="noreferrer">
              Zobacz zbiór
            </a>
            {" · "}
            <a href={provenance.termsUrl} target="_blank" rel="noreferrer">
              Warunki wykorzystania
            </a>
          </p>
        </details>
      ) : null}
    </section>
  );
}
