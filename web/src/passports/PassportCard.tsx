import { useId } from "react";
import { ArrowUpRight, DoorOpen, Info, MapPin } from "lucide-react";
import {
  PASSPORT_CATEGORIES,
  PASSPORT_FIELD_DEFINITIONS,
  type PassportEvidence,
  type PassportFact,
  type PassportFieldKey,
  type PassportValue,
  type PlacePassport,
} from "../../../shared/place-passports.mjs";
import { passportDate, planningUrl, safeSourceUrl } from "./passport-api";
import type { Place } from "../types";
import "./passport.css";

const STATUSES: Record<PassportFact["status"], string> = {
  unknown: "Brak danych",
  "source-only": "Informacja ze źródła",
  unverified: "Dane dodane przez użytkownika",
  conflict: "Do sprawdzenia: sprzeczne informacje",
};

export function factValue(key: PassportFieldKey, value: PassportValue) {
  if (value === null || value === "") return "Nie wiadomo";
  const definition = PASSPORT_FIELD_DEFINITIONS.find(
    (field) => field.key === key,
  );
  if (definition?.type === "choice") {
    return value === "yes"
      ? "Tak"
      : value === "no"
        ? "Nie"
        : value === "limited"
          ? "Częściowo / warunkowo"
          : String(value);
  }
  return `${value}${definition?.unit ? ` ${definition.unit}` : ""}`;
}

function Evidence({
  evidence,
  fieldKey,
}: {
  evidence: PassportEvidence;
  fieldKey?: PassportFieldKey;
}) {
  const url = safeSourceUrl(evidence.source.url);
  const verification = evidence.siteVerification;
  const validVerification =
    verification && Date.parse(verification.expiresAt) > Date.now();
  return (
    <li className="passport-evidence-item">
      <strong>
        {fieldKey
          ? factValue(fieldKey, evidence.value)
          : String(evidence.value ?? "Nie podano")}
      </strong>
      <p>
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer">
            {evidence.source.label}
          </a>
        ) : (
          evidence.source.label
        )}
        {evidence.author ? <> · {evidence.author.displayName}</> : null}
      </p>
      <dl className="passport-evidence-dates">
        <div>
          <dt>Obserwacja lub pomiar</dt>
          <dd>{passportDate(evidence.observedAt)}</dd>
        </div>
        {evidence.publishedAt ? (
          <div>
            <dt>Dodano do Miasta w zasięgu</dt>
            <dd>{passportDate(evidence.publishedAt)}</dd>
          </div>
        ) : null}
        {evidence.recordUpdatedAt ? (
          <div>
            <dt>Zmiana wpisu w źródle</dt>
            <dd>{passportDate(evidence.recordUpdatedAt)}</dd>
          </div>
        ) : null}
      </dl>
      {verification ? (
        <p className="passport-verification">
          {validVerification
            ? "Potwierdzono kontrolę nad stroną:"
            : "Potwierdzenie kontroli nad stroną wygasło:"}{" "}
          <strong>{verification.host}</strong>. Sprawdzono{" "}
          {passportDate(verification.verifiedAt)}. To nie jest audyt
          dostępności.
        </p>
      ) : null}
    </li>
  );
}

function Facts({ fields }: { fields: Record<PassportFieldKey, PassportFact> }) {
  return (
    <dl className="passport-facts">
      {PASSPORT_FIELD_DEFINITIONS.map(({ key, label }) => {
        const fact = fields[key] ?? {
          value: null,
          status: "unknown",
          evidence: [],
        };
        return (
          <div
            className={`passport-fact passport-fact-${fact.status}`}
            key={key}
          >
            <dt>{label}</dt>
            <dd>
              <strong>
                {fact.status === "conflict"
                  ? "Sprzeczne informacje"
                  : factValue(key, fact.value)}
              </strong>
              <span className="passport-fact-status">
                {STATUSES[fact.status]}
              </span>
              {fact.status === "conflict" ? (
                <p className="passport-conflict-values">
                  W źródłach:{" "}
                  {Array.from(
                    new Set(
                      fact.evidence.map((item) => factValue(key, item.value)),
                    ),
                  ).join(" / ")}
                  . Sprawdź warunki przed wizytą.
                </p>
              ) : null}
              {fact.evidence.length > 0 ? (
                <details className="passport-evidence">
                  <summary>
                    Źródła i daty: {label.toLocaleLowerCase("pl")}
                  </summary>
                  <ul>
                    {fact.evidence.map((evidence, i) => (
                      <Evidence
                        evidence={evidence}
                        fieldKey={key}
                        key={`${evidence.id}-${i}`}
                      />
                    ))}
                  </ul>
                </details>
              ) : null}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

export default function PassportCard({
  passport,
  onPlan,
  preview = false,
  headingLevel = 2,
}: {
  passport: PlacePassport;
  onPlan?: (placeId: string, entranceId?: string) => void;
  preview?: boolean;
  headingLevel?: 1 | 2;
}) {
  const headingId = useId();
  const Heading = headingLevel === 1 ? "h1" : "h2";
  const url = safeSourceUrl(passport.place.website);
  const source = passport.sourcePlace as Place | null;
  const staleSource =
    source?.provenance?.stale ||
    ["error", "missing"].includes(source?.provenance?.syncStatus ?? "");
  function planLink(entranceId?: string) {
    const text = entranceId
      ? "Zaplanuj dojście do tego wejścia"
      : "Zaplanuj dojście";
    if (preview) return null;
    return onPlan ? (
      <button
        className="button primary passport-plan"
        type="button"
        onClick={() => onPlan(passport.placeId, entranceId)}
      >
        {text}
        <ArrowUpRight size={18} aria-hidden="true" />
      </button>
    ) : (
      <a
        className="button primary passport-plan"
        href={planningUrl(passport.placeId, entranceId)}
        target="_blank"
        rel="noopener noreferrer"
      >
        {text}
        <span className="sr-only"> w nowej karcie</span>
        <ArrowUpRight size={18} aria-hidden="true" />
      </a>
    );
  }
  return (
    <article
      className="passport-card"
      aria-labelledby={headingId}
      data-passport-revision={passport.revision}
    >
      <header className="passport-card-header">
        <p className="eyebrow">
          {preview ? "PRYWATNY PODGLĄD" : "PASZPORT MIEJSCA"} ·{" "}
          {PASSPORT_CATEGORIES.find(
            (category) => category.value === passport.place.category,
          )?.label ?? "Obiekt"}
        </p>
        <Heading id={headingId}>
          {passport.place.name || "Obiekt bez nazwy"}
        </Heading>
        <p className="passport-address">
          <MapPin size={18} aria-hidden="true" />
          {passport.place.address || "Adres nie został podany"}
        </p>
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer">
            Strona obiektu<span className="sr-only"> w nowej karcie</span>
          </a>
        ) : null}
      </header>
      <div className="passport-notice">
        <Info size={20} aria-hidden="true" />
        <p>
          {preview
            ? "To podgląd Twoich danych. Po publikacji pokażemy też pozostałe źródła i ewentualne sprzeczności."
            : "Sprawdź konkretne warunki względem swoich potrzeb. Brak danych nie oznacza braku bariery. Informacje nie są zapewnieniem dostępności."}
        </p>
      </div>
      {!preview ? (
        <p className="passport-caption">
          {passport.revision > 0
            ? `Opublikowana wersja ${passport.revision} · ${passportDate(passport.publishedAt)}`
            : "Dane źródłowe. Ten obiekt nie ma jeszcze opublikowanych uzupełnień."}
        </p>
      ) : null}
      {staleSource ? (
        <p className="passport-warning">
          Źródło nie zostało poprawnie odświeżone. Pokazujemy ostatnie dostępne
          informacje źródłowe; mogą być nieaktualne.
        </p>
      ) : null}
      {planLink()}
      <section className="passport-section" aria-label="Warunki w obiekcie">
        <h3>Warunki w obiekcie</h3>
        <Facts fields={passport.fields} />
      </section>
      <section className="passport-section" aria-label="Wejścia do obiektu">
        <h3>
          <DoorOpen size={20} aria-hidden="true" /> Wejścia
        </h3>
        {passport.entrances.length === 0 ? (
          <p className="passport-missing">
            Nie opisano jeszcze żadnego wejścia. Punkt obiektu może wskazywać
            środek budynku, a nie drzwi.
          </p>
        ) : null}
        {passport.entrances.map((entrance) => (
          <details className="passport-entrance" key={entrance.id}>
            <summary>{entrance.label || "Wejście bez nazwy"}</summary>
            <p className="passport-caption">
              {entrance.coordinates
                ? "Podano punkt wejścia. Trasa do tego punktu nie potwierdza warunków całego dojścia."
                : "Nie podano dokładnego położenia wejścia. Dojście do tych drzwi wymaga ustalenia ich położenia."}
            </p>
            {entrance.coordinates ? planLink(entrance.id) : null}
            <Facts fields={entrance.fields} />
          </details>
        ))}
      </section>
      {Object.values(passport.metadataEvidence ?? {}).some(
        (items) => items.length,
      ) ? (
        <details className="passport-evidence passport-metadata">
          <summary>Źródła opisu i położenia obiektu</summary>
          {Object.entries(passport.metadataEvidence).map(([key, values]) =>
            values.length ? (
              <section key={key}>
                <h3>
                  {(
                    {
                      name: "Nazwa",
                      address: "Adres",
                      coordinates: "Położenie",
                      website: "Strona internetowa",
                      category: "Kategoria",
                    } as Record<string, string>
                  )[key] ?? key}
                </h3>
                <ul>
                  {values.map((evidence, i) => (
                    <Evidence evidence={evidence} key={`${evidence.id}-${i}`} />
                  ))}
                </ul>
              </section>
            ) : null,
          )}
        </details>
      ) : null}
      {source ? (
        <details className="passport-evidence passport-source-context">
          <summary>Pochodzenie danych źródłowych</summary>
          <p>
            {source.provenance?.publisher ||
              source.sourceLabel ||
              "Dane źródłowe obiektu"}
          </p>
          <dl className="passport-evidence-dates">
            {source.provenance?.fetchedAt ? (
              <div>
                <dt>Pobrano ze źródła</dt>
                <dd>{passportDate(source.provenance.fetchedAt)}</dd>
              </div>
            ) : null}
            {source.provenance?.importedAt ? (
              <div>
                <dt>Wczytano do aplikacji</dt>
                <dd>{passportDate(source.provenance.importedAt)}</dd>
              </div>
            ) : null}
            {source.provenance?.snapshotAt ? (
              <div>
                <dt>Stan pobranej mapy</dt>
                <dd>{passportDate(source.provenance.snapshotAt)}</dd>
              </div>
            ) : null}
            <div>
              <dt>Zmiana wpisu w źródle</dt>
              <dd>
                {passportDate(
                  source.provenance?.recordUpdatedAt ?? source.osmUpdatedAt,
                )}
              </dd>
            </div>
          </dl>
          {safeSourceUrl(source.provenance?.datasetUrl ?? source.sourceUrl) ? (
            <p>
              <a
                href={safeSourceUrl(
                  source.provenance?.datasetUrl ?? source.sourceUrl,
                )!}
                target="_blank"
                rel="noopener noreferrer"
              >
                Zobacz źródło danych
              </a>
            </p>
          ) : null}
          {safeSourceUrl(source.provenance?.termsUrl) ? (
            <p>
              <a
                href={safeSourceUrl(source.provenance?.termsUrl)!}
                target="_blank"
                rel="noopener noreferrer"
              >
                Warunki wykorzystania danych
              </a>
            </p>
          ) : null}
        </details>
      ) : null}
      <p className="passport-caption">
        Data zmiany wpisu w źródle nie jest datą pomiaru ani audytu w terenie.
      </p>
    </article>
  );
}
