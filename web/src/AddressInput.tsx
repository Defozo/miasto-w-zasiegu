import { useEffect, useId, useRef, useState } from "react";
import { MapPin, Search, Star, X } from "lucide-react";
import { api } from "./api";
import type { FavoritePlace, LocationPoint } from "./types";

export default function AddressInput({
  label,
  value,
  onChange,
  placeholder = "Ulica i numer lub nazwa miejsca",
  resetKey = 0,
  favorites = [],
  onSave,
  onQuery,
  query,
}: {
  label: string;
  value: LocationPoint | null;
  onChange: (point: LocationPoint | null) => void;
  placeholder?: string;
  resetKey?: number;
  favorites?: FavoritePlace[];
  onSave?: (point: LocationPoint) => void;
  onQuery?: (query: string) => void;
  query?: string;
}) {
  const id = useId(),
    lastId = useRef(value?.id);
  const input = useRef<HTMLInputElement>(null);
  const field = useRef<HTMLDivElement>(null);
  const [draftText, setText] = useState(value?.label || "");
  const text = query ?? draftText;
  const [results, setResults] = useState<LocationPoint[]>([]);
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [active, setActive] = useState(-1);
  const [completedQuery, setCompletedQuery] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!field.current?.contains(e.target as Node)) {
        setOpen(false);
        setActive(-1);
      }
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open]);
  const normalized = text.trim().toLocaleLowerCase("pl");
  const savedSuggestions = favorites
    .filter(
      (f) =>
        !normalized ||
        `${f.label} ${f.point.label}`
          .toLocaleLowerCase("pl")
          .includes(normalized),
    )
    .slice(0, 6)
    .map((f) => ({
      point: f.point,
      label: f.label,
      saved: true,
      id: `saved-${f.id}`,
    }));
  const suggestions = [
    ...savedSuggestions,
    ...results
      .filter((p) => !savedSuggestions.some((f) => f.point.id === p.id))
      .map((point) => ({
        point,
        label: point.label,
        saved: false,
        id: point.id,
      })),
  ];
  const showSuggestions =
    open && !value && (text.trim().length >= 2 || savedSuggestions.length > 0);
  useEffect(() => {
    if (active >= 0)
      document
        .getElementById(`${id}-${active}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [active, id]);
  useEffect(() => {
    if (value && value.id !== lastId.current) {
      setText(value.label);
      setOpen(false);
    } else if (!value && lastId.current) {
      setText("");
      setOpen(false);
    }
    lastId.current = value?.id;
  }, [value]);
  useEffect(() => {
    setText(value?.label || "");
    setOpen(false);
  }, [resetKey]);
  useEffect(() => {
    setCompletedQuery(null);
    if (!open || text.trim().length < 2 || value) {
      setResults([]);
      setBusy(false);
      return;
    }
    let cancelled = false;
    setBusy(true);
    setError("");
    setActive(-1);
    const timer = setTimeout(async () => {
      try {
        const data = await api<{ locations: LocationPoint[] }>(
          `/locations?q=${encodeURIComponent(text)}&limit=8`,
        );
        if (!cancelled) {
          setResults(data.locations);
          setCompletedQuery(text);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [text, open, value]);
  function choose(point: LocationPoint) {
    setText(point.label);
    onChange(point);
    setOpen(false);
    setActive(-1);
  }
  return (
    <div
      className="address-field"
      ref={field}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          // Let a button receive its click before collapsing the list changes its position.
          if (
            e.relatedTarget instanceof Element &&
            e.relatedTarget.closest("button,a,summary")
          )
            return;
          setOpen(false);
          setActive(-1);
        }
      }}
    >
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <div className={`address-input ${value ? "is-chosen" : ""}`}>
        <Search size={18} />
        <input
          id={id}
          ref={input}
          role="combobox"
          autoComplete="off"
          aria-expanded={showSuggestions}
          aria-autocomplete="list"
          aria-controls={showSuggestions ? `${id}-options` : undefined}
          aria-activedescendant={
            showSuggestions && active >= 0 && suggestions[active]
              ? `${id}-${active}`
              : undefined
          }
          placeholder={placeholder}
          value={text}
          onChange={(e) => {
            lastId.current = undefined;
            setText(e.target.value);
            onQuery?.(e.target.value);
            setResults([]);
            setError("");
            onChange(null);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => {
            if (!value) setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape" && showSuggestions) {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              setActive(-1);
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((n) => Math.min(n + 1, suggestions.length - 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((n) => (suggestions.length ? Math.max(n - 1, 0) : -1));
            }
            if (e.key === "Enter" && showSuggestions && suggestions[active]) {
              e.preventDefault();
              choose(suggestions[active].point);
            }
          }}
        />
        {text && (
          <button
            type="button"
            className="address-clear"
            aria-label={`Wyczyść: ${label}`}
            onClick={() => {
              setText("");
              onQuery?.("");
              setResults([]);
              onChange(null);
              setOpen(false);
              setActive(-1);
              input.current?.focus();
            }}
          >
            <X size={16} />
          </button>
        )}
      </div>
      <span className="sr-only address-search-status" role="status" aria-live="polite" aria-atomic="true">
        {showSuggestions && !error
          ? busy
            ? "Szukamy adresu…"
            : completedQuery === text
              ? suggestions.length
                ? `Liczba podpowiedzi: ${suggestions.length}. Użyj strzałek, aby wybrać adres.`
                : "Nie znaleźliśmy adresu w Krakowie. Sprawdź pisownię lub wpisz pobliskie miejsce."
              : ""
          : ""}
      </span>
      {value?.precision === "approximate" && (
        <small className="field-help">
          Orientacyjny punkt. Sprawdź dokładne wejście.
        </small>
      )}
      {value?.disambiguationHint && (
        <small className="field-help">{value.disambiguationHint}</small>
      )}
      {value && onSave && (
        <button
          type="button"
          className="address-save"
          onClick={() => onSave(value)}
          aria-label={`Zapisz miejsce: ${label}`}
        >
          <Star size={14} />
          Zapisz miejsce
        </button>
      )}
      {!value && text.trim().length >= 2 && !showSuggestions && (
        <small className="field-help">
          Wróć do pola i wybierz adres z podpowiedzi.
        </small>
      )}
      {showSuggestions && (
        <div className="address-suggestions">
          {savedSuggestions.length > 0 && (
            <p className="address-suggestion-note">Twoje zapisane miejsca</p>
          )}
          {busy && <p>Szukamy adresu…</p>}
          {error && <p role="alert">{error}</p>}
          <ul
            id={`${id}-options`}
            role="listbox"
            aria-label={`Podpowiedzi: ${label}`}
          >
            {suggestions.map(
              ({ point: p, label: displayLabel, saved, id: key }, i) => (
                <li
                  id={`${id}-${i}`}
                  key={key}
                  role="option"
                  aria-selected={i === active}
                >
                  <button
                    type="button"
                    tabIndex={0}
                    onClick={() => choose(p)}
                    className={active === i ? "active" : ""}
                  >
                    {saved ? <Star size={17} /> : <MapPin size={17} />}
                    <span className={saved ? "saved-option-label" : undefined}>
                      {displayLabel}
                      <small>
                        {saved
                          ? p.label
                          : p.kind === "street"
                            ? "Ulica, punkt orientacyjny"
                            : p.kind === "address"
                              ? "Adres"
                              : "Miejsce"}
                      </small>
                      {p.disambiguationHint && (
                        <small>{p.disambiguationHint}</small>
                      )}
                    </span>
                  </button>
                </li>
              ),
            )}
          </ul>
          {!busy &&
            !error &&
            !suggestions.length &&
            text.trim().length >= 2 && (
              <p>
                Nie znaleźliśmy adresu w Krakowie. Sprawdź pisownię lub wpisz
                pobliskie miejsce.
              </p>
            )}
        </div>
      )}
    </div>
  );
}
