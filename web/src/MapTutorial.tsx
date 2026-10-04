import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Armchair,
  Bookmark,
  Check,
  Compass,
  Info,
  MapPin,
  Navigation,
  Search,
  SlidersHorizontal,
  Sparkles,
  Utensils,
} from "lucide-react";
import { readLocal, writeLocal } from "./api";
import "./map-tutorial.css";

export const MAP_TUTORIAL_KEY = "przejscie-map-tutorial-v1";
type TutorialResult = "completed" | "skipped";

export function useMapTutorial(autoStart: boolean) {
  const [seen, setSeen] = useState(() =>
    ["completed", "skipped"].includes(readLocal<string>(MAP_TUTORIAL_KEY, "")),
  );
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (autoStart && !seen) setOpen(true);
  }, [autoStart, seen]);
  return {
    open,
    start: () => setOpen(true),
    finish: (result: TutorialResult) => {
      // The in-memory flag also works when browser storage is unavailable.
      setSeen(true);
      setOpen(false);
      writeLocal(MAP_TUTORIAL_KEY, result);
    },
  };
}

const steps = [
  {
    label: "Po swojemu",
    title: "Twoje miasto. Twoje tempo.",
    description:
      "Kawa, spacer, spotkanie? Zacznij od swoich potrzeb. U góry zmienisz zestaw potrzeb, a w filtrach wybierzesz ważne dla Ciebie udogodnienia.",
    tip: "Cztery krótkie kroki. Potem miasto jest Twoje do odkrycia.",
    target: "needs",
    Icon: SlidersHorizontal,
  },
  {
    label: "Znajdź miejsce",
    title: "Na co masz dziś ochotę?",
    description:
      "Wpisz nazwę miejsca lub adres. Możesz też wybrać jedzenie, toaletę, odpoczynek albo parking. Wybierz punkt na mapie lub miejsce z listy.",
    tip: "Wolisz tekst? Te same miejsca znajdziesz na liście obok mapy.",
    target: "search",
    Icon: Search,
  },
  {
    label: "Sprawdź warunki",
    title: "Mniej niespodzianek po drodze.",
    description:
      "Otwórz miejsce i sprawdź schody, progi, wejście czy toaletę. Zwróć uwagę na źródło, datę i potwierdzenie informacji. To Ty oceniasz, czy miejsce pasuje do Twoich potrzeb.",
    tip: "Brak danych nie oznacza braku bariery.",
    target: "place",
    Icon: Info,
  },
  {
    label: "Zaplanuj i ruszaj",
    title: "Od dobrego miejsca do planu.",
    description:
      "W szczegółach miejsca wybierz „Nawiguj” i podaj początek trasy. Sprawdź jej warunki przed wyjściem. Ciekawe miejsca zapisuj zakładką, by łatwo do nich wrócić.",
    tip: "Przycisk „Przewodnik po mapie” zawsze pozwoli tu wrócić.",
    target: "saved",
    Icon: Navigation,
  },
] as const;

function TutorialArtwork({ step }: { step: number }) {
  return (
    <div className={`map-tour-art map-tour-art-${step}`} aria-hidden="true">
      <svg className="map-tour-streets" viewBox="0 0 420 176" fill="none">
        <path
          d="M-20 112 109 32 222 102 337 28 454 101M65-20 134 62 66 166M261-20 214 56 321 182M-20 42 111 127 209 64 422 165"
          stroke="currentColor"
          strokeWidth="17"
        />
        <path
          d="M-20 112 109 32 222 102 337 28 454 101M65-20 134 62 66 166M261-20 214 56 321 182M-20 42 111 127 209 64 422 165"
          stroke="#fbfaf4"
          strokeWidth="10"
        />
        <path
          className="map-tour-route"
          d="M78 126 135 89Q147 81 160 88L214 121Q224 128 234 119L327 57"
          stroke="#426638"
          strokeWidth="4"
          strokeDasharray="5 7"
          strokeLinecap="round"
        />
      </svg>
      <div className="map-tour-garden map-tour-garden-one" />
      <div className="map-tour-garden map-tour-garden-two" />
      {step === 0 && (
        <>
          <span className="map-tour-pin map-tour-pin-start">
            <MapPin size={22} />
          </span>
          <span className="map-tour-pin map-tour-pin-end">
            <Utensils size={22} />
          </span>
          <div className="map-tour-floating-label">
            <Sparkles size={16} /> Kraków, po Twojemu
          </div>
          <span className="map-tour-small-pin">
            <Armchair size={18} />
          </span>
        </>
      )}
      {step === 1 && (
        <div className="map-tour-search-example">
          <div>
            <Search size={19} />
            <span>Twój następny dobry adres</span>
            <MapPin size={18} />
          </div>
          <div className="map-tour-example-chips">
            <span>
              <Utensils size={15} /> Jedzenie
            </span>
            <span>
              <Armchair size={15} /> Odpoczynek
            </span>
          </div>
        </div>
      )}
      {step === 2 && (
        <div className="map-tour-fact-example">
          <small>PRZYKŁAD INFORMACJI</small>
          <div>
            <span>Szerokość wejścia</span>
            <strong>90 cm</strong>
          </div>
          <div>
            <span>Winda</span>
            <strong className="map-tour-unknown">
              <Info size={13} /> Brak danych
            </strong>
          </div>
          <span className="map-tour-example-source">
            Zawsze sprawdź źródło i datę
          </span>
        </div>
      )}
      {step === 3 && (
        <>
          <span className="map-tour-pin map-tour-pin-start">A</span>
          <span className="map-tour-pin map-tour-pin-end">B</span>
          <div className="map-tour-floating-label">
            <Bookmark size={17} /> Miejsca warte powrotu
          </div>
          <span className="map-tour-small-pin">
            <Navigation size={18} />
          </span>
        </>
      )}
    </div>
  );
}

interface Spotlight {
  left: number;
  top: number;
  width: number;
  height: number;
}

export default function MapTutorial({
  onFinish,
}: {
  onFinish: (result: TutorialResult) => void;
}) {
  const [step, setStep] = useState(0);
  const [spotlight, setSpotlight] = useState<Spotlight | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const card = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const scrollArea = useRef<HTMLDivElement>(null);
  const current = steps[step];
  const Icon = current.Icon;

  useEffect(() => {
    const prior =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const element = dialog.current;
    element?.showModal();
    heading.current?.focus({ preventScroll: true });
    return () => {
      element?.close();
      const fallback = document.querySelector<HTMLElement>(
        '[data-map-tour="replay"]',
      );
      (prior?.isConnected && prior !== document.body ? prior : fallback)?.focus(
        { preventScroll: true },
      );
    };
  }, []);

  useLayoutEffect(() => {
    heading.current?.focus({ preventScroll: true });
    scrollArea.current?.scrollTo({ top: 0 });
    const anchor = document.querySelector<HTMLElement>(
      `[data-map-tour="${current.target}"]`,
    );
    const target = current.target === "search"
      ? anchor?.querySelector<HTMLElement>(".address-field") || anchor
      : anchor;
    // Keep the spotlight aligned after resizing, zooming, or a wrapped status banner.
    function measure() {
      if (!target || !target.getClientRects().length) {
        setSpotlight(null);
        return;
      }
      const rect = target.getBoundingClientRect();
      // Mobile search floats above the sheet and is not clipped by its bounds.
      const panel = anchor && getComputedStyle(anchor).position === "fixed"
        ? undefined
        : target.closest(".content-panel")?.getBoundingClientRect();
      const left = Math.max(8, rect.left - 7);
      const top = Math.max(8, rect.top - 7, panel?.top ?? 0);
      const right = Math.min(innerWidth - 8, rect.right + 7);
      const bottom = Math.min(
        innerHeight - 8,
        rect.bottom + 7,
        panel?.bottom ?? innerHeight,
      );
      const cardRect = card.current?.getBoundingClientRect();
      const hiddenByCard =
        cardRect &&
        left < cardRect.right &&
        right > cardRect.left &&
        top < cardRect.bottom &&
        bottom > cardRect.top;
      setSpotlight(
        right > left && bottom > top && !hiddenByCard
          ? { left, top, width: right - left, height: bottom - top }
          : null,
      );
    }
    const frame = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(document.documentElement);
    if (target) observer.observe(target);
    if (card.current) observer.observe(card.current);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [current.target]);

  return (
    <dialog
      ref={dialog}
      className="map-tour-dialog"
      aria-label="Przewodnik po mapie"
      aria-describedby="map-tour-description"
      onCancel={(event) => {
        event.preventDefault();
        onFinish("skipped");
      }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const buttons = Array.from(
          event.currentTarget.querySelectorAll<HTMLButtonElement>(
            "button:not(:disabled)",
          ),
        );
        const first = buttons[0],
          last = buttons.at(-1);
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === heading.current)
        ) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
    >
      <div
        className={spotlight ? "map-tour-spotlight" : "map-tour-shade"}
        style={spotlight ?? undefined}
        aria-hidden="true"
      />
      <section className="map-tour-card" data-step={step} ref={card}>
        <header className="map-tour-topline">
          <span>
            <Compass size={18} aria-hidden="true" /> POZNAJ SWOJĄ MAPĘ
          </span>
          <button
            type="button"
            className="map-tour-skip"
            onClick={() => onFinish("skipped")}
          >
            Pomiń tutorial
          </button>
        </header>
        <div className="map-tour-scroll" ref={scrollArea}>
          <TutorialArtwork key={step} step={step} />
          <div className="map-tour-copy">
            <div className="map-tour-step-label">
              <Icon size={16} aria-hidden="true" />
              <span>{current.label}</span>
              <span>
                {step + 1} / {steps.length}
              </span>
            </div>
            <h2
              ref={heading}
              tabIndex={-1}
              aria-describedby="map-tour-description"
            >
              {current.title}
            </h2>
            <p id="map-tour-description">{current.description}</p>
            <div
              className={`map-tour-tip ${step === 2 ? "map-tour-tip-evidence" : ""}`}
            >
              <Info size={17} aria-hidden="true" />
              <span>{current.tip}</span>
            </div>
          </div>
        </div>
        <footer className="map-tour-footer">
          <div className="map-tour-progress" aria-label="Kroki przewodnika">
            {steps.map((item, index) => (
              <button
                key={item.label}
                type="button"
                aria-label={`Krok ${index + 1}: ${item.label}`}
                aria-current={index === step ? "step" : undefined}
                onClick={() => setStep(index)}
              >
                <span className={index < step ? "is-complete" : ""}>
                  {index < step ? (
                    <Check size={13} aria-hidden="true" />
                  ) : (
                    `0${index + 1}`
                  )}
                </span>
              </button>
            ))}
          </div>
          <div className="map-tour-actions">
            {step > 0 ? (
              <button
                type="button"
                className="map-tour-back"
                onClick={() => setStep((index) => index - 1)}
              >
                <ArrowLeft size={17} aria-hidden="true" /> Wstecz
              </button>
            ) : (
              <span className="map-tour-duration">
                Około minuty.
                <br />W Twoim tempie.
              </span>
            )}
            <button
              type="button"
              className="map-tour-next"
              onClick={() =>
                step === steps.length - 1
                  ? onFinish("completed")
                  : setStep((index) => index + 1)
              }
            >
              {step === steps.length - 1
                ? "Odkrywam Kraków"
                : step === 0
                  ? "Pokaż mi mapę"
                  : "Dalej"}
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          </div>
        </footer>
      </section>
    </dialog>
  );
}
