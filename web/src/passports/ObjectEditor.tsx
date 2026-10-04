import { useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, Plus, Save, Upload, Eye } from "lucide-react";
import {
  PASSPORT_CATEGORIES,
  PASSPORT_MAX_ENTRANCES,
  PASSPORT_FIELD_DEFINITIONS,
  emptyPassportFields,
  type PassportContent,
  type PassportDraft,
  type PassportHistory,
  type PassportPublishResult,
  type PlacePassport,
} from "../../../shared/place-passports.mjs";
import type { AccountState } from "../types";
import {
  PassportApiError,
  passportDate,
  passportRequest,
} from "./passport-api";
import { previewPassport } from "./passport-preview";
import PassportFields, { CoordinatesEditor } from "./PassportFields";
import PassportCard from "./PassportCard";
import DomainVerification from "./DomainVerification";
import EmbedCode from "./EmbedCode";

function changedFieldLabel(path: string) {
  const last = path.split(".").at(-1);
  const field = PASSPORT_FIELD_DEFINITIONS.find(
    (definition) => definition.key === last,
  );
  if (field)
    return `${path.includes("entrance") ? "Wejście: " : ""}${field.label}`;
  return (
    (
      {
        name: "Nazwa",
        category: "Kategoria",
        address: "Adres",
        coordinates: "Położenie",
        website: "Strona",
        label: "Nazwa wejścia",
        entrances: "Wejścia",
      } as Record<string, string>
    )[last ?? ""] ?? "Opis obiektu lub wejścia"
  );
}

export default function ObjectEditor({
  draft: initialDraft,
  initialName,
  user,
  onBack,
  onChanged,
  onPlan,
}: {
  draft: PassportDraft;
  initialName?: string;
  user: NonNullable<AccountState["user"]>;
  onBack: () => void;
  onChanged: () => void;
  onPlan: (placeId: string, entranceId?: string) => void;
}) {
  const prefix = useId();
  const [draft, setDraft] = useState(initialDraft);
  const [content, setContent] = useState<PassportContent>(() => ({
    ...initialDraft.content,
    place: {
      ...initialDraft.content.place,
      name: initialDraft.content.place.name || initialName || "",
    },
  }));
  const [stage, setStage] = useState<"edit" | "preview" | "published">("edit");
  const [published, setPublished] = useState<PlacePassport | null>(null);
  const [conflict, setConflict] = useState<PlacePassport | null>(null);
  const [privateConflict, setPrivateConflict] = useState<PassportDraft | null>(
    null,
  );
  const [history, setHistory] = useState<PassportHistory | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [leaving, setLeaving] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const focusHeading = useRef<HTMLHeadingElement>(null);
  const dirty = JSON.stringify(content) !== JSON.stringify(draft.content);
  useEffect(() => {
    const current = new AbortController();
    controller.current = current;
    return () => current.abort();
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);
  useEffect(() => {
    focusHeading.current?.focus({ preventScroll: false });
  }, [stage]);

  async function showConflict(failure: unknown, signal?: AbortSignal) {
    if (!(failure instanceof PassportApiError) || signal?.aborted) return;
    try {
      if (failure.code === "DRAFT_CONFLICT") {
        const latest = await passportRequest<PassportDraft>(
          `/place-passports/drafts/${encodeURIComponent(draft.id)}?expectedUserId=${encodeURIComponent(user.id)}`,
          { signal },
        );
        if (!signal?.aborted) {
          setPrivateConflict(latest);
          setConflict(null);
        }
      } else if (failure.code === "PASSPORT_CONFLICT") {
        const latest = await passportRequest<PlacePassport>(
          `/place-passports/${encodeURIComponent(draft.placeId)}`,
          { public: true, signal },
        );
        if (!signal?.aborted) setConflict(latest);
      }
    } catch {
      /* Preserve the original error and local edits when refresh fails. */
    }
  }

  async function save(preview: boolean, leave = false) {
    if (busy) return;
    if (
      preview &&
      (!content.place.name.trim() ||
        !content.place.coordinates ||
        content.entrances.some((entrance) => !entrance.label.trim()))
    ) {
      setError(
        "Przed podglądem podaj nazwę oraz współrzędne obiektu i nazwij każde dodane wejście. Szkic możesz zapisać bez tych danych.",
      );
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    const signal = controller.current?.signal;
    try {
      const result = await passportRequest<PassportDraft>(
        `/place-passports/drafts/${encodeURIComponent(draft.id)}`,
        {
          method: "PUT",
          body: {
            content,
            expectedDraftVersion: draft.draftVersion,
            expectedUserId: user.id,
          },
          signal,
        },
      );
      if (signal?.aborted) return;
      setDraft(result);
      setContent(result.content);
      onChanged();
      setMessage(
        "Prywatny szkic zapisany. Nie jest jeszcze widoczny w aplikacji ani w widgecie.",
      );
      if (leave) onBack();
      else if (preview) setStage("preview");
    } catch (failure) {
      if (!signal?.aborted) {
        setError((failure as Error).message);
        await showConflict(failure, signal);
      }
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  }

  async function publish() {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    setConflict(null);
    const signal = controller.current?.signal;
    try {
      const result = await passportRequest<PassportPublishResult>(
        `/place-passports/drafts/${encodeURIComponent(draft.id)}/publish`,
        {
          body: {
            expectedDraftVersion: draft.draftVersion,
            expectedPublishedRevision: draft.baseRevision,
            expectedUserId: user.id,
          },
          signal,
        },
      );
      if (signal?.aborted) return;
      setDraft(result.draft);
      setContent(result.draft.content);
      setPublished(result.passport);
      setStage("published");
      setHistory(null);
      setMessage(
        "Opublikowano. Te dane są teraz dostępne w aplikacji i w widgecie.",
      );
      onChanged();
    } catch (failure) {
      if (signal?.aborted) return;
      setError((failure as Error).message);
      await showConflict(failure, signal);
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  }

  async function rebase() {
    if (!conflict || busy) return;
    setBusy(true);
    setError("");
    const signal = controller.current?.signal;
    try {
      const result = await passportRequest<PassportDraft>(
        `/place-passports/drafts/${encodeURIComponent(draft.id)}/rebase`,
        {
          body: {
            expectedDraftVersion: draft.draftVersion,
            expectedPublishedRevision: conflict.revision,
            expectedUserId: user.id,
          },
          signal,
        },
      );
      if (signal?.aborted) return;
      setDraft(result);
      setContent(result.content);
      setConflict(null);
      setStage("edit");
      setMessage(
        "Szkic połączony z aktualną wersją. Sprawdź dane, ponownie otwórz podgląd i dopiero wtedy opublikuj.",
      );
      onChanged();
    } catch (failure) {
      if (!signal?.aborted) {
        setError((failure as Error).message);
        await showConflict(failure, signal);
      }
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  }

  async function loadHistory() {
    if (showHistory) {
      setShowHistory(false);
      return;
    }
    if (history) {
      setShowHistory(true);
      return;
    }
    setBusy(true);
    setError("");
    const signal = controller.current?.signal;
    try {
      const result = await passportRequest<PassportHistory>(
        `/place-passports/${encodeURIComponent(draft.placeId)}/history`,
        { public: true, signal },
      );
      if (!signal?.aborted) {
        setHistory(result);
        setShowHistory(true);
      }
    } catch (failure) {
      if (!signal?.aborted) setError((failure as Error).message);
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  }

  function placeChange(patch: Partial<PassportContent["place"]>) {
    setContent((current) => ({
      ...current,
      place: { ...current.place, ...patch },
    }));
  }
  function entranceChange(
    index: number,
    patch: Partial<PassportContent["entrances"][number]>,
  ) {
    setContent((current) => ({
      ...current,
      entrances: current.entrances.map((entrance, i) =>
        i === index ? { ...entrance, ...patch } : entrance,
      ),
    }));
  }
  return (
    <div className="passport-editor">
      <button
        type="button"
        className="back-button"
        disabled={busy}
        onClick={() => (dirty ? setLeaving(true) : onBack())}
      >
        <ArrowLeft size={18} aria-hidden="true" /> Wróć do obiektów
      </button>
      <h1 id="object-panel-heading" ref={focusHeading} tabIndex={-1}>
        {stage === "edit"
          ? "Dane Twojego obiektu"
          : stage === "preview"
            ? "Sprawdź przed publikacją"
            : "Dane opublikowane"}
      </h1>
      <p className="passport-caption">
        {stage === "edit"
          ? "Uzupełnij tylko to, co wiesz. Każda cecha może pozostać nieznana. Zmiany nie zapisują się automatycznie."
          : stage === "preview"
            ? "Szkic jest prywatny. Przycisk Opublikuj udostępni informacje wszystkim odwiedzającym."
            : "Widget oraz karta miejsca korzystają z tej samej opublikowanej wersji."}
      </p>
      <p role="status">{message}</p>
      {error ? (
        <p className="passport-warning" role="alert">
          {error}
        </p>
      ) : null}
      {privateConflict ? (
        <section
          className="passport-conflict-review"
          aria-label="Konflikt prywatnego szkicu"
        >
          <h2>Ten szkic zapisano w innej karcie</h2>
          <p>
            Twoje zmiany zostały w formularzu. Możesz porównać je z ostatnio
            zapisanym szkicem. Wczytanie tego szkicu zastąpi zmiany widoczne w
            tym formularzu.
          </p>
          <details>
            <summary>Zobacz zapis z drugiej karty</summary>
            <PassportCard
              passport={previewPassport(
                privateConflict.placeId,
                privateConflict.content,
                user.displayName,
              )}
              preview
            />
          </details>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => {
              setDraft(privateConflict);
              setContent(privateConflict.content);
              setPrivateConflict(null);
              setConflict(null);
              setError("");
              setStage("edit");
              setMessage(
                "Wczytano ostatnio zapisany prywatny szkic. Sprawdź dane przed dalszymi zmianami.",
              );
            }}
          >
            Wczytaj szkic z drugiej karty
          </button>
        </section>
      ) : null}
      {leaving ? (
        <div className="passport-warning" role="alert">
          <p>Masz niezapisane zmiany w tym szkicu.</p>
          <div className="passport-actions">
            <button
              className="button primary"
              type="button"
              disabled={busy}
              onClick={() => save(false, true)}
            >
              Zapisz i wróć
            </button>
            <button
              className="button secondary"
              type="button"
              disabled={busy}
              onClick={onBack}
            >
              Wróć bez zapisywania
            </button>
            <button
              className="text-button"
              type="button"
              onClick={() => setLeaving(false)}
            >
              Kontynuuj edycję
            </button>
          </div>
        </div>
      ) : null}

      {stage === "edit" ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save(true);
          }}
        >
          <fieldset disabled={busy} className="passport-form-body">
            <legend className="sr-only">Edycja informacji o obiekcie</legend>
            <section
              className="passport-form-section"
              aria-label="Podstawowe dane obiektu"
            >
              <h2>Podstawowe dane</h2>
              <label htmlFor={`${prefix}-name`}>
                Nazwa obiektu
                <input
                  id={`${prefix}-name`}
                  value={content.place.name}
                  maxLength={200}
                  onChange={(event) =>
                    placeChange({ name: event.target.value })
                  }
                />
              </label>
              <label htmlFor={`${prefix}-category`}>
                Kategoria
                <select
                  id={`${prefix}-category`}
                  value={content.place.category}
                  onChange={(event) =>
                    placeChange({
                      category: event.target
                        .value as PassportContent["place"]["category"],
                    })
                  }
                >
                  {PASSPORT_CATEGORIES.map((category) => (
                    <option value={category.value} key={category.value}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </label>
              <label htmlFor={`${prefix}-address`}>
                Adres obiektu
                <input
                  id={`${prefix}-address`}
                  value={content.place.address}
                  maxLength={300}
                  onChange={(event) =>
                    placeChange({ address: event.target.value })
                  }
                />
              </label>
              <label htmlFor={`${prefix}-website`}>
                Strona internetowa (opcjonalna)
                <input
                  id={`${prefix}-website`}
                  type="url"
                  placeholder="https://…"
                  value={content.place.website ?? ""}
                  maxLength={2000}
                  onChange={(event) =>
                    placeChange({ website: event.target.value || null })
                  }
                />
              </label>
              <CoordinatesEditor
                key={`place-${draft.draftVersion}`}
                label="Położenie obiektu"
                value={content.place.coordinates}
                onChange={(coordinates) => placeChange({ coordinates })}
              />
            </section>
            <details className="passport-form-section" open>
              <summary>
                <h2>Warunki w obiekcie</h2>
              </summary>
              <p className="passport-caption">
                Jeżeli warunki różnią się przy poszczególnych wejściach, opisz
                je niżej osobno.
              </p>
              <PassportFields
                fields={content.fields}
                onChange={(fields) =>
                  setContent((current) => ({ ...current, fields }))
                }
              />
            </details>
            <section
              className="passport-form-section"
              aria-label="Edycja wejść"
            >
              <h2>Wejścia</h2>
              <p className="passport-caption">
                Nazwij wejście tak, aby odwiedzający mógł je odnaleźć, np. od
                strony ulicy lub dziedzińca.
              </p>
              {content.entrances.length === 0 ? (
                <p>Brak opisanych wejść.</p>
              ) : null}
              {content.entrances.map((entrance, index) => (
                <details
                  className="passport-edit-entrance"
                  key={entrance.id}
                  open
                >
                  <summary>
                    Wejście {index + 1}
                    {entrance.label ? `: ${entrance.label}` : ""}
                  </summary>
                  <label htmlFor={`${prefix}-entry-${entrance.id}`}>
                    Nazwa wejścia {index + 1}
                    <input
                      id={`${prefix}-entry-${entrance.id}`}
                      value={entrance.label}
                      maxLength={160}
                      onChange={(event) =>
                        entranceChange(index, { label: event.target.value })
                      }
                    />
                  </label>
                  <CoordinatesEditor
                    key={`${entrance.id}-${draft.draftVersion}`}
                    label={`Położenie wejścia ${index + 1} (opcjonalne)`}
                    value={entrance.coordinates}
                    onChange={(coordinates) =>
                      entranceChange(index, { coordinates })
                    }
                  />
                  <PassportFields
                    fields={entrance.fields}
                    onChange={(fields) => entranceChange(index, { fields })}
                  />
                  <button
                    type="button"
                    className="text-button passport-remove"
                    onClick={() =>
                      setContent((current) => ({
                        ...current,
                        entrances: current.entrances.filter(
                          (entry) => entry.id !== entrance.id,
                        ),
                      }))
                    }
                  >
                    Usuń wejście {index + 1} ze szkicu
                  </button>
                </details>
              ))}
              <button
                type="button"
                className="button secondary"
                disabled={content.entrances.length >= PASSPORT_MAX_ENTRANCES}
                onClick={() =>
                  setContent((current) => ({
                    ...current,
                    entrances: [
                      ...current.entrances,
                      {
                        id: crypto.randomUUID(),
                        label: "",
                        coordinates: null,
                        fields: emptyPassportFields(),
                      },
                    ],
                  }))
                }
              >
                <Plus size={18} aria-hidden="true" /> Dodaj wejście
              </button>
            </section>
            <div className="passport-editor-actions">
              <p className="passport-caption">
                {dirty
                  ? "Masz niezapisane zmiany."
                  : `Szkic zapisany ${passportDate(draft.updatedAt)}. Widoczny tylko dla Ciebie.`}
              </p>
              <div className="passport-actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => save(false)}
                >
                  <Save size={18} aria-hidden="true" /> Zapisz szkic
                </button>
                <button type="submit" className="button primary">
                  <Eye size={18} aria-hidden="true" /> Zapisz i zobacz podgląd
                </button>
              </div>
            </div>
          </fieldset>
        </form>
      ) : stage === "preview" ? (
        <>
          <PassportCard
            passport={previewPassport(draft.placeId, content, user.displayName)}
            preview
          />
          {conflict ? (
            <section className="passport-conflict-review">
              <h2>W międzyczasie zmieniły się opublikowane dane</h2>
              <p>
                Twój szkic został zachowany. Porównaj obecną wersję i połącz
                zmiany. Potem ponownie sprawdź podgląd.
              </p>
              <details>
                <summary>Zobacz aktualną opublikowaną wersję</summary>
                <PassportCard passport={conflict} />
              </details>
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={rebase}
              >
                Połącz z aktualną wersją
              </button>
            </section>
          ) : null}
          <div className="passport-actions">
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => setStage("edit")}
            >
              Wróć do edycji
            </button>
            <button
              type="button"
              className="button primary"
              disabled={busy || Boolean(conflict)}
              onClick={publish}
            >
              <Upload size={18} aria-hidden="true" />
              {busy ? "Publikujemy…" : "Opublikuj"}
            </button>
          </div>
        </>
      ) : published ? (
        <>
          <PassportCard passport={published} onPlan={onPlan} />
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              setStage("edit");
              setMessage("");
            }}
          >
            Edytuj kolejną wersję
          </button>
        </>
      ) : null}

      {draft.baseRevision > 0 ? (
        <>
          <EmbedCode placeId={draft.placeId} name={content.place.name} />
          <section className="passport-history">
            <button
              type="button"
              className="button secondary"
              aria-expanded={showHistory}
              disabled={busy}
              onClick={loadHistory}
            >
              {showHistory
                ? "Ukryj historię publikacji"
                : "Pokaż historię publikacji"}
            </button>
            {showHistory && history ? (
              <>
                <h2>Historia publikacji</h2>
                {history.revisions.length === 0 ? (
                  <p>Nie ma jeszcze opublikowanych zmian.</p>
                ) : (
                  <ol>
                    {history.revisions.map((revision) => (
                      <li key={revision.revision}>
                        <strong>Wersja {revision.revision}</strong>
                        <p>
                          {revision.author.displayName} ·{" "}
                          {passportDate(revision.publishedAt)}
                        </p>
                        <p>
                          Zmieniono:{" "}
                          {Array.from(
                            new Set(
                              revision.changedFields.map(changedFieldLabel),
                            ),
                          ).join(", ") || "Opis obiektu"}
                          .
                        </p>
                      </li>
                    ))}
                  </ol>
                )}
              </>
            ) : null}
          </section>
        </>
      ) : null}
      <details className="passport-form-section passport-optional-domain">
        <summary>Opcjonalnie: potwierdź stronę obiektu</summary>
        <DomainVerification
          userId={user.id}
          websiteUrl={content.place.website}
        />
      </details>
    </div>
  );
}
