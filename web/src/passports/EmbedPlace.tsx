import PassportCard from "./PassportCard";
import { passportDate } from "./passport-api";
import { usePassport } from "./usePassport";
import "./passport.css";

export default function EmbedPlace({ placeId }: { placeId: string }) {
  const { passport, loading, error, receivedAt, refresh } =
    usePassport(placeId);
  return (
    <main className="passport-embed" id="passport-content">
      <header className="passport-embed-brand">
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Miasto w zasięgu, otwórz w nowej karcie"
        >
          ↗ Miasto w zasięgu
        </a>
        <span>Warunki dostępności</span>
      </header>
      {loading && !passport ? (
        <p role="status">Pobieramy paszport miejsca…</p>
      ) : null}
      {error ? (
        <div className="passport-warning" role="status">
          <p>
            {error}{" "}
            {passport
              ? `Ostatnie pobranie: ${passportDate(receivedAt)}. Pokazane informacje mogą być nieaktualne.`
              : "Dane obiektu są teraz niedostępne."}
          </p>
          <button
            className="button secondary"
            type="button"
            disabled={loading}
            onClick={refresh}
          >
            Spróbuj ponownie
          </button>
        </div>
      ) : null}
      {passport ? <PassportCard passport={passport} headingLevel={1} /> : null}
      <footer className="passport-embed-footer">
        <p>
          Informacje aktualizują się z danych opublikowanych w aplikacji Miasto w zasięgu.
          Sprawdzamy nową wersję co minutę.
        </p>
        {passport ? (
          <a
            href={`/app?objects=${encodeURIComponent(placeId)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Uzupełnij lub popraw informacje
            <span className="sr-only"> w nowej karcie</span>
          </a>
        ) : null}
      </footer>
    </main>
  );
}
