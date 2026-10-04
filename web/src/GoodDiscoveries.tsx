import { useEffect, useRef, useState } from "react";
import {
  Armchair,
  ArrowRight,
  Clock3,
  DoorOpen,
  MapPin,
  MoveVertical,
  RefreshCw,
  Plus,
} from "lucide-react";
import { api, dateLabel } from "./api";
import { motionReduced } from "./display-preferences";
import type { CommunityObservation } from "./types";
import "./good-discoveries.css";

export default function GoodDiscoveries({
  observations,
  loading,
  error,
  userId,
  focusedId,
  onReload,
  onMap,
  onRoute,
  onAddStop,
  stopCount,
}: {
  observations: CommunityObservation[];
  loading: boolean;
  error: string;
  userId: string | null;
  focusedId: string | null;
  onReload: () => void;
  onMap: (id: string) => void;
  onRoute: (observation: CommunityObservation) => void;
  onAddStop: (observation: CommunityObservation) => void;
  stopCount: number;
}) {
  const root = useRef<HTMLElement>(null);
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState<string | null>(null),
    [confirmId, setConfirmId] = useState<string | null>(null);
  useEffect(() => {
    if (focusedId) {
      const card = root.current?.querySelector<HTMLElement>(
        `[data-observation-id="${CSS.escape(focusedId)}"]`,
      );
      card?.scrollIntoView({
        block: "center",
        behavior: motionReduced() ? "instant" : "smooth",
      });
      card?.focus({ preventScroll: true });
    }
  }, [focusedId]);
  return (
    <section
      className="good-discoveries"
      ref={root}
      aria-labelledby="discoveries-heading"
    >
      <div className="good-heading">
        <div>
          <p className="eyebrow">ZGŁOSZONE UDOGODNIENIA</p>
          <h2 id="discoveries-heading">Co dobrego po drodze?</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Odśwież dobre odkrycia"
          disabled={loading}
          onClick={onReload}
        >
          <RefreshCw size={18} />
        </button>
      </div>
      <p className="field-help">
        Mieszkańcy zauważyli miejsca odpoczynku, wejścia bez schodów i
        działające windy. To obserwacje z podanego czasu, bez potwierdzenia
        całej dostępności miejsca.
      </p>
      {loading && <p role="status">Sprawdzamy ostatnie odkrycia…</p>}
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {!loading && !error && observations.length === 0 && (
        <div className="good-empty">
          <Armchair size={28} />
          <strong>Nie ma jeszcze zgłoszonych udogodnień</strong>
          <p>
            Możesz opisać ławkę, wejście bez schodów lub działającą windę.
          </p>
          <a className="text-button" href="/gra">
            Odkrywaj z Iskrą <ArrowRight size={16} />
          </a>
        </div>
      )}
      <div className="good-discovery-list">
        {observations.map((o) => {
          const Icon =
            o.type === "rest_place"
              ? Armchair
              : o.type === "step_free_entrance"
                ? DoorOpen
                : MoveVertical;
          return (
            <article
              key={o.id}
              tabIndex={-1}
              data-observation-id={o.id}
              className={
                focusedId === o.id
                  ? "good-discovery selected"
                  : "good-discovery"
              }
            >
              <div className="good-discovery-title">
                <Icon size={23} />
                <h3>{o.label}</h3>
              </div>
              <p>{o.description}</p>
              <small className="good-time">
                <Clock3 size={13} />
                Obserwacja: {dateLabel(o.observedAt)}
              </small>
              <small className="good-time">
                Do ponownego sprawdzenia: {dateLabel(o.validUntil)}
              </small>
              <div className="good-actions">
                <button
                  type="button"
                  className="text-button"
                  disabled={stopCount >= 5}
                  onClick={() => onAddStop(o)}
                >
                  <Plus size={15} /> Dodaj jako przystanek
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => onRoute(o)}
                >
                  Zaplanuj dojście <ArrowRight size={15} />
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => onMap(o.id)}
                >
                  <MapPin size={16} />
                  Na mapie
                </button>
              </div>
              {stopCount >= 5 && (
                <p className="field-help">
                  Masz już 5 przystanków. Usuń jeden w planie, aby dodać to
                  miejsce.
                </p>
              )}
              {o.isMine &&
                (confirmId === o.id ? (
                  <div className="good-withdraw">
                    <p>
                      Ukryć Twoją obserwację z mapy? Jeśli warunki się zmieniły,
                      zgłoś też obecną przeszkodę.
                    </p>
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy === o.id}
                      onClick={async () => {
                        setBusy(o.id);
                        try {
                          await api(`/observations/${o.id}/withdraw`, {
                            expectedUserId: userId,
                          });
                          setMessage("Obserwacja została wycofana z mapy.");
                          setConfirmId(null);
                          onReload();
                        } catch (e) {
                          setMessage((e as Error).message);
                        } finally {
                          setBusy(null);
                        }
                      }}
                    >
                      Wycofaj obserwację
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setConfirmId(null)}
                    >
                      Zachowaj
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="text-button good-remove"
                    onClick={() => setConfirmId(o.id)}
                  >
                    Wycofaj moje odkrycie
                  </button>
                ))}
            </article>
          );
        })}
      </div>
      {message && (
        <p role="status" className="field-help">
          {message}
        </p>
      )}
    </section>
  );
}
