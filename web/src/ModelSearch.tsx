import { useEffect, useRef, useState } from "react";
import { Search, BookOpen, Check, ExternalLink } from "lucide-react";
import { api } from "./api";
import type { Wheelchair } from "./types";
type Job = {
  id: string;
  status: "searching" | "complete" | "not_found" | "failed";
  message: string;
  wheelchair?: Wheelchair;
  cached?: boolean;
};
export default function ModelSearch({
  models,
  onWidth,
  currentWidth,
  hasUnsavedChanges,
  disabled = false,
}: {
  models: Wheelchair[];
  onWidth: (width: string) => void;
  currentWidth: string;
  hasUnsavedChanges: boolean;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState(""),
    [discovered, setDiscovered] = useState<Wheelchair[]>([]),
    [selected, setSelected] = useState<Wheelchair | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [job, setJob] = useState<Job | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [keyboardNote, setKeyboardNote] = useState("");
  const [appliedWidth, setAppliedWidth] = useState<string | null>(null);
  const request = useRef(0);
  useEffect(() => {
    api<{ wheelchairs: Wheelchair[] }>("/wheelchairs/discoveries")
      .then((d) => setDiscovered(d.wheelchairs))
      .catch(() => {});
    return () => {
      request.current++;
    };
  }, []);
  useEffect(() => {
    if (!job || job.status !== "searching") return;
    let cancelled = false;
    const started = Date.now();
    const timer = setInterval(async () => {
      if (Date.now() - started > 180000) {
        setError("To trwa dłużej niż zwykle. Wróć do wyszukiwarki za chwilę.");
        setJob(null);
        return;
      }
      try {
        const data = await api<Job>(`/wheelchairs/search/${job.id}`);
        if (cancelled) return;
        setJob(data);
        if (data.wheelchair) {
          setSelected(data.wheelchair);
          setConfirmed(false);
          setDiscovered((xs) => [
            data.wheelchair!,
            ...xs.filter((x) => x.name !== data.wheelchair!.name),
          ]);
        }
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message);
          setJob(null);
        }
      }
    }, 2500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [job?.id, job?.status]);
  const all = [
    ...models,
    ...discovered.filter((d) => !models.some((m) => m.id === d.id)),
  ];
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  const matches = all
    .filter((m) =>
      normalize(`${m.manufacturer} ${m.name}`).includes(normalize(query)),
    )
    .slice(0, 8);
  async function search() {
    if (
      disabled ||
      busy ||
      job?.status === "searching" ||
      query.trim().length < 3
    )
      return;
    const id = ++request.current;
    setBusy(true);
    setError("");
    setSelected(null);
    setKeyboardNote("");
    setAppliedWidth(null);
    try {
      const data = await api<Job>("/wheelchairs/search", { query });
      if (id !== request.current) return;
      setJob(data);
      if (data.wheelchair) {
        setSelected(data.wheelchair);
        setConfirmed(false);
      }
    } catch (e) {
      if (id === request.current) setError((e as Error).message);
    } finally {
      if (id === request.current) setBusy(false);
    }
  }
  function chooseModel(model: Wheelchair) {
    if (disabled) return;
    setSelected(model);
    request.current++;
    setJob(null);
    setBusy(false);
    setConfirmed(false);
    setAppliedWidth(null);
    setKeyboardNote(
      `Wybrano ${model.name}. Sprawdź opis poniżej. Twój wpisany pomiar nie został zmieniony.`,
    );
    setError("");
  }
  const applied =
    !!selected &&
    appliedWidth !== null &&
    appliedWidth === currentWidth &&
    appliedWidth === String(selected.widthCm);
  return (
    <section className="model-search">
      <h2>Znajdź swój wózek</h2>
      <p className="field-help">
        Wpisz producenta i model, aby przeszukać zapisany katalog. Osobny
        przycisk pozwala poszukać dokumentacji w internecie.
      </p>
      <label className="field-label" htmlFor="model-search">
        Producent i model wózka
      </label>
      <div className="search-field">
        <Search size={20} />
        <input
          id="model-search"
          type="search"
          placeholder="Np. WHILL Model C2"
          value={query}
          disabled={disabled}
          maxLength={100}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            if (event.nativeEvent.isComposing) return;
            // This search lives inside the profile form. Enter must never save
            // the profile or launch paid research as an implicit action.
            event.preventDefault();
            if (disabled) return;
            if (matches.length === 1 && query.trim()) chooseModel(matches[0]);
            else
              setKeyboardNote(
                matches.length
                  ? "Wybierz model z listy poniżej. Klawisz Tab przeniesie Cię do pierwszego wyniku."
                  : "Nie ma takiego modelu w zapisanym katalogu. Możesz użyć przycisku wyszukiwania dokumentacji lub wpisać własny pomiar.",
              );
          }}
          onChange={(e) => {
            request.current++;
            setJob(null);
            setBusy(false);
            setError("");
            setQuery(e.target.value);
            setSelected(null);
            setConfirmed(false);
            setKeyboardNote("");
            setAppliedWidth(null);
          }}
        />
      </div>
      <ul className="model-options">
        {matches.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => chooseModel(m)}
            >
              <BookOpen size={19} />
              <span>
                <strong>{m.name}</strong>
                <small>{m.manufacturer}</small>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {query.trim().length >= 3 && (
        <button
          type="button"
          className="button secondary full"
          disabled={disabled || busy || job?.status === "searching"}
          onClick={search}
        >
          {busy || job?.status === "searching" ? (
            <>
              <span className="loader" />
              Sprawdzamy dokumentację…
            </>
          ) : (
            <>
              Poszukaj w dokumentacji producenta <Search size={18} />
            </>
          )}
        </button>
      )}
      <p className="privacy-note">
        Do wyszukiwarki internetowej i asystenta AI trafia wyłącznie wpisana
        nazwa modelu.
      </p>
      <p className="model-keyboard-note" aria-live="polite" aria-atomic="true">
        {keyboardNote}
      </p>
      {job && (
        <p role="status" className="field-help">
          {job.message}
        </p>
      )}
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      {selected && (
        <div className="model-result">
          <h3>{selected.name}</h3>
          <strong>
            {selected.status === "conflict"
              ? "Sprzeczne dane o szerokości"
              : selected.widthLabel}
          </strong>
          <p>
            {selected.status === "match"
              ? "Wymiary zgadzają się w porównanych źródłach. Nadal sprawdź konfigurację swojego egzemplarza."
              : selected.status === "conflict"
                ? "Dokumenty podają różne wartości. Najlepiej zmierzyć własny wózek."
                : selected.status === "discovered"
                  ? "Parametry odczytał asystent z dokumentacji. Sprawdź model, wariant i akcesoria."
                  : "Dokumentacja nie określa jednoznacznie tego wariantu."}
          </p>
          {typeof selected.notes === "string" && <p>{selected.notes}</p>}
          {selected.status === "conflict" && (
            <p className="model-unusable-width">
              Wpis katalogowy: {selected.widthLabel}. Nie używamy go do
              uzupełnienia profilu.
            </p>
          )}
          {typeof selected.widthCm !== "number" &&
            selected.status !== "conflict" && (
              <p className="model-unusable-width">
                Nie wybieramy jednej liczby z zakresu ani wzoru. Zachowujemy
                Twój pomiar{currentWidth ? `: ${currentWidth} cm` : ""}.
              </p>
            )}
          {selected.parameters?.map((p, i) => (
            <div className="model-parameter" key={i}>
              <span>{p.label}</span>
              <strong>{p.value}</strong>
              <a href={p.sourceUrl} target="_blank" rel="noreferrer">
                Dokument <ExternalLink size={12} />
              </a>
            </div>
          ))}
          {(
            selected.sources || [
              {
                title: "Dokumentacja wymiarów",
                url: selected.manufacturerSourceUrl || selected.sourceUrl,
              },
            ]
          )
            .filter((x) => x.url)
            .map((s, i) => (
              <a
                key={i}
                className="model-source"
                href={s.url}
                target="_blank"
                rel="noreferrer"
              >
                {s.title} ↗
              </a>
            ))}
          {selected.checkedAt && (
            <small>
              Sprawdzenie:{" "}
              {new Date(selected.checkedAt).toLocaleDateString("pl-PL")}
            </small>
          )}
          {typeof selected.widthCm === "number" &&
            selected.status !== "conflict" && (
              <>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    disabled={disabled}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  <span>
                    Sprawdziłem/am, że wymiar dotyczy mojego wózka z
                    zamontowanym wyposażeniem.
                  </span>
                </label>
                <button
                  type="button"
                  className="button secondary full"
                  disabled={disabled || !confirmed || applied}
                  onClick={() => {
                    if (
                      disabled ||
                      !confirmed ||
                      applied ||
                      typeof selected.widthCm !== "number"
                    )
                      return;
                    const width = String(selected.widthCm);
                    onWidth(width);
                    setAppliedWidth(width);
                    setKeyboardNote("");
                  }}
                >
                  <Check size={17} />
                  {applied
                    ? `Szerokość ${selected.widthCm} cm jest w formularzu`
                    : `Użyj szerokości ${selected.widthCm} cm`}
                </button>
                <p
                  className="model-apply-note"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {applied
                    ? disabled
                      ? `Szerokość ${selected.widthCm} cm jest w formularzu. Trwa zapis preferencji.`
                      : hasUnsavedChanges
                        ? `Wpisano ${selected.widthCm} cm do pola szerokości. To jeszcze nie zapis preferencji. Sprawdź pozostałe pola i wybierz „Zapisz preferencje”.`
                        : `Szerokość ${selected.widthCm} cm znajduje się w zapisanych preferencjach.`
                    : ""}
                </p>
              </>
            )}
        </div>
      )}
    </section>
  );
}
