import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, ChevronDown, Play } from "lucide-react";
import tour from "./product-video.json";
import "./product-video.css";

const media = "/media/platform-tour-v005";
const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

export default function ProductVideo() {
  const player = useRef<HTMLVideoElement>(null);
  const pendingSeek = useRef<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (window.location.hash === "#film") {
      document.getElementById("film")?.scrollIntoView();
    }
  }, []);

  async function playChapter(start: number) {
    const video = player.current;
    if (!video) return;
    setError("");
    if (video.readyState === 0) pendingSeek.current = start;
    else video.currentTime = start;
    try {
      await video.play();
      video.focus();
    } catch {
      setError("Nie udało się uruchomić filmu. Spróbuj przyciskiem odtwarzania lub pobierz MP4.");
    }
  }

  return (
    <section id="film" className="lp-tour lp-container lp-section" aria-labelledby="lp-tour-title">
      <div className="lp-section-heading">
        <div>
          <span className="lp-kicker">Zobacz platformę w działaniu</span>
          <h2 id="lp-tour-title">Jeden plan. Więcej możliwości.</h2>
        </div>
        <p>Od profilu i asystentów AI po trasę, zegarek i Iskry Miasta. Poznaj całość lub wybierz interesujący Cię rozdział.</p>
      </div>
      <div className="lp-tour-player">
        <video
          ref={player}
          controls
          playsInline
          preload="none"
          poster={`${media}/poster.jpg`}
          aria-label="Miasto w zasięgu: prezentacja platformy, 12 minut i 37 sekund"
          onLoadedMetadata={(event) => {
            if (pendingSeek.current !== null) {
              event.currentTarget.currentTime = pendingSeek.current;
              pendingSeek.current = null;
            }
          }}
          onError={() => setError("Film nie może się załadować. Spróbuj ponownie lub pobierz MP4 poniżej.")}
        >
          <source src={`${media}/miasto-w-zasiegu.mp4`} type="video/mp4" />
          <track kind="subtitles" src={`${media}/napisy.vtt`} srcLang="pl" label="Polski" />
          <a href={`${media}/miasto-w-zasiegu.mp4`}>Pobierz film MP4</a>
        </video>
      </div>
      {error && <p className="lp-tour-error" role="alert">{error}</p>}
      <div className="lp-tour-meta">
        <span>12:37 · polski lektor i napisy</span>
      </div>
      <details className="lp-tour-chapters">
        <summary>Wybierz rozdział <ChevronDown size={20} aria-hidden="true" /></summary>
        <nav aria-label="Rozdziały prezentacji">
          {tour.chapters.map((item) => (
            <button key={item.start} type="button" onClick={() => void playChapter(item.start)}>
              <Play size={15} aria-hidden="true" /><time>{clock(item.start)}</time><span>{item.title}</span>
            </button>
          ))}
        </nav>
      </details>
      <div className="lp-tour-links">
        <a className="lp-button lp-button-dark" href="/app">Wypróbuj na mapie <ArrowUpRight size={19} aria-hidden="true" /></a>
        <a href={`${media}/tekst.txt`}>Przeczytaj treść filmu</a>
        <a href={`${media}/miasto-w-zasiegu.mp4`} download>Pobierz MP4</a>
        <a href={`${media}/napisy.srt`} download>Napisy SRT</a>
      </div>
      <p className="lp-tour-credits">Muzyka: „Origami” i „Simplicity”, <a href="https://www.scottbuckley.com.au/library/">Scott Buckley</a>, <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>. Utwory skrócono i zmiksowano z narracją.</p>
    </section>
  );
}
