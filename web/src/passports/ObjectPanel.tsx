import { useEffect, useRef, useState } from "react";
import { Building2, ArrowRight, Search, Plus, FilePenLine } from "lucide-react";
import type {
  PassportDraft,
  PassportMine,
} from "../../../shared/place-passports.mjs";
import type { AccountState, Place } from "../types";
import { passportDate, passportRequest } from "./passport-api";
import ObjectEditor from "./ObjectEditor";
import "./passport.css";

interface ObjectPanelProps {
  session: AccountState;
  onRequireLogin: () => void;
  onPlan: (placeId: string, entranceId?: string) => void;
  initialPlaceId?: string;
}

function SignedInObjects({
  user,
  onPlan,
  initialPlaceId,
}: {
  user: NonNullable<AccountState["user"]>;
  onPlan: ObjectPanelProps["onPlan"];
  initialPlaceId?: string;
}) {
  const [mine, setMine] = useState<PassportMine>({ drafts: [], places: [] });
  const [query, setQuery] = useState("");
  const [searchedQuery, setSearchedQuery] = useState<string | null>(null);
  const [results, setResults] = useState<Place[]>([]);
  const [draft, setDraft] = useState<PassportDraft | null>(null);
  const [initialName, setInitialName] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [loadingMine, setLoadingMine] = useState(true);
  const [error, setError] = useState("");
  const [mineError, setMineError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const searchNumber = useRef(0);
  const mineNumber = useRef(0);
  const initialOpened = useRef<string | undefined>(undefined);

  async function refreshMine(signal = controller.current?.signal) {
    const number = ++mineNumber.current;
    setLoadingMine(true);
    try {
      const result = await passportRequest<PassportMine>(
        `/place-passports/mine?expectedUserId=${encodeURIComponent(user.id)}`,
        { signal },
      );
      if (!signal?.aborted && number === mineNumber.current) {
        setMine(result);
        setMineError("");
      }
    } catch (failure) {
      if (!signal?.aborted && number === mineNumber.current)
        setMineError((failure as Error).message);
    } finally {
      if (!signal?.aborted && number === mineNumber.current)
        setLoadingMine(false);
    }
  }
  useEffect(() => {
    const current = new AbortController();
    controller.current = current;
    void refreshMine(current.signal);
    return () => {
      current.abort();
      initialOpened.current = undefined;
    };
  }, [user.id]);

  async function open(placeId?: string, existingDraftId?: string) {
    setBusy(true);
    setError("");
    const signal = controller.current?.signal;
    try {
      const result = existingDraftId
        ? await passportRequest<PassportDraft>(
            `/place-passports/drafts/${encodeURIComponent(existingDraftId)}?expectedUserId=${encodeURIComponent(user.id)}`,
            { signal },
          )
        : await passportRequest<PassportDraft>("/place-passports/drafts", {
            body: { ...(placeId ? { placeId } : {}), expectedUserId: user.id },
            signal,
          });
      if (signal?.aborted) return;
      setInitialName(placeId || existingDraftId ? undefined : query.trim());
      setDraft(result);
    } catch (failure) {
      if (!signal?.aborted) setError((failure as Error).message);
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  }
  useEffect(() => {
    if (initialPlaceId && initialOpened.current !== initialPlaceId) {
      initialOpened.current = initialPlaceId;
      void open(initialPlaceId);
    }
  }, [initialPlaceId]);

  async function search() {
    const term = query.trim();
    if (term.length < 2) {
      setError("Wpisz co najmniej 2 znaki nazwy lub adresu.");
      return;
    }
    const number = ++searchNumber.current;
    setBusy(true);
    setError("");
    setSearchedQuery(null);
    const signal = controller.current?.signal;
    try {
      const result = await passportRequest<{ places: Place[] }>(
        `/places?q=${encodeURIComponent(term)}&limit=12`,
        { public: true, signal },
      );
      if (!signal?.aborted && number === searchNumber.current) {
        setResults(result.places);
        setSearchedQuery(term);
      }
    } catch (failure) {
      if (!signal?.aborted && number === searchNumber.current)
        setError((failure as Error).message);
    } finally {
      if (!signal?.aborted && number === searchNumber.current) setBusy(false);
    }
  }

  if (draft)
    return (
      <ObjectEditor
        key={draft.id}
        draft={draft}
        initialName={initialName}
        user={user}
        onPlan={onPlan}
        onChanged={() => void refreshMine()}
        onBack={() => {
          setDraft(null);
          void refreshMine();
        }}
      />
    );

  const currentResults = searchedQuery === query.trim();
  return (
    <>
      <p className="eyebrow">INFORMACJE, KTÓRE POMAGAJĄ NA MIEJSCU</p>
      <h1 id="object-panel-heading">Obiekty</h1>
      <p>
        Opisz swój obiekt lub uzupełnij miejsce, które znasz. Po publikacji
        informacje pojawią się w aplikacji Miasto w zasięgu i w widgecie na stronie obiektu.
      </p>
      <section className="passport-search" aria-label="Znajdź obiekt do edycji">
        <h2>Najpierw sprawdź, czy obiekt już tu jest</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void search();
          }}
        >
          <label htmlFor="passport-search-query">Nazwa lub adres obiektu</label>
          <div className="passport-search-row">
            <input
              id="passport-search-query"
              type="search"
              value={query}
              maxLength={150}
              minLength={2}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Wpisz nazwę muzeum, hotelu, restauracji…"
            />
            <button type="submit" className="button primary" disabled={busy}>
              <Search size={18} aria-hidden="true" /> Szukaj
            </button>
          </div>
        </form>
        {error ? (
          <p className="passport-warning" role="alert">
            {error}
          </p>
        ) : null}
        {busy ? <p role="status">Pobieramy dane…</p> : null}
        {currentResults ? (
          <div className="passport-search-results">
            <p role="status">
              {results.length
                ? `Znaleziono: ${results.length}. Wybierz istniejący obiekt, jeśli pasuje.`
                : "Nie znaleźliśmy pasującego obiektu."}
            </p>
            <ul>
              {results.map((place) => (
                <li key={place.id}>
                  <button
                    className="passport-object-choice"
                    type="button"
                    disabled={busy}
                    onClick={() => open(place.id)}
                  >
                    <Building2 size={21} aria-hidden="true" />
                    <span>
                      <strong>{place.name}</strong>
                      <small>
                        {place.address || "Adres nie został podany"}
                      </small>
                    </span>
                    <ArrowRight size={19} aria-hidden="true" />
                    <span className="sr-only">Otwórz dane obiektu</span>
                  </button>
                </li>
              ))}
            </ul>
            <button
              className="button secondary"
              type="button"
              disabled={busy}
              onClick={() => open()}
            >
              <Plus size={18} aria-hidden="true" /> To inny obiekt. Dodaj nowy
            </button>
          </div>
        ) : null}
      </section>
      <section className="passport-owned" aria-label="Twoje prywatne szkice">
        <h2>
          <FilePenLine size={21} aria-hidden="true" /> Twoje szkice
        </h2>
        <p className="passport-caption">
          Szkice widzisz tylko Ty. Dopiero przycisk Opublikuj udostępnia
          informacje.
        </p>
        {loadingMine ? <p role="status">Pobieramy szkice…</p> : null}
        {mineError ? (
          <div className="passport-warning" role="alert">
            <p>{mineError}</p>
            <button
              className="button secondary"
              type="button"
              onClick={() => void refreshMine()}
            >
              Odśwież szkice
            </button>
          </div>
        ) : null}
        {!loadingMine && !mineError && mine.drafts.length === 0 ? (
          <p>Nie masz jeszcze żadnego szkicu. Wyszukaj obiekt powyżej.</p>
        ) : null}
        <ul>
          {mine.drafts.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="passport-object-choice"
                disabled={busy}
                onClick={() => open(undefined, item.id)}
              >
                <span>
                  <strong>
                    {item.content.place.name || "Nowy obiekt bez nazwy"}
                  </strong>
                  <small>
                    Zapisano {passportDate(item.updatedAt)} · prywatny szkic
                  </small>
                </span>
                <ArrowRight size={19} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </section>
      {mine.places.length > 0 ? (
        <section
          className="passport-owned"
          aria-label="Obiekty z Twoimi publikacjami"
        >
          <h2>Twoje publikacje</h2>
          <ul>
            {mine.places.map((place) => (
              <li key={place.placeId}>
                <button
                  type="button"
                  className="passport-object-choice"
                  disabled={busy}
                  onClick={() => open(place.placeId)}
                >
                  <span>
                    <strong>{place.name}</strong>
                    <small>
                      Opublikowana wersja {place.revision} ·{" "}
                      {passportDate(place.publishedAt)}
                    </small>
                  </span>
                  <ArrowRight size={19} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

export default function ObjectPanel({
  session,
  onRequireLogin,
  onPlan,
  initialPlaceId,
}: ObjectPanelProps) {
  return (
    <div className="panel-body passport-panel">
      {session.user ? (
        <SignedInObjects
          key={session.user.id}
          user={session.user}
          onPlan={onPlan}
          initialPlaceId={initialPlaceId}
        />
      ) : (
        <>
          <p className="eyebrow">WSPÓLNA WIEDZA O MIEJSCACH</p>
          <h1 id="object-panel-heading">Obiekty</h1>
          <p>
            Dodaj warunki wejścia, pomiary i udogodnienia. Możesz opisać własny
            obiekt albo uzupełnić miejsce, które znasz.
          </p>
          <div className="passport-notice">
            <Building2 size={26} aria-hidden="true" />
            <p>
              Zaloguj się, aby zachować prywatny szkic, sprawdzić podgląd i
              opublikować dane. Potwierdzenie strony obiektu jest opcjonalne.
            </p>
          </div>
          <button
            type="button"
            className="button primary"
            onClick={onRequireLogin}
          >
            Zaloguj się, aby dodać dane
          </button>
          <p className="passport-caption">
            Opublikowane dane i widget można czytać bez konta.
          </p>
        </>
      )}
    </div>
  );
}
