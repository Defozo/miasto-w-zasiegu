import { useEffect, useRef, useState } from "react";
import {
  BriefcaseBusiness,
  Check,
  House,
  Plus,
  Star,
  Trash2,
  X,
} from "lucide-react";
import AddressInput from "./AddressInput";
import type { FavoritePlace, LocationPoint } from "./types";
import "./saved-places.css";

export interface FavoritesProps {
  favorites: FavoritePlace[];
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
  save: (label: string, point: LocationPoint) => Promise<FavoritePlace>;
  remove: (id: string) => Promise<void>;
}
export default function SavedPlaces({
  data,
  userId,
  onStart,
  onEnd,
  editing,
  onEdit,
  expanded = false,
}: {
  data: FavoritesProps;
  userId: string | null;
  onStart: (p: LocationPoint) => void;
  onEnd: (p: LocationPoint) => void;
  editing: { point: LocationPoint | null } | null;
  onEdit: (value: { point: LocationPoint | null } | null) => void;
  expanded?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [label, setLabel] = useState(""),
    [point, setPoint] = useState<LocationPoint | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [formError, setFormError] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);
  useEffect(() => {
    if (editing) {
      setPoint(editing.point);
      setLabel("");
      setFormError("");
      dialog.current?.showModal();
    } else dialog.current?.close();
  }, [editing]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!point || !label.trim()) return;
    setBusy(true);
    setFormError("");
    try {
      await data.save(label, point);
      setMessage(
        `Zapisano „${label.trim()}”. Następnym razem wystarczy wybrać je przy adresie.`,
      );
      onEdit(null);
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="saved-places" aria-label="Twoje zapisane miejsca">
      <details open={expanded || undefined}>
        <summary>
          <Star size={18} aria-hidden="true" />
          <span>Twoje miejsca</span>
          <small>
            {data.favorites.length
              ? data.favorites.length
              : "Dom, praca i ulubione"}
          </small>
        </summary>
        <p className="field-help">
          {userId
            ? "Zapisane na Twoim koncie. Te same miejsca wybierzesz na Androidzie."
            : "Zapisane tylko w tej przeglądarce. Korzystaj bez zakładania konta."}
        </p>
        {data.loading && <p role="status">Wczytujemy Twoje miejsca…</p>}
        {data.error && (
          <p role="alert">
            {data.error}{" "}
            <button className="text-button" onClick={data.reload}>
              Spróbuj ponownie
            </button>
          </p>
        )}
        <ul className="saved-place-list">
          {data.favorites.map((f) => {
            const Icon =
              f.label.toLowerCase() === "dom"
                ? House
                : f.label.toLowerCase() === "praca"
                  ? BriefcaseBusiness
                  : Star;
            return (
              <li key={f.id}>
                <div className="saved-place-name">
                  <Icon size={19} aria-hidden="true" />
                  <div>
                    <strong>{f.label}</strong>
                    <small>{f.point.label}</small>
                  </div>
                </div>
                <div className="saved-place-actions">
                  <button
                    type="button"
                    onClick={() => onStart(f.point)}
                    aria-label={`${f.label}: ustaw jako początek`}
                  >
                    Stąd ruszam
                  </button>
                  <button
                    type="button"
                    onClick={() => onEnd(f.point)}
                    aria-label={`${f.label}: ustaw jako cel`}
                  >
                    Tu idę
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => setRemoving(f.id)}
                    aria-label={`Usuń zapisane miejsce: ${f.label}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                {removing === f.id && (
                  <div className="saved-place-delete">
                    <span>Usunąć „{f.label}” z zapisanych?</span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await data.remove(f.id);
                          setRemoving(null);
                          setMessage(
                            `Usunięto „${f.label}” z zapisanych miejsc.`,
                          );
                        } catch (e) {
                          setMessage((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Usuń
                    </button>
                    <button type="button" onClick={() => setRemoving(null)}>
                      Zachowaj
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          className="text-button"
          onClick={() => onEdit({ point: null })}
          disabled={data.loading || data.favorites.length >= 30}
        >
          <Plus size={17} />
          Dodaj zapisane miejsce
        </button>
      </details>
      {message && (
        <p className="saved-place-feedback" role="status">
          <Check size={16} />
          {message}
        </p>
      )}
      <dialog
        ref={dialog}
        className="favorite-dialog"
        aria-labelledby="favorite-title"
        onCancel={(e) => {
          if (busy) e.preventDefault();
          else onEdit(null);
        }}
      >
        <button
          type="button"
          className="icon-button favorite-close"
          aria-label="Zamknij zapis miejsca"
          disabled={busy}
          onClick={() => onEdit(null)}
        >
          <X />
        </button>
        <span className="eyebrow">WRACAJ PO SWOJEMU</span>
        <h2 id="favorite-title">Miejsce, do którego wracasz</h2>
        <p>
          Nazwij je po swojemu. Będzie pod ręką przy planowaniu kolejnej drogi.
        </p>
        <form onSubmit={save}>
          <label className="field-label" htmlFor="favorite-name">
            Nazwa miejsca
          </label>
          <input
            autoFocus
            id="favorite-name"
            value={label}
            maxLength={80}
            required
            placeholder="Np. Dom, Praca, Ulubiona kawiarnia"
            onChange={(e) => setLabel(e.target.value)}
          />
          <div className="favorite-presets">
            {["Dom", "Praca", "Ulubione"].map((name) => (
              <button
                type="button"
                key={name}
                aria-pressed={label === name}
                onClick={() => setLabel(name)}
              >
                {name}
              </button>
            ))}
          </div>
          <AddressInput
            label="Adres zapisanego miejsca"
            value={point}
            onChange={setPoint}
            resetKey={editing ? 1 : 0}
          />
          {formError && (
            <p className="error-box" role="alert">
              {formError}
            </p>
          )}
          <p className="field-help">
            {userId
              ? "To prywatne miejsce na Twoim koncie."
              : "Zapis pozostanie na tym urządzeniu."}
          </p>
          <button
            className="button primary full"
            disabled={!point || !label.trim() || busy}
          >
            {busy ? "Zapisujemy…" : "Zapisz miejsce"}
            <Star size={18} />
          </button>
        </form>
      </dialog>
    </section>
  );
}
