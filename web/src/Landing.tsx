import { useEffect, useState } from "react";
import { m } from "motion/react";
import {
  ArrowRight,
  ArrowUpRight,
  CircleHelp,
  DoorOpen,
  Footprints,
  MapPin,
  Monitor,
  Pause,
  Play,
  Plus,
  Route,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Watch,
  Armchair,
  Ruler,
  Layers,
  MoveUpRight,
} from "lucide-react";
import BrandName from "./BrandName";
import BrandMark from "./BrandMark";
import ProductVideo from "./ProductVideo";
import { Reveal, useCalmMotion } from "./MotionPolicy";
import "./landing.css";

const details = [
  {
    id: "entrance",
    label: "Wejście",
    Icon: DoorOpen,
    title: "Dobry początek? Poznać wejście.",
    description:
      "Nawet jeden stopień może zmienić plan. Sprawdź, co wiadomo o wejściu, zanim ruszysz w drogę.",
    facts: [
      {
        label: "Wejście bez stopni",
        value: "Zgłoszenie użytkownika",
        state: "reported",
      },
      { label: "Szerokość drzwi", value: "Brak pomiaru", state: "unknown" },
      { label: "Winda", value: "Do sprawdzenia", state: "unknown" },
    ],
  },
  {
    id: "surface",
    label: "Nawierzchnia",
    Icon: Layers,
    title: "Liczy się też to, co pod kołami.",
    description:
      "Kostka, asfalt czy żwir? Rodzaj nawierzchni i stan chodnika pomagają ocenić, czy odcinek Ci odpowiada.",
    facts: [
      {
        label: "Rodzaj nawierzchni",
        value: "Kostka według mapy",
        state: "reported",
      },
      { label: "Stan chodnika", value: "Brak obserwacji", state: "unknown" },
      { label: "Nachylenie", value: "Brak pomiaru", state: "unknown" },
    ],
  },
  {
    id: "rest",
    label: "Odpoczynek",
    Icon: Armchair,
    title: "Zostaw miejsce na przerwę.",
    description:
      "Ławka, toaleta, spokojny przystanek. Zobacz informacje, które pomogą zaplanować wyjście w Twoim tempie.",
    facts: [
      { label: "Ławka", value: "Oznaczona na mapie", state: "reported" },
      {
        label: "Oparcie i podłokietniki",
        value: "Brak informacji",
        state: "unknown",
      },
      { label: "Dostęp do toalety", value: "Do sprawdzenia", state: "unknown" },
    ],
  },
];

function DetailPreview() {
  const [selected, setSelected] = useState(0);
  const reduced = useCalmMotion();
  const detail = details[selected];
  return (
    <div className="lp-preview">
      <div className="lp-preview-top">
        <span className="lp-kicker">Małe szczegóły. Wielka różnica.</span>
        <span className="lp-demo-label">Przykładowe dane</span>
      </div>
      <div
        className="lp-preview-options"
        role="group"
        aria-label="Wybierz rodzaj informacji"
      >
        {details.map(({ id, label, Icon }, index) => (
          <button
            key={id}
            type="button"
            aria-pressed={selected === index}
            aria-controls="lp-detail-example"
            onClick={() => setSelected(index)}
          >
            <Icon size={19} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
      <div
        className="lp-preview-grid"
        id="lp-detail-example"
        role="region"
        aria-label="Przykładowe informacje o miejscu"
        aria-live="polite"
        aria-atomic="true"
      >
        <m.div
          key={detail.id}
          initial={{ opacity: reduced ? 1 : 0.4, y: reduced ? 0 : 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduced ? 0 : 0.24 }}
          className="lp-preview-copy"
        >
          <span
            className={`lp-feature-icon lp-feature-${detail.id}`}
            aria-hidden="true"
          >
            <detail.Icon size={30} strokeWidth={1.65} />
          </span>
          <h3>{detail.title}</h3>
          <p>{detail.description}</p>
        </m.div>
        <div className="lp-facts-example">
          {detail.facts.map((fact) => (
            <div className="lp-fact-example" key={fact.label}>
              <span>{fact.label}</span>
              <span className={`lp-fact-value ${fact.state}`}>
                {fact.state === "unknown" ? (
                  <CircleHelp size={15} aria-hidden="true" />
                ) : (
                  <MapPin size={15} aria-hidden="true" />
                )}
                {fact.value}
              </span>
            </div>
          ))}
          <p>
            <CircleHelp size={15} aria-hidden="true" /> Przykład widoku, nie
            opis konkretnego miejsca. Zgłoszenie lub wpis na mapie nie jest
            potwierdzeniem dostępności.
          </p>
        </div>
      </div>
    </div>
  );
}

function CityScene({ paused }: { paused: boolean }) {
  return (
    <div className={`lp-city-scene${paused ? " is-paused" : ""}`}>
      <div className="lp-scene-label">
        <MapPin size={15} aria-hidden="true" /> Kraków, po swojemu{" "}
        <span aria-hidden="true">↗</span>
      </div>
      <picture className="lp-city-picture">
        <source
          type="image/webp"
          srcSet="/brand/krakow-city-720.webp 720w, /brand/krakow-city-1440.webp 1440w"
          sizes="(max-width: 700px) 100vw, 55vw"
        />
        <img
          src="/brand/krakow-city-1440.webp"
          width="1536"
          height="1024"
          fetchPriority="high"
          alt="Artystyczna miniatura Krakowa: kamienice, wieże kościoła Mariackiego, zieleń i spacerowicze, w tym osoba na wózku i osoba z wózkiem dziecięcym. To ilustracja, nie mapa."
        />
      </picture>
      <svg
        className="lp-scene-route"
        viewBox="0 0 600 450"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M30 210V110Q30 65 75 65H170"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="3 7"
        />
        <path
          className="lp-route-dash"
          d="M480 330H545Q575 330 575 365V395H420"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="3 9"
        />
        <circle cx="30" cy="210" r="5" fill="currentColor" />
        <circle cx="420" cy="395" r="5" fill="currentColor" />
      </svg>
      <div className="lp-scene-sticker">
        <DoorOpen size={21} aria-hidden="true" />
        <span>
          Każde wejście
          <br />
          <strong>ma znaczenie.</strong>
        </span>
      </div>
      <div className="lp-scene-card">
        <span className="lp-scene-card-icon">
          <Route size={24} aria-hidden="true" />
        </span>
        <span>
          <strong>Twoje potrzeby. Twój plan.</strong>
          <small>Sprawdź szczegóły, zanim ruszysz.</small>
        </span>
        <ArrowUpRight size={20} aria-hidden="true" />
      </div>
    </div>
  );
}

const faqs = [
  {
    question: "Dla kogo jest Miasto w zasięgu?",
    answer:
      "Dla osób poruszających się na wózku, z balkonikiem, o kulach lub z wózkiem dziecięcym. Także dla każdego, kto chce ominąć schody, nierówną nawierzchnię albo trudny odcinek. Potrzeby określasz samodzielnie, bez podawania diagnozy.",
  },
  {
    question: "Czy oznaczona trasa na pewno będzie przejezdna?",
    answer:
      "Nie możemy tego zagwarantować. Warunki w mieście się zmieniają, a część danych jest niepełna. Prototyp pokazuje informacje o barierach i ich źródła oraz zaznacza niewiadome. Przed wyjściem sprawdź szczegóły istotne dla Ciebie, szczególnie działanie wind i dostępność wejścia.",
  },
  {
    question: "Skąd pochodzą informacje o dostępności?",
    answer:
      "Korzystamy z OpenStreetMap, danych miasta oraz opisów i zgłoszeń użytkowników. Przy miejscach pokazujemy pochodzenie i dostępne daty informacji. Wpis na mapie i zgłoszenie nie są audytem terenowym. Brak informacji o przeszkodzie nie oznacza braku przeszkody.",
  },
  {
    question: "Czy muszę instalować aplikację?",
    answer:
      "Nie. Prototyp działa w przeglądarce na telefonie i komputerze. Są też testowe wersje APK na Androida i Wear OS. Wersja na zegarek nie została jeszcze przetestowana na fizycznym urządzeniu. Nie są to wydania ze sklepów z aplikacjami.",
  },
  {
    question: "Czy Miasto w zasięgu zadzwoni za mnie do instytucji?",
    answer:
      "Automatyczne połączenia z instytucjami nie są włączone w tym prototypie. Rozwijamy pomysł asystenta, który pomaga ustalić konkretne szczegóły wejścia. Do czasu jego zweryfikowania informacje najlepiej potwierdzić bezpośrednio z danym miejscem.",
  },
];

export default function Landing() {
  useEffect(() => {
    if (location.hash === "#aplikacje") {
      const section = document.getElementById("aplikacje");
      section?.focus({ preventScroll: true });
      section?.scrollIntoView();
    }
  }, []);
  const [paused, setPaused] = useState(false);
  const reduced = useCalmMotion();
  return (
    <div className="landing-page">
      <a className="lp-skip" href="#lp-main">
        Przejdź do treści
      </a>
      <header className="lp-header lp-container">
        <a
          className="lp-brand"
          href="/"
          aria-label="Miasto w zasięgu, strona główna"
        >
          <BrandMark />
          <BrandName />
        </a>
        <nav aria-label="Nawigacja główna">
          <a href="#film">Film</a>
          <a href="#jak-dziala">Jak to działa</a>
          <a href="#dostepnosc">Dostępność</a>
          <a href="/cennik">Cennik i wsparcie</a>
          <a className="lp-nav-cta" href="/app">
            Otwórz mapę <ArrowUpRight size={18} aria-hidden="true" />
          </a>
        </nav>
      </header>
      <main id="lp-main">
        <section
          className="lp-hero lp-container"
          aria-labelledby="lp-hero-title"
        >
          <Reveal className="lp-hero-copy">
            <div className="lp-eyebrow">
              <span aria-hidden="true" /> Mniej niewiadomych przed wyjściem
            </div>
            <h1 id="lp-hero-title">
              Kraków,
              <br />w Twoim
              <br />
              <span>
                tempie
                <svg viewBox="0 0 330 18" fill="none" aria-hidden="true">
                  <path
                    d="M5 12Q165 0 325 10"
                    stroke="currentColor"
                    strokeWidth="9"
                    strokeLinecap="round"
                  />
                </svg>
                .
              </span>
            </h1>
            <p>
              Schody przy wejściu, szerokość drzwi, miejsce na przerwę. Poznaj
              szczegóły miasta i wybierz to, co odpowiada Twoim potrzebom.
            </p>
            <div className="lp-hero-actions">
              <a className="lp-button lp-button-dark" href="/app">
                Odkryj mapę <ArrowUpRight size={21} aria-hidden="true" />
              </a>
              <a className="lp-secondary-link" href="#film">
                Zobacz film <Play size={16} aria-hidden="true" />
              </a>
            </div>
            <div className="lp-hero-meta">
              <Monitor size={15} aria-hidden="true" /> W przeglądarce. Bez
              instalacji. W swoim tempie.
            </div>
          </Reveal>
          <Reveal className="lp-hero-visual" delay={0.1}>
            <CityScene paused={paused || reduced} />
            <div className="lp-scene-footer">
              <span>Artystyczna wizja miasta, nie mapa nawigacyjna.</span>
              <button
                className="lp-motion-toggle"
                type="button"
                disabled={reduced}
                onClick={() => setPaused((value) => !value)}
                aria-pressed={paused || reduced}
                aria-label={
                  reduced
                    ? "Animacje wyłączone w ustawieniach"
                    : paused
                      ? "Wznów animację trasy"
                      : "Zatrzymaj animację trasy"
                }
              >
                {paused || reduced ? (
                  <Play size={14} aria-hidden="true" />
                ) : (
                  <Pause size={14} aria-hidden="true" />
                )}
                <span>
                  {reduced
                    ? "Bez animacji"
                    : paused
                      ? "Wznów animację"
                      : "Zatrzymaj animację"}
                </span>
              </button>
            </div>
          </Reveal>
        </section>
        <div
          className="lp-principles"
          role="group"
          aria-label="Informacje w aplikacji"
        >
          <div className="lp-container">
            <span>
              <Footprints size={21} aria-hidden="true" /> Twoje potrzeby, bez
              etykiet.
            </span>
            <span>
              <ShieldCheck size={21} aria-hidden="true" /> Źródła przy
              informacjach.
            </span>
            <span>
              <CircleHelp size={21} aria-hidden="true" /> Niewiadome pokazane
              wprost.
            </span>
          </div>
        </div>
        <ProductVideo />
        <section
          id="jak-dziala"
          className="lp-how lp-container lp-section"
          aria-labelledby="lp-how-title"
        >
          <Reveal className="lp-section-heading">
            <div>
              <span className="lp-kicker">01 / Zaczyna się od Ciebie</span>
              <h2 id="lp-how-title">
                Dobry plan.
                <br />
                Więcej swobody.
              </h2>
            </div>
            <p>
              Każdy porusza się inaczej. Wyszukaj miejsce i porównaj informacje
              o wejściu i drodze z własnymi potrzebami.
            </p>
          </Reveal>
          <ol className="lp-steps">
            {[
              {
                Icon: Footprints,
                title: "Ustaw swoje potrzeby",
                text: "Wybierz sposób poruszania się i przeszkody, których chcesz unikać. Możesz też zacząć bez profilu.",
              },
              {
                Icon: Route,
                title: "Sprawdź szczegóły",
                text: "Poznaj informacje o wejściach, trasach i barierach. Zobacz również, czego jeszcze nie wiadomo.",
              },
              {
                Icon: MapPin,
                title: "Wybierz po swojemu",
                text: "Oceń, czy miejsce i trasa Ci odpowiadają. Przy brakujących danych potwierdź szczegóły przed wyjściem.",
              },
            ].map(({ Icon, title, text }, index) => (
              <li key={title}>
                <Reveal delay={index * 0.07}>
                  <div className="lp-step-top">
                    <span className={`lp-step-icon lp-step-icon-${index}`}>
                      <Icon size={28} strokeWidth={1.65} aria-hidden="true" />
                    </span>
                    <span className="lp-step-number">0{index + 1}</span>
                  </div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </Reveal>
              </li>
            ))}
          </ol>
          <Reveal>
            <DetailPreview />
          </Reveal>
        </section>
        <section
          id="dostepnosc"
          className="lp-confidence"
          aria-labelledby="lp-confidence-title"
        >
          <div className="lp-container lp-confidence-grid">
            <Reveal>
              <span className="lp-kicker">
                02 / Informacje, którym znasz źródło
              </span>
              <h2 id="lp-confidence-title">
                Nie zgaduj.
                <br />
                <span>Sprawdź szczegóły.</span>
              </h2>
              <p>
                „Dostępne” nie dla każdego znaczy to samo. Dlatego pokazujemy
                konkretne informacje o wejściu, progu czy nawierzchni, a także
                ich źródła i braki.
              </p>
              <a className="lp-text-link" href="/app">
                Zobacz informacje na mapie{" "}
                <ArrowRight size={20} aria-hidden="true" />
              </a>
            </Reveal>
            <Reveal className="lp-evidence">
              <div className="lp-evidence-heading">
                <ShieldCheck size={23} aria-hidden="true" />
                <span>Więcej kontekstu. Twoja decyzja.</span>
              </div>
              {[
                {
                  Icon: MapPin,
                  title: "Wiesz, skąd jest informacja",
                  text: "Źródło i dostępne daty przy opisie miejsca.",
                  tone: "source",
                },
                {
                  Icon: CircleHelp,
                  title: "Widzisz, czego nie wiemy",
                  text: "Brak danych o schodach nie oznacza wejścia bez stopni.",
                  tone: "unknown",
                },
                {
                  Icon: Ruler,
                  title: "Porównujesz z własnymi potrzebami",
                  text: "Szerokość drzwi i wysokość progu zamiast samej etykiety.",
                  tone: "needs",
                },
              ].map(({ Icon, title, text, tone }) => (
                <div className="lp-evidence-row" key={title}>
                  <span className={`lp-evidence-icon ${tone}`}>
                    <Icon size={20} aria-hidden="true" />
                  </span>
                  <div>
                    <h3>{title}</h3>
                    <p>{text}</p>
                  </div>
                </div>
              ))}
              <div className="lp-evidence-footnote">
                Warunki mogą się zmieniać. Prototyp pomaga planować, ale nie
                gwarantuje przejezdności.
              </div>
            </Reveal>
          </div>
        </section>
        <section
          className="lp-community lp-container lp-section"
          aria-labelledby="lp-community-title"
        >
          <Reveal className="lp-community-visual">
            <div className="lp-community-art" aria-hidden="true">
              <span className="lp-orbit lp-orbit-one" />
              <span className="lp-orbit lp-orbit-two" />
              <span className="lp-community-pin lp-pin-one">
                <DoorOpen size={25} />
              </span>
              <span className="lp-community-pin lp-pin-two">
                <Armchair size={25} />
              </span>
              <span className="lp-community-pin lp-pin-three">
                <Plus size={25} />
              </span>
              <div className="lp-community-main">
                <BrandMark />
                <span>
                  Mała obserwacja.
                  <br />
                  <strong>Pomocna zmiana.</strong>
                </span>
              </div>
            </div>
            <span className="lp-community-label">
              <MapPin size={16} aria-hidden="true" /> Miasto poznajemy wspólnie.
            </span>
          </Reveal>
          <Reveal className="lp-community-copy">
            <span className="lp-kicker">03 / Wspólna mapa</span>
            <h2 id="lp-community-title">
              Ty znasz drogę.
              <br />
              Ktoś jej szuka.
            </h2>
            <p>
              Nowy remont? Wejście od podwórka? Miejsce na odpoczynek? Twoja
              obserwacja może pomóc komuś lepiej zaplanować dzień.
            </p>
            <p className="lp-copy-small">
              Dodaj lokalizację i opisz, co widzisz. Zgłoszenia pokazujemy jako
              informacje użytkowników, które wymagają weryfikacji.
            </p>
            <a className="lp-button lp-button-outline" href="/app?obserwacje">
              Dodaj swoją obserwację <Plus size={20} aria-hidden="true" />
            </a>
          </Reveal>
        </section>
        <section
          id="aplikacje"
          tabIndex={-1}
          className="lp-platforms lp-container lp-section"
          aria-labelledby="lp-platform-title"
        >
          <Reveal className="lp-section-heading">
            <div>
              <span className="lp-kicker">
                04 / Blisko, gdziekolwiek jesteś
              </span>
              <h2 id="lp-platform-title">Miasto pod ręką.</h2>
            </div>
            <p>
              Na dużym ekranie przy planowaniu.
              <br />
              Na telefonie, kiedy jesteś w drodze.
            </p>
          </Reveal>
          <div className="lp-platform-grid">
            <article className="lp-platform-card lp-platform-ready">
              <div className="lp-platform-top">
                <Monitor size={30} strokeWidth={1.5} aria-hidden="true" />
                <span className="lp-platform-status">
                  <span /> Dostępny prototyp
                </span>
              </div>
              <h3>W przeglądarce</h3>
              <p>
                Na komputerze i telefonie.
                <br />
                Otwórz mapę bez instalowania.
              </p>
              <a href="/app">
                Wejdź do aplikacji <ArrowUpRight size={21} aria-hidden="true" />
              </a>
            </article>
            <article className="lp-platform-card">
              <div className="lp-platform-top">
                <Smartphone size={30} strokeWidth={1.5} aria-hidden="true" />
                <span className="lp-platform-status">Prototyp APK</span>
              </div>
              <h3>Android</h3>
              <p>
                Zbudowana wersja testowa.
                <br />
                Do instalacji na urządzeniu.
              </p>
              <a href="/downloads/miasto-w-zasiegu-android.apk" download>
                Pobierz APK na Androida <ArrowRight size={19} aria-hidden="true" />
              </a>
            </article>
            <article className="lp-platform-card">
              <div className="lp-platform-top">
                <Watch size={30} strokeWidth={1.5} aria-hidden="true" />
                <span className="lp-platform-status">Prototyp APK</span>
              </div>
              <h3>Wear OS</h3>
              <p>
                Zbudowana wersja na zegarek.
                <br />
                Wymaga testu na fizycznym urządzeniu.
              </p>
              <a href="/downloads/miasto-w-zasiegu-wear-os.apk" download>
                Pobierz APK na Wear OS <ArrowRight size={19} aria-hidden="true" />
              </a>
            </article>
          </div>
        </section>
        <section
          className="lp-faq lp-container lp-section"
          aria-labelledby="lp-faq-title"
        >
          <Reveal>
            <span className="lp-kicker">Warto wiedzieć</span>
            <h2 id="lp-faq-title">
              Masz pytania?
              <br />
              Zacznij tutaj.
            </h2>
          </Reveal>
          <div className="lp-faq-list">
            {faqs.map((faq) => (
              <details key={faq.question}>
                <summary>
                  {faq.question}
                  <Plus size={21} aria-hidden="true" />
                </summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>
        <section
          className="lp-final-cta lp-container"
          aria-labelledby="lp-final-title"
        >
          <Reveal>
            <span className="lp-kicker">Twój kolejny przystanek</span>
            <h2 id="lp-final-title">
              Więcej miasta.
              <br />
              <span>Na Twoich zasadach.</span>
            </h2>
            <a className="lp-button lp-button-lime" href="/app">
              Odkryj mapę Krakowa <ArrowUpRight size={22} aria-hidden="true" />
            </a>
            <MoveUpRight
              className="lp-final-arrow"
              strokeWidth={0.8}
              aria-hidden="true"
            />
          </Reveal>
        </section>
      </main>
      <footer className="lp-footer lp-container">
        <div className="lp-footer-top">
          <a
            className="lp-brand"
            href="/"
            aria-label="Miasto w zasięgu, strona główna"
          >
            <BrandMark />
            <BrandName />
          </a>
          <p>Miejsca. Trasy. Twoje możliwości.</p>
          <a href="/app">
            Otwórz aplikację <ArrowUpRight size={18} aria-hidden="true" />
          </a>
        </div>
        <nav className="lp-footer-nav" aria-label="Informacje o aplikacji">
          <a href="#film">Film o platformie</a>
          <a href="#jak-dziala">Jak to działa</a>
          <a href="#dostepnosc">Dostępność</a>
          <a href="/cennik">Cennik i wsparcie</a>
        </nav>
        <div className="lp-footer-bottom">
          <span>Prototyp na HackYeah 2026.</span>
          <span>Ilustracja wygenerowana z pomocą AI.</span>
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
          >
            © OpenStreetMap contributors{" "}
            <span className="lp-sr-only">(nowa karta)</span>
          </a>
        </div>
      </footer>
    </div>
  );
}
