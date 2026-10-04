import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  BookOpen,
  Check,
  Expand,
  ImagePlus,
  PencilLine,
  Trash2,
  X,
} from "lucide-react";
import GardenPicture, { gardenStage, type GardenView } from "./GameGarden";
import {
  ALBUM_LIMIT,
  albumKey,
  gardenSnapshot,
  postcardName,
  readAlbum,
  snapshotView,
  type Postcard,
} from "./game-album";
import "./game-album.css";

type Props = { context: string; training: boolean; progress: GardenView };
type Action = { kind: "replace" | "delete"; card: Postcard };
const dateLabel = (value: string) =>
  new Date(value).toLocaleString("pl-PL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

// A keyed inner component clears drafts, previews and cards in the same render as
// an account/mode change. No effect can briefly expose the previous album.
export default function GameAlbum(props: Props) {
  return <Album key={props.context} {...props} />;
}

function Album({ context, training, progress }: Props) {
  const key = albumKey(context);
  const [initial] = useState(() => {
    try {
      return { cards: readAlbum(key), failed: false };
    } catch {
      return { cards: [], failed: true };
    }
  });
  const [cards, setCards] = useState(initial.cards);
  const [name, setName] = useState("");
  const [action, setAction] = useState<Action | null>(null);
  const [replacementName, setReplacementName] = useState("");
  const [preview, setPreview] = useState<Postcard | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState(
    initial.failed
      ? "Przeglądarka blokuje zapis lokalny. Album może być niedostępny."
      : "",
  );
  const dialogRef = useRef<HTMLDialogElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const previewButtons = useRef(new Map<number, HTMLButtonElement>());
  const actionTrigger = useRef<HTMLButtonElement | null>(null);
  const completedAction = useRef<Action | null>(null);
  const prefix = useId();
  const full = cards.length >= ALBUM_LIMIT;

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (
        event.storageArea !== localStorage ||
        (event.key !== key && event.key !== null)
      )
        return;
      try {
        setCards(readAlbum(key));
        setAction(null);
        setPreview(null);
        setNotice("Album został zmieniony w innej karcie.");
      } catch {
        setError("Nie można odczytać albumu z tego urządzenia.");
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [key]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (preview && dialog && !dialog.open) dialog.showModal();
    else if (!preview && dialog?.open) dialog.close();
  }, [preview]);

  useEffect(() => {
    const completed = completedAction.current;
    if (action || !completed) return;
    completedAction.current = null;
    const next = completed.kind === "replace"
      ? cards.find((card) => card.slot === completed.card.slot)
      : cards.find((card) => card.slot > completed.card.slot) ?? cards.at(-1);
    const target = next ? previewButtons.current.get(next.slot) : nameRef.current;
    target?.focus();
  }, [cards, action]);

  function persist(
    change: (latest: Postcard[]) => Postcard[],
    message: string,
  ) {
    setError("");
    setNotice("");
    try {
      const next = change(readAlbum(key));
      localStorage.setItem(key, JSON.stringify(next));
      setCards(next);
      setAction(null);
      setNotice(message);
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error && cause.name === "AlbumChanged"
          ? cause.message
          : "Nie udało się zapisać albumu na tym urządzeniu. Poprzednie pocztówki pozostają bez zmian.",
      );
      return false;
    }
  }

  function changed(message: string): never {
    const error = new Error(message);
    error.name = "AlbumChanged";
    throw error;
  }

  function add(event: FormEvent) {
    event.preventDefault();
    const title = postcardName(name);
    if (!title) {
      setError("Nadaj pocztówce nazwę.");
      return;
    }
    if (
      persist((latest) => {
        const slot = [0, 1, 2].find(
          (value) => !latest.some((card) => card.slot === value),
        );
        if (slot === undefined)
          return changed(
            "Album ma już trzy pocztówki. Wybierz konkretną do zastąpienia lub usunięcia.",
          );
        return [
          ...latest,
          {
            slot,
            name: title,
            savedAt: new Date().toISOString(),
            garden: gardenSnapshot(progress),
          },
        ].sort((a, b) => a.slot - b.slot);
      }, `Pocztówka „${title}” zapisana na tym urządzeniu. Ogród i iskry pozostają bez zmian.`)
    )
      setName("");
  }

  function confirm(event: FormEvent) {
    event.preventDefault();
    if (!action) return;
    const title = postcardName(replacementName);
    if (action.kind === "replace" && !title) {
      setError("Nadaj pocztówce nazwę.");
      return;
    }
    const saved = persist(
      (latest) => {
        const previous = latest.find((card) => card.slot === action.card.slot);
        if (
          !previous ||
          JSON.stringify(previous) !== JSON.stringify(action.card)
        )
          return changed(
            "Ta pocztówka zmieniła się w innej karcie. Odśwież stronę przed zastąpieniem lub usunięciem.",
          );
        return action.kind === "delete"
          ? latest.filter((card) => card.slot !== action.card.slot)
          : latest.map((card) =>
              card.slot === action.card.slot
                ? {
                    slot: card.slot,
                    name: title,
                    savedAt: new Date().toISOString(),
                    garden: gardenSnapshot(progress),
                  }
                : card,
            );
      },
      action.kind === "delete"
        ? `Usunięto pocztówkę „${action.card.name}”. Twój ogród pozostaje bez zmian.`
        : `Zastąpiono pocztówkę nowym widokiem „${title}”. Nie zmieniono iskier ani ogrodu.`,
    );
    if (saved) completedAction.current = action;
  }

  return (
    <section
      className="ig-album"
      id="ig-album"
      aria-labelledby={`${prefix}-heading`}
    >
      <div className="ig-album-heading">
        <div>
          <span className="ig-kicker">
            <BookOpen size={16} aria-hidden="true" />
            Małe historie, własne miejsce
          </span>
          <h2 id={`${prefix}-heading`}>Album ogrodu</h2>
        </div>
        <span className="ig-album-count">
          {cards.length} z {ALBUM_LIMIT} pocztówek
        </span>
      </div>
      <p className="ig-album-intro">
        Zachowaj ogród tak, jak wygląda dzisiaj. Przestaw ozdoby i ułóż kolejną
        kompozycję, kiedy zechcesz.
      </p>
      <p className="ig-album-local">
        <strong>
          {training ? "Album treningowy" : "Album tego konta"} · na tym
          urządzeniu.
        </strong>{" "}
        Pocztówki pozostają w tej przeglądarce. Nie synchronizują się z kontem;
        wyczyszczenie danych strony je usunie. Bez lokalizacji obserwacji i bez
        dodatkowych iskier.
      </p>
      <form className="ig-album-save" onSubmit={add}>
        <label htmlFor={`${prefix}-name`}>
          Nazwa nowej pocztówki
          <input
            id={`${prefix}-name`}
            ref={nameRef}
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={40}
            placeholder="Na przykład: Mój spokojny zakątek"
            disabled={full}
            required
            autoComplete="off"
          />
        </label>
        <button
          type="submit"
          className="ig-album-primary"
          disabled={full || !postcardName(name)}
        >
          <ImagePlus size={19} aria-hidden="true" />
          Zachowaj ten widok
        </button>
        {full && (
          <p>
            Wszystkie trzy miejsca są zajęte. Żadna pocztówka nie znika
            automatycznie. Możesz wybrać jedną do zastąpienia lub usunięcia.
          </p>
        )}
      </form>
      <p className="ig-album-notice" aria-live="polite" aria-atomic="true">
        {notice && (
          <>
            <Check size={17} aria-hidden="true" />
            {notice}
          </>
        )}
      </p>
      {error && (
        <p className="ig-album-error" role="alert">
          {error}
        </p>
      )}
      <div className="ig-album-grid">
        {[0, 1, 2].map((slot) => {
          const card = cards.find((item) => item.slot === slot);
          return card ? (
            <article
              className="ig-postcard"
              key={slot}
              aria-labelledby={`${prefix}-card-${slot}`}
            >
              <div className="ig-postcard-picture">
                <GardenPicture
                  progress={snapshotView(card.garden)}
                  label={`Zapisany ogród: ${card.name}. ${gardenStage(card.garden.growth)}. ${card.garden.decorations.length} ozdobione grządki.`}
                />
              </div>
              <div className="ig-postcard-caption">
                <span>
                  Pocztówka {slot + 1} · {training ? "trening" : "moje miasto"}
                </span>
                <h3 id={`${prefix}-card-${slot}`}>{card.name}</h3>
                <time dateTime={card.savedAt}>{dateLabel(card.savedAt)}</time>
              </div>
              <div className="ig-postcard-actions">
                <button
                  type="button"
                  ref={(button) => {
                    if (button) previewButtons.current.set(slot, button);
                    else previewButtons.current.delete(slot);
                  }}
                  aria-label={`Powiększ pocztówkę: ${card.name}`}
                  aria-haspopup="dialog"
                  onClick={() => setPreview(card)}
                >
                  <Expand size={16} aria-hidden="true" />
                  Powiększ
                </button>
                <button
                  type="button"
                  aria-label={`Zastąp pocztówkę: ${card.name}`}
                  aria-expanded={
                    action?.kind === "replace" && action.card.slot === slot
                  }
                  onClick={(event) => {
                    actionTrigger.current = event.currentTarget;
                    setAction({ kind: "replace", card });
                    setReplacementName(card.name);
                    setError("");
                  }}
                >
                  <PencilLine size={16} aria-hidden="true" />
                  Zastąp
                </button>
                <button
                  type="button"
                  aria-label={`Usuń pocztówkę: ${card.name}`}
                  aria-expanded={
                    action?.kind === "delete" && action.card.slot === slot
                  }
                  onClick={(event) => {
                    actionTrigger.current = event.currentTarget;
                    setAction({ kind: "delete", card });
                    setError("");
                  }}
                >
                  <Trash2 size={16} aria-hidden="true" />
                  Usuń
                </button>
              </div>
              {action?.card.slot === slot && (
                <form className="ig-postcard-confirm" onSubmit={confirm}>
                  <p>
                    {action.kind === "delete" ? (
                      <>
                        Usunąć „{card.name}” z tego urządzenia? Tej pocztówki
                        nie będzie można odzyskać.
                      </>
                    ) : (
                      <>
                        Zastąpić „{card.name}” aktualnym widokiem ogrodu?
                        Poprzedni widok nie zostanie zachowany.
                      </>
                    )}
                  </p>
                  {action.kind === "replace" && (
                    <label htmlFor={`${prefix}-replacement`}>
                      Nazwa zastępowanej pocztówki
                      <input
                        id={`${prefix}-replacement`}
                        value={replacementName}
                        onChange={(event) =>
                          setReplacementName(event.target.value)
                        }
                        maxLength={40}
                        required
                        autoComplete="off"
                      />
                    </label>
                  )}
                  <div>
                    <button type="submit" className="ig-album-primary">
                      {action.kind === "delete"
                        ? "Tak, usuń pocztówkę"
                        : "Tak, zastąp widok"}
                    </button>
                    <button type="button" onClick={() => {
                      setAction(null);
                      actionTrigger.current?.focus();
                    }}>
                      Anuluj
                    </button>
                  </div>
                </form>
              )}
            </article>
          ) : (
            <div className="ig-postcard-empty" key={slot}>
              <span aria-hidden="true">0{slot + 1}</span>
              <ImagePlus size={30} aria-hidden="true" />
              <p>
                {slot === 0
                  ? "Tu zaczyna się Twoja historia ogrodu."
                  : "Miejsce na kolejną kompozycję."}
              </p>
            </div>
          );
        })}
      </div>
      <dialog
        className="ig-postcard-dialog"
        ref={dialogRef}
        aria-labelledby={`${prefix}-preview-title`}
        onCancel={() => setPreview(null)}
        onClose={() => setPreview(null)}
      >
        {preview && (
          <>
            <div className="ig-postcard-dialog-head">
              <span>
                {training ? "Album treningowy" : "Album tego konta"} · na tym
                urządzeniu
              </span>
              <button
                type="button"
                onClick={() => setPreview(null)}
                aria-label="Zamknij podgląd pocztówki"
              >
                <X size={22} aria-hidden="true" />
              </button>
            </div>
            <div className="ig-postcard-picture">
              <GardenPicture
                progress={snapshotView(preview.garden)}
                label={`Zapisany ogród: ${preview.name}. ${gardenStage(preview.garden.growth)}. ${preview.garden.decorations.length} ozdobione grządki.`}
              />
            </div>
            <div className="ig-postcard-dialog-caption">
              <h2 id={`${prefix}-preview-title`}>{preview.name}</h2>
              <time dateTime={preview.savedAt}>
                {dateLabel(preview.savedAt)}
              </time>
              <p>
                Zapisany widok do oglądania. Nie zmienia aktualnego ogrodu,
                ozdób ani iskier.
              </p>
            </div>
          </>
        )}
      </dialog>
    </section>
  );
}
