import {
  ArrowDownUp,
  ArrowRight,
  Bookmark,
  ChevronRight,
  Flag,
  LocateFixed,
  MapPin,
  Plus,
  Route as RouteIcon,
  ShieldQuestion,
  SlidersHorizontal,
  Trash2,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import AddressInput from "./AddressInput";
import { useRef, useState } from "react";
import SavedPlaces, { type FavoritesProps } from "./SavedPlaces";
import SavedPlan, { planAge } from "./SavedPlan";
import RestStops from "./RestStops";
import RouteEvidence from "./RouteEvidence";
import RouteSteps from "./RouteSteps";
import type { RouteFact } from "./types";
import PrintPlan from "./PrintPlan";
import { ApiRequestError, metres } from "./api";
import type { LocationPoint, Profile, Route, SavedRoute } from "./types";
interface Props {
  onFocusEvidence?: (fact: RouteFact) => void;
  modeControls?: React.ReactNode;
  guidanceControls?: React.ReactNode;
  start: LocationPoint | null;
  end: LocationPoint | null;
  via: (LocationPoint | null)[];
  setStart: (p: LocationPoint | null) => void;
  setEnd: (p: LocationPoint | null) => void;
  setVia: (p: (LocationPoint | null)[]) => void;
  route: Route | null;
  profile: Profile;
  busy: boolean;
  online: boolean;
  error: Error | null;
  avoidReports: boolean;
  setAvoidReports: (v: boolean) => void;
  onPlan: () => void;
  onLocate: () => void;
  gpsBusy: boolean;
  onProfile: () => void;
  onSave: (deviceAccess: boolean) => void;
  onRestore: () => void;
  onDeleteSaved: () => void;
  saved: SavedRoute | null;
  hiddenPlan: "account" | "legacy" | null;
  onAccount: () => void;
  viewingSaved: boolean;
  onMap: () => void;
  onReport: () => void;
  onboarding: string;
  onOnboarding: (choice: string) => void;
  favorites: FavoritesProps;
  userId: string | null;
  onAddStop: (point: LocationPoint) => void;
  routeNotice: string;
  profilePending: boolean;
  onPreviewStop: (point: LocationPoint) => void;
}
export default function RoutePanel(p: Props) {
  const destinationField = useRef<HTMLDivElement>(null);
  const noJourney = p.error instanceof ApiRequestError && p.error.code === "NO_JOURNEY";
  const diagnosis = noJourney && p.error instanceof ApiRequestError && typeof p.error.details?.checkedParkings === "number" ? p.error : null;
  const [deviceAccess, setDeviceAccess] = useState(false);
  const [slotKeys, setSlotKeys] = useState(() =>
    p.via.map(() => crypto.randomUUID()),
  );
  let keys = slotKeys;
  if (slotKeys.length !== p.via.length) {
    keys = p.via.map((_, i) => slotKeys[i] || crypto.randomUUID());
    setSlotKeys(keys);
  }
  const [editingPlace, setEditingPlace] = useState<{
    point: LocationPoint | null;
  } | null>(null);
  const ready = Boolean(p.start && p.end && p.via.every(Boolean));
  const planningStatus = p.busy
    ? "Szukamy przejścia."
    : p.route && ready && !p.error
      ? `${p.viewingSaved ? "Otworzono zapisany plan" : "Trasa gotowa"}. Długość ${metres(p.route.distanceM)}. Szacowany czas około ${Math.max(1, Math.round(p.route.durationS / 60))} min. Przejezdność nie jest potwierdzona na całej długości.`
      : "";
  const endMove = (index: number, by: number) => {
    const a = [...p.via];
    [a[index], a[index + by]] = [a[index + by], a[index]];
    const nextKeys = [...keys];
    [nextKeys[index], nextKeys[index + by]] = [
      nextKeys[index + by],
      nextKeys[index],
    ];
    setSlotKeys(nextKeys);
    p.setVia(a);
  };
  return (
    <div className="route-panel panel-body">
      <h1>Dokąd ruszamy?</h1>
      <p className="muted">
        Wpisz adresy w Krakowie. Po drodze możesz dodać do 5 przystanków.
      </p>
      {p.modeControls}
      {p.routeNotice && (
        <p className="route-change-notice" role="status">
          {p.routeNotice}
        </p>
      )}
      {!p.onboarding && (
        <section className="welcome-card">
          <span className="welcome-icon">↗</span>
          <div>
            <h2>Ustaw potrzeby do planowania trasy</h2>
            <p>
              Powiedz, jakie podjazdy i krawężniki pokonujesz. Możesz też od
              razu obejrzeć trasę.
            </p>
            <button
              className="button primary full"
              onClick={() => {
                p.onOnboarding("started");
                p.onProfile();
              }}
            >
              Ustaw moje potrzeby
            </button>
            <button
              className="text-button"
              onClick={() => p.onOnboarding("skipped")}
            >
              Na razie pomiń
            </button>
          </div>
        </section>
      )}
      <SavedPlaces
        key={p.userId || "guest"}
        data={p.favorites}
        userId={p.userId}
        onStart={p.setStart}
        onEnd={p.setEnd}
        editing={editingPlace}
        onEdit={setEditingPlace}
      />
      <div className="journey-fields">
        <div className="journey-endpoint">
          <span className="endpoint-letter">A</span>
          <AddressInput
            label="Skąd"
            value={p.start}
            onChange={p.setStart}
            favorites={p.favorites.favorites}
            onSave={(point) => setEditingPlace({ point })}
          />
        </div>
        <button
          className="text-button locate-button"
          onClick={p.onLocate}
          disabled={p.gpsBusy}
        >
          <LocateFixed size={17} />
          {p.gpsBusy ? "Odczytujemy lokalizację…" : "Użyj mojej lokalizacji"}
        </button>
        {p.via.map((point, i) => (
          <div className="via-point" key={keys[i]}>
            <span className="endpoint-letter">{i + 1}</span>
            <AddressInput
              label={`Przystanek ${i + 1}`}
              value={point}
              favorites={p.favorites.favorites}
              onSave={(point) => setEditingPlace({ point })}
              onChange={(next) =>
                p.setVia(p.via.map((v, j) => (j === i ? next : v)))
              }
            />
            <div className="via-actions">
              <button
                className="icon-button"
                aria-label={`Przystanek ${i + 1}: wcześniej`}
                disabled={i === 0}
                onClick={() => endMove(i, -1)}
              >
                <ArrowUp size={16} />
              </button>
              <button
                className="icon-button"
                aria-label={`Przystanek ${i + 1}: później`}
                disabled={i === p.via.length - 1}
                onClick={() => endMove(i, 1)}
              >
                <ArrowDown size={16} />
              </button>
              <button
                className="icon-button"
                aria-label={`Usuń przystanek ${i + 1}`}
                onClick={() => {
                  setSlotKeys(keys.filter((_, j) => j !== i));
                  p.setVia(p.via.filter((_, j) => j !== i));
                }}
              >
                <Trash2 size={17} />
              </button>
            </div>
          </div>
        ))}
        <div className="journey-endpoint" ref={destinationField}>
          <span className="endpoint-letter end">B</span>
          <AddressInput
            label="Dokąd"
            value={p.end}
            onChange={p.setEnd}
            favorites={p.favorites.favorites}
            onSave={(point) => setEditingPlace({ point })}
          />
        </div>
        <div className="journey-actions">
          <button
            className="text-button"
            disabled={p.via.length >= 5}
            onClick={() => p.setVia([...p.via, null])}
          >
            <Plus size={17} />
            Dodaj przystanek
          </button>
          <button
            className="text-button"
            disabled={!p.start || !p.end}
            onClick={() => {
              const old = p.start;
              p.setStart(p.end);
              p.setEnd(old);
              p.setVia([...p.via].reverse());
              setSlotKeys([...keys].reverse());
            }}
          >
            <ArrowDownUp size={17} />
            Zamień kierunek
          </button>
        </div>
      </div>
      <button className="route-profile" onClick={p.onProfile}>
        <SlidersHorizontal size={18} />
        <span>
          {p.onboarding === "configured"
            ? (p.profile.widthCm ? `${p.profile.widthCm} cm · ` : "") +
              `podjazdy do ${p.profile.maxIncline}% · krawężniki do ${p.profile.maxKerbCm} cm`
            : "Podstawowe ustawienia · dostosuj do siebie"}
        </span>
        <ChevronRight size={16} />
      </button>
      {p.profilePending && (
        <div className="profile-pending-notice">
          <p>
            W profilu są niezapisane zmiany. Do planowania użyjemy zapisanych
            potrzeb.
          </p>
          <button type="button" className="text-button" onClick={p.onProfile}>
            Sprawdź zmiany potrzeb <ChevronRight size={16} />
          </button>
        </div>
      )}
      <label className="check-row">
        <input
          type="checkbox"
          checked={p.avoidReports}
          onChange={(e) => p.setAvoidReports(e.target.checked)}
        />
        <span>
          Omijaj zgłoszone bariery
          <small>Dokładne zgłoszenia mogą zmienić trasę. Pozostałe pokazujemy do oceny.</small>
        </span>
      </label>
      {!ready && (
        <p className="field-help">
          Wybierz podpowiedź dla każdego adresu, żeby ustalić dokładny punkt na
          mapie.
        </p>
      )}
      <button
        className="button primary full"
        disabled={!ready || !p.online}
        aria-disabled={!ready || p.busy || !p.online}
        onClick={() => {
          if (!ready || p.busy || !p.online) return;
          p.onPlan();
        }}
      >
        {p.busy ? (
          <>
            <span className="loader light" />
            Szukamy przejścia…
          </>
        ) : (
          <>
            <RouteIcon size={19} />
            {p.route ? "Przelicz trasę" : "Wyznacz trasę"}
            <ArrowRight size={18} />
          </>
        )}
      </button>
      <div
        className="sr-only"
        role="status"
        aria-label="Wynik planowania trasy"
        aria-live="polite"
        aria-atomic="true"
      >
        {planningStatus}
      </div>
      {p.error && (
        <div className="error-box route-error" role="alert">
          <strong>
            {noJourney
              ? "Nie udało się zaplanować podróży przez parking"
              : p.error.message}
          </strong>
          {noJourney && (
            <>
              <p>
                {diagnosis?.message ?? "Dla sprawdzonych parkingów nie udało się połączyć dojazdu autem z dalszą drogą do celu. Przyczyną mogą być braki w danych mapy lub brak trasy zgodnej z Twoimi potrzebami."}
              </p>
              <p>
                {typeof diagnosis?.details?.suggestion === "string" ? diagnosis.details.suggestion : "Jeśli znasz wejście do obiektu, wyszukaj je w polu „Dokąd”, wybierz podpowiedź i kliknij „Wyznacz trasę”."}
              </p>
              <p>
                Brak wyniku nie przesądza o dostępności miejsca. Twoje
                ustawienia pozostają bez zmian.
              </p>
              <div className="route-error-actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => {
                    const input = destinationField.current?.querySelector("input");
                    input?.focus();
                    input?.select();
                    input?.scrollIntoView({ block: "center" });
                  }}
                >
                  Zmień cel
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={p.onProfile}
                >
                  Pokaż moje potrzeby
                </button>
              </div>
            </>
          )}
        </div>
      )}
      {p.route && (
        <div className="route-result">
          {p.viewingSaved && (
            <div className="notice">
              <Bookmark size={18} />
              <p>
                {p.saved ? planAge(p.saved) : "Plan z poprzedniej wizyty."}{" "}
                Pokazujemy ustawienia zapisane z planem. Przeliczenie użyje
                obecnych potrzeb; warunki na drodze mogą być inne.
              </p>
            </div>
          )}
          <div className="route-summary">
            <div>
              <strong>{metres(p.route.distanceM)}</strong>
              <span>długość trasy</span>
            </div>
            <div>
              <strong>
                ~{Math.max(1, Math.round(p.route.durationS / 60))} min
              </strong>
              <span>
                {String(p.route.source.durationModel || "").includes("personal")
                  ? "według Twojego tempa"
                  : "szacowany czas"}
              </span>
            </div>
          </div>
          <div className="uncertainty">
            <ShieldQuestion size={22} />
            <div>
              <strong>Sprawdź warunki na swojej drodze</strong>
              <p>
                Trasa uwzględnia znane bariery i Twoje ustawienia. Nie wszędzie
                mamy aktualne pomiary, więc przejezdność nie jest potwierdzona
                na całej długości.
              </p>
            </div>
          </div>
          <details className="route-warnings">
            <summary>
              Co wiemy, a czego brakuje ({p.route.warnings.length})
            </summary>
            <ul>
              {p.route.warnings.map((w, i) => (
                <li key={i}>
                  {w
                    .replaceAll("OSM", "mapie społecznościowej")
                    .replaceAll("ORS", "silnik tras")}
                </li>
              ))}
            </ul>
          </details>
          <RouteEvidence route={p.route} onFocus={p.onFocusEvidence} />
          {!p.viewingSaved && p.route.stopSuggestions && (
            <RestStops
              suggestions={p.route.stopSuggestions}
              start={p.start}
              end={p.end}
              via={p.via}
              onAdd={p.onAddStop}
              online={p.online}
              onMap={p.onPreviewStop}
            />
          )}
          <h2>Przebieg trasy</h2>
          {p.guidanceControls}
          <RouteSteps route={p.route} online={p.online} />
          <button className="text-button" onClick={p.onReport}>
            <Flag size={17} />
            Zgłoś coś na drodze
          </button>
          <section className="route-save-section" aria-label="Zachowaj plan">
          <h2>Zachowaj plan</h2>
          <div className="route-actions">
            <button
              className="button secondary"
              onClick={() => p.onSave(deviceAccess)}
            >
              <Bookmark size={17} />
              Zapisz plan
            </button>
            <button className="button secondary" onClick={p.onMap}>
              <MapPin size={17} />
              Pokaż mapę
            </button>
          </div>
          <PrintPlan
            route={p.route}
            start={p.start}
            end={p.end}
            via={p.via}
            profile={p.profile}
            viewingSaved={p.viewingSaved}
          />
          {p.userId ? (
            <label className="check-row saved-plan-option">
              <input
                type="checkbox"
                checked={deviceAccess}
                onChange={(e) => setDeviceAccess(e.target.checked)}
              />
              <span>
                Dostęp bez logowania na tym urządzeniu
                <small>
                  {deviceAccess
                    ? "Inne osoby korzystające z tego urządzenia będą mogły odczytać adresy, potrzeby i instrukcje. Taki plan działa również bez internetu."
                    : "Domyślnie zapis otwiera tylko Twoje konto, po sprawdzeniu logowania przez internet. Plan nie synchronizuje się z innymi urządzeniami."}
                </small>
              </span>
            </label>
          ) : (
            <p className="field-help">
              Bez logowania plan na tym urządzeniu mogą odczytać także inne osoby,
              wraz z adresami, potrzebami i instrukcjami.
            </p>
          )}
          <p className="field-help">
            Na urządzeniu zapisujemy jeden plan. Nowy zastąpi poprzedni.
          </p>
          </section>
        </div>
      )}
      {p.saved && (
        <SavedPlan
          key={p.saved.savedAt}
          saved={p.saved}
          viewing={p.viewingSaved}
          onOpen={p.onRestore}
          onDelete={p.onDeleteSaved}
        />
      )}
      {p.hiddenPlan && (
        <section className="saved-plan" aria-label="Niedostępny zapis planu">
          <h2>
            {p.hiddenPlan === "account"
              ? "Plan przypisany do konta"
              : "Starszy format zapisu"}
          </h2>
          <p>
            {p.hiddenPlan === "account"
              ? "Aby otworzyć ten zapis, połącz się z internetem i zaloguj na konto, które go utworzyło."
              : "Ten zapis nie określa właściciela. Ze względu na prywatność wyznacz i zapisz trasę ponownie."}
          </p>
          {p.hiddenPlan === "account" && (
            <button type="button" className="text-button" onClick={p.onAccount}>
              Przejdź do konta
            </button>
          )}
        </section>
      )}
    </div>
  );
}
