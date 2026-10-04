import { useEffect, useState } from 'react';
import './explorer-video.css';

const media = '/media/iskry-promo-v001';
const lyrics = `Rozejrzyj się, tu zaczyna się gra.
Mały szczegół znaczenie ma.
Sprawdź to miejsce, podaj dalej to, co wiesz.
Iskry Miasta, zagraj z nami!
Poznaj miasto małymi misjami.
Iskry Miasta, zostaw dobry ślad.
Twoja wiedza przyda się nam.
Iskry Miasta.
Zagraj w swoim tempie.`;

export default function ExplorerVideo() {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (window.location.hash === '#teledysk') {
      document.getElementById('teledysk')?.scrollIntoView();
    }
  }, []);

  return (
    <section id="teledysk" className="ex-video" aria-labelledby="ex-video-title">
      <div className="ex-video-copy">
        <span className="ex-eyebrow">Teledysk Iskier Miasta · 0:40</span>
        <h2 id="ex-video-title">Mała misja.<br />Dobry ślad.</h2>
        <p>Poznaj misje, zbieraj odznaki i zostaw informacje, które przydadzą się innym.</p>
        <details className="ex-video-lyrics">
          <summary>Tekst piosenki</summary>
          <p>{lyrics}</p>
        </details>
        <a className="ex-video-download" href={`${media}/iskry-miasta.mp4`} download>Pobierz teledysk</a>
      </div>
      <div className="ex-video-player">
        <video
          controls
          playsInline
          preload="none"
          poster={`${media}/poster.jpg`}
          aria-label="Iskry Miasta: teledysk, 40 sekund, polska piosenka i napisy"
          onError={() => setFailed(true)}
          onPlaying={() => setFailed(false)}
        >
          <source src={`${media}/iskry-miasta.mp4`} type="video/mp4" />
          <a href={`${media}/iskry-miasta.mp4`}>Otwórz teledysk MP4</a>
        </video>
        {failed && <p className="ex-video-error" role="alert">Nie udało się wczytać teledysku. <a href={`${media}/iskry-miasta.mp4`}>Otwórz plik MP4</a> i spróbuj ponownie.</p>}
      </div>
    </section>
  );
}
