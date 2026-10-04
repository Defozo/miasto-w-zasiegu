import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Award, Check, Compass, Download, LocateFixed, MapPin, RefreshCw, Search, Share2, Sparkles, Volume2, VolumeX, X } from 'lucide-react';
import { api, metres, readLocal, writeLocal } from './api';
import ExplorerBadgeArt from './ExplorerBadge';
import ExplorerVideo from './ExplorerVideo';
import { downloadExplorerCard, exportExplorerCard, playExplorerSound, polishNoun } from './explorer-media';
import type { ExplorerBadge, ExplorerMission, ExplorerReward, ExplorerState } from './explorer-types';
import type { Coordinates } from './types';
import { inReportArea } from './report-photo';
import './explorer.css';
const ExplorerMap = lazy(() => import('./ExplorerMap'));
const ExplorerCompose = lazy(() => import('./ExplorerCompose'));
const introBadge = { icon: 'compass', color: 'mint', level: 1 };

export default function ExplorerGame() {
  const [state, setState] = useState<ExplorerState | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [tab, setTab] = useState<'missions' | 'collection' | 'profile'>('missions');
  const [missions, setMissions] = useState<ExplorerMission[]>([]), [query, setQuery] = useState(''), [center, setCenter] = useState<Coordinates | null>(null);
  const [missionLoading, setMissionLoading] = useState(true), [missionError, setMissionError] = useState(''), [filter, setFilter] = useState('all');
  const [missionLimit, setMissionLimit] = useState(6);
  const [selected, setSelected] = useState<ExplorerMission | null>(null), [loginMission, setLoginMission] = useState<ExplorerMission | null>(null);
  const [reward, setReward] = useState<ExplorerReward | null>(null), [sound, setSound] = useState(() => readLocal<boolean>('iskry-sound-v1', false) === true);
  const [revision, setRevision] = useState(0), [gpsBusy, setGpsBusy] = useState(false), [locationNotice, setLocationNotice] = useState('Odległości od Rynku Głównego. Możesz wybrać swoją okolicę.');
  const generation = useRef(0), owner = useRef<string | null>(null), gpsGeneration = useRef(0), content = useRef<HTMLElement>(null);
  useEffect(() => {
    const oldTitle = document.title, manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]'), oldHref = manifest?.getAttribute('href');
    document.title = 'Iskry Miasta · Twoje odkrycia mają znaczenie'; manifest?.setAttribute('href', '/iskry.webmanifest');
    return () => { document.title = oldTitle; if (oldHref) manifest?.setAttribute('href', oldHref); gpsGeneration.current++; };
  }, []);
  useEffect(() => {
    let active = true;
    const load = async () => {
      const request = ++generation.current;
      try {
        const next = await api<ExplorerState>('/game/explorer');
        if (!active || request !== generation.current) return;
        if (owner.current !== (next.user?.id ?? null)) { setSelected(null); setReward(null); }
        owner.current = next.user?.id ?? null; setState(next); setError('');
      } catch (cause) { if (active && request === generation.current) { setError((cause as Error).message); setState(null); owner.current = null; setSelected(null); } }
      finally { if (active && request === generation.current) setLoading(false); }
    };
    void load(); window.addEventListener('focus', load);
    return () => { active = false; generation.current++; window.removeEventListener('focus', load); };
  }, [revision]);
  useEffect(() => {
    let active = true; setMissionLoading(true); setMissionError(''); setMissionLimit(6);
    const timer = setTimeout(() => {
      void api<{ missions: ExplorerMission[] }>(`/game/quests?q=${encodeURIComponent(query)}${center ? `&lon=${center[0]}&lat=${center[1]}` : ''}`)
        .then(data => { if (active) setMissions(data.missions); })
        .catch(cause => { if (active) { setMissions([]); setMissionError(cause.message); } })
        .finally(() => { if (active) setMissionLoading(false); });
    }, 220);
    return () => { active = false; clearTimeout(timer); };
  }, [query, center, revision, state?.user?.id]);
  function select(mission: ExplorerMission) { if (state?.user) setSelected(mission); else setLoginMission(mission); }
  function go(next: typeof tab) { setTab(next); requestAnimationFrame(() => content.current?.focus({ preventScroll: true })); }
  function locate() {
    if (!navigator.geolocation) { setLocationNotice('Lokalizacja nie jest dostępna. Wyszukaj miejsce po nazwie.'); return; }
    const token = ++gpsGeneration.current; setGpsBusy(true);
    navigator.geolocation.getCurrentPosition(p => {
      if (token !== gpsGeneration.current) return;
      setGpsBusy(false); const point: Coordinates = [p.coords.longitude, p.coords.latitude];
      if (!inReportArea(point)) { setLocationNotice('Jesteś poza obsługiwanym obszarem. Możesz przeglądać misje w Krakowie.'); return; }
      setCenter(point); setQuery(''); setLocationNotice('Misje w Twojej okolicy. Odległości w linii prostej.');
    }, () => { if (token === gpsGeneration.current) { setGpsBusy(false); setLocationNotice('Nie udało się ustalić pozycji. Możesz wyszukać miejsce po nazwie.'); } }, { timeout: 10000, maximumAge: 60000 });
  }
  const matching = missions.filter(m => filter === 'all' || m.type === filter);
  const visible = matching.slice(0, missionLimit);
  const unlocked = state?.badges.filter(b => b.level > 0) ?? [];
  const nextBadge = state?.badges.filter(b => b.next !== null).sort((a, b) => b.count / b.next! - a.count / a.next!)[0];
  return <div className={`ex-app theme-${state?.theme || 'mint'}`}>
    <a className="ex-skip" href="#explorer-main">Przejdź do gry</a>
    <header className="ex-header"><a href="/app" className="ex-home"><ArrowLeft size={17} />Miasto w zasięgu</a><a className="ex-wordmark" href="/gra"><Sparkles size={23} />ISKRY<span>KRAKÓW</span></a><button type="button" className="ex-icon-button" aria-label={sound ? 'Wyłącz dźwięki' : 'Włącz dźwięki'} aria-pressed={sound} onClick={() => { const next = !sound; setSound(next); writeLocal('iskry-sound-v1', next); if (next) void playExplorerSound(); }}>{sound ? <Volume2 size={21} /> : <VolumeX size={21} />}</button></header>
    <main id="explorer-main">
      <section className="ex-hero" aria-labelledby="ex-title"><div className="ex-hero-copy"><span className="ex-eyebrow">Twoje miasto. Twoje odkrycia.</span><h1 id="ex-title">Zostaw po sobie<br /><em>dobry ślad.</em></h1><p>Wypatrz szczegół, sprawdź miejsce, zbierz odznakę.<br />Twoje odkrycia pomagają innym ruszyć w miasto.</p><div className="ex-hero-actions"><button type="button" className="ex-button primary" onClick={() => { go('missions'); content.current?.scrollIntoView({ block: 'start' }); }}>Znajdź swoją misję <ArrowRight size={19} /></button><a href="/gra?tryb=ogrod" className="ex-hero-training">Zacznij od treningu <ArrowUpRight size={15} /></a></div></div>
        <div className="ex-hero-art"><div className="ex-orbit one" /><div className="ex-orbit two" /><span className="ex-art-coordinate">50°03′ N / 19°56′ E</span><ExplorerBadgeArt badge={introBadge} large /><div className="ex-art-caption"><span>PIERWSZY TROP</span><small>Twoja pierwsza obserwacja na mapie</small></div><span className="ex-art-stamp">ODKRYWAJ<br />PO SWOJEMU</span></div></section>
      <ExplorerVideo />
      <section className="ex-player-strip" aria-label="Twój postęp"><div><span className="ex-avatar"><Compass size={24} /></span><div><strong>{state?.user ? state.user.displayName : 'Twój miejski profil'}</strong><span>{state?.user ? state.rank.name : 'Misje, odznaki i odkrycia po drodze'}</span></div></div><div className="ex-player-numbers"><div><strong>{state?.stats.xp ?? 0}<small> XP</small></strong><span>doświadczenia</span></div><div><strong>{unlocked.length}<small> / 6</small></strong><span>serii odznak</span></div><div><strong>{state?.stats.refreshes ?? 0}</strong><span>aktualizacji</span></div></div>{state?.user ? <button className="ex-button outline" type="button" onClick={() => go('profile')}>Moja wizytówka <ArrowUpRight size={16} /></button> : <a className="ex-button outline" href="/app?konto=1">Zaloguj się i zapisuj postęp <ArrowUpRight size={16} /></a>}</section>
      {error && <div role="alert" className="ex-error">Nie udało się wczytać profilu. {error}<button type="button" onClick={() => setRevision(n => n + 1)}>Spróbuj ponownie</button></div>}
      <nav className="ex-tabs" aria-label="Widoki gry">{([['missions', 'Misje w mieście', Compass], ['collection', 'Kolekcja odznak', Award], ['profile', 'Moja wizytówka', Share2]] as const).map(([id, title, Icon]) => <button key={id} type="button" aria-current={tab === id ? 'page' : undefined} onClick={() => go(id)}><Icon size={19} />{title}</button>)}</nav>
      <section ref={content} tabIndex={-1} className="ex-content" aria-label={tab === 'missions' ? 'Misje w mieście' : tab === 'collection' ? 'Kolekcja odznak' : 'Moja wizytówka'}>
        {tab === 'missions' ? <><div className="ex-section-heading"><div><span className="ex-eyebrow">Mała wyprawa zaczyna się tutaj</span><h2>Co odkryjesz po drodze?</h2><p>Każda misja ma powód. Uzupełnij brak albo sprawdź, co się zmieniło.</p></div><button type="button" className="ex-button outline" onClick={() => select({ id: 'free-observation', type: 'discover', kind: 'obstacle', title: 'Dodaj własne odkrycie', reason: 'Opisz przeszkodę lub dobre miejsce, które rzeczywiście zauważasz.', points: 15, place: 'Wybrane przez Ciebie miejsce', coordinates: center ?? [19.938, 50.061], distanceM: 0, sourceUrl: null, lastObservedAt: null })}>Mam własne odkrycie <Sparkles size={17} /></button></div>
          <div className="ex-mission-toolbar"><label className="ex-search"><Search size={20} /><input type="search" aria-label="Szukaj miejsca misji" value={query} onChange={e => setQuery(e.target.value)} placeholder="Szukaj miejsca, ulicy, szczegółu…" /></label><button type="button" className="ex-button outline" disabled={gpsBusy} onClick={locate}><LocateFixed size={18} />{gpsBusy ? 'Szukam pozycji…' : 'W mojej okolicy'}</button></div>
          <p className="ex-fine" role="status">{locationNotice}</p>
          <div className="ex-discovery-layout"><div className="ex-missions"><div className="ex-filters" role="group" aria-label="Rodzaj misji">{[['all', 'Wszystkie'], ['refresh', 'Do odświeżenia'], ['discover', 'Do odkrycia']].map(([id, title]) => <button type="button" key={id} aria-pressed={filter === id} onClick={() => { setFilter(id); setMissionLimit(6); }}>{title}</button>)}</div>
            <p className="ex-fine ex-mission-status" role="status" aria-live="polite" aria-atomic="true">{missionLoading ? "Szukamy misji w tej okolicy…" : missionError ? "Nie udało się wczytać misji." : matching.length ? `Wyświetlono ${visible.length} z ${matching.length} misji.` : "Brak misji dla wybranego wyszukiwania lub filtra. Zmień nazwę miejsca albo pokaż wszystkie misje."}</p>
            {missionLoading ? <p className="ex-empty">Wczytujemy listę…</p> : missionError ? <div className="ex-error" role="alert">{missionError}<button type="button" onClick={() => setRevision(n => n + 1)}>Wczytaj misje ponownie</button></div> : visible.length ? <><ol className="ex-mission-list">{visible.map((mission, index) => <li key={mission.id}><button type="button" className="ex-mission" onClick={() => select(mission)}><span className={`ex-mission-number ${mission.type}`}>{index + 1}</span><span className="ex-mission-body"><span className="ex-mission-meta">{mission.type === 'refresh' ? 'ODŚWIEŻ INFORMACJĘ' : 'UZUPEŁNIJ MAPĘ'}<span>+{mission.points} XP</span></span><strong>{mission.title}</strong><span className="ex-mission-place">{mission.place} · {metres(mission.distanceM)}</span><span className="ex-mission-reason">{mission.reason}</span></span><ArrowUpRight size={20} /></button></li>)}</ol>{visible.length < matching.length && <button type="button" className="ex-button outline full" onClick={() => setMissionLimit(n => n + 6)}>Pokaż kolejne misje <ArrowRight size={17} /></button>}</> : <div className="ex-empty"><Compass size={32} /><h3>Tu nie ma teraz takich misji</h3><p>Zmień filtr lub wyszukaj inne miejsce. Własne odkrycie możesz dodać zawsze.</p><button className="ex-button outline" type="button" onClick={() => { setFilter('all'); setQuery(''); }}>Pokaż wszystkie misje</button></div>}</div>
            <aside className="ex-map-column"><Suspense fallback={<div className="ex-map-shell" role="status">Wczytujemy mapę…</div>}><ExplorerMap missions={visible} onSelect={select} /></Suspense><p className="ex-fine">Odległości w linii prostej. Punkt miejsca może różnić się od wejścia. Korzystaj z telefonu po zatrzymaniu się.</p>{nextBadge && <button className="ex-next-badge" type="button" onClick={() => go('collection')}><ExplorerBadgeArt badge={nextBadge} /><span><small>TWÓJ KOLEJNY CEL</small><strong>{nextBadge.name}</strong><span>{nextBadge.count} z {nextBadge.next} do kolejnego poziomu</span></span><ArrowRight size={18} /></button>}</aside></div>
          <div className="ex-how"><div><span>01</span><strong>Wybierz miejsce</strong><p>Po drodze, we własnym tempie.</p></div><div><span>02</span><strong>Zauważ i opisz</strong><p>Zdjęcie AI pomaga przygotować opis.</p></div><div><span>03</span><strong>Zbieraj osiągnięcia</strong><p>Także za wkład w głównej aplikacji.</p></div></div></>
          : tab === 'collection' ? <><div className="ex-section-heading"><div><span className="ex-eyebrow">Kolekcja, za którą stoją odkrycia</span><h2>Małe znaki. Konkretne historie.</h2><p>Sześć serii, po trzy poziomy. Wybierz do trzech zdobytych odznak na swoją wizytówkę.</p></div></div>{loading ? <p role="status">Wczytujemy kolekcję…</p> : state && <div className="ex-badge-grid">{state.badges.map(badge => <BadgeTile key={badge.id} badge={badge} featured={state.featured.includes(badge.id)} canEdit={Boolean(state.user)} onToggle={async () => {
            const actor = state.user?.id; if (!actor) return;
            const featured = state.featured.includes(badge.id) ? state.featured.filter(id => id !== badge.id) : [...state.featured, badge.id];
            if (featured.length > 3) throw new Error('Na wizytówce mieszczą się trzy odznaki. Najpierw odznacz jedną.');
            const next = await api<ExplorerState>('/game/showcase', { expectedUserId: actor, featured, theme: state.theme });
            if (owner.current === actor) setState(next);
          }} />)}</div>}<p className="ex-fine">XP nalicza serwer za konkretne, aktualne opisy i potrzebne ponowne sprawdzenia. Do pięciu nagród w ciągu 24 godzin. Powielone wpisy i własne potwierdzenia nie dają kolejnych nagród.</p></>
            : state ? <ExplorerProfile key={state.user?.id || 'guest'} state={state} onState={next => { if (next.user?.id === owner.current) setState(next); }} onCollection={() => go('collection')} /> : <p role="status">{error ? 'Profil chwilowo niedostępny. Spróbuj ponownie powyżej.' : 'Wczytujemy wizytówkę…'}</p>}
      </section>
    </main>
    <footer className="ex-footer"><span>ISKRY MIASTA · KRAKÓW</span><p>Odznaki pokazują Twój wkład. Obserwacje społeczności wymagają niezależnego potwierdzenia.</p><a href="/gra?tryb=ogrod">Trening i zapisany ogród <ArrowUpRight size={15} /></a></footer>
    {loginMission && <GuestMission mission={loginMission} onClose={() => setLoginMission(null)} />}
    {selected && state?.user && <Suspense fallback={<p role="status">Otwieramy misję…</p>}><ExplorerCompose key={`${state.user.id}:${selected.id}`} mission={selected} userId={state.user.id} onClose={() => setSelected(null)} onSaved={(next, actor) => { if (owner.current !== actor) return; setSelected(null); setReward(next); setRevision(n => n + 1); if (sound && next.awarded) void playExplorerSound(Boolean(next.badges?.length || next.rankUp)); }} /></Suspense>}
    {reward && <div className={`ex-reward ${reward.awarded ? 'earned' : ''}`} role="status"><span className="ex-reward-icon"><Award size={30} /></span><div><strong>{reward.awarded ? `+${reward.awarded} XP. Dobry ślad zostaje.` : 'Obserwacja zapisana'}</strong><p>{reward.badges?.length ? `Nowy poziom odznaki: ${reward.badges.join(', ')}` : reward.reason}</p>{reward.rankUp && <p>Nowa ranga: {reward.rankUp}</p>}<button type="button" onClick={() => { go('collection'); setReward(null); }}>Zobacz kolekcję <ArrowRight size={15} /></button></div><button className="ex-icon-button" type="button" aria-label="Zamknij wiadomość o nagrodzie" onClick={() => setReward(null)}><X size={19} /></button></div>}
  </div>;
}

function BadgeTile({ badge, featured, canEdit, onToggle }: { badge: ExplorerBadge; featured: boolean; canEdit: boolean; onToggle: () => Promise<void> }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  return <article className={`ex-badge-tile ${badge.level ? 'unlocked' : ''}`}><span className="ex-badge-level">{badge.level ? `POZIOM ${badge.level} / 3` : 'DO ODKRYCIA'}</span><ExplorerBadgeArt badge={badge} locked={!badge.level} /><h3>{badge.name}</h3><p>{badge.detail}</p><div className="ex-badge-progress"><span>{badge.next ? `${badge.count} / ${badge.next}` : 'Wszystkie poziomy zdobyte'}</span><progress value={badge.next ? badge.count : 1} max={badge.next || 1} aria-label={`Postęp odznaki ${badge.name}`} /></div><button type="button" className={`ex-button ${featured ? 'selected' : 'outline'} full`} disabled={!canEdit || !badge.level || busy} aria-pressed={featured} onClick={async () => { setBusy(true); setError(''); try { await onToggle(); } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); } }}>{featured ? <><Check size={16} />Na wizytówce</> : badge.level ? 'Pokaż na wizytówce' : `Pierwszy poziom: ${badge.thresholds[0]}`}</button>{error && <p className="ex-error" role="alert">{error}</p>}</article>;
}
function GuestMission({ mission, onClose }: { mission: ExplorerMission; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef(document.activeElement as HTMLElement | null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); returnFocus.current?.focus(); };
  }, []);
  return <dialog ref={dialog} className="ex-dialog ex-guest" aria-labelledby="ex-guest-title" onCancel={e => { e.preventDefault(); onClose(); }}><button type="button" className="ex-icon-button" aria-label="Zamknij podgląd misji" onClick={onClose}><X /></button><span className="ex-eyebrow">Misja · +{mission.points} XP</span><h2 id="ex-guest-title">{mission.title}</h2><p className="ex-place"><MapPin size={17} />{mission.place}</p><p>{mission.reason}</p><p>Konto połączy tę obserwację z Twoimi odznakami. Możesz też zacząć od sześciu zagadek bez logowania.</p><a className="ex-button primary full" href="/app?konto=1">Zaloguj się i zacznij <ArrowUpRight size={18} /></a><a className="ex-button outline full" href="/gra?tryb=ogrod">Spróbuj treningu</a></dialog>;
}
function ExplorerProfile({ state, onState, onCollection }: { state: ExplorerState; onState: (state: ExplorerState) => void; onCollection: () => void }) {
  const [name, setName] = useState(state.user?.displayName.split(' ')[0] || 'Miejski odkrywca'), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const card = useRef<HTMLDivElement>(null);
  const shown = state.featured.map(id => state.badges.find(b => b.id === id)!).filter(Boolean);
  async function exportCard(share: boolean) {
    setBusy(true); setNotice('');
    try {
      const file = await exportExplorerCard(state, name, Array.from(card.current?.querySelectorAll<SVGSVGElement>('.ex-badge-art') ?? []));
      if (share && navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'Moje Iskry Miasta' }); setNotice('Karta przekazana do wybranego sposobu udostępnienia.'); }
      else { downloadExplorerCard(file); setNotice('Karta PNG gotowa do zapisania. Możesz udostępnić ją znajomym.'); }
    } catch (cause) { if ((cause as Error).name !== 'AbortError') setNotice((cause as Error).message); }
    finally { setBusy(false); }
  }
  return <><div className="ex-section-heading"><div><span className="ex-eyebrow">Pokaż, co odkrywasz</span><h2>Wizytówka z charakterem.</h2><p>Twoje osiągnięcia, Twoja nazwa. Przygotuj kartę do zapisania lub udostępnienia.</p></div></div><div className="ex-profile-layout"><div className="ex-share-card" ref={card}><span className="ex-card-brand"><Sparkles size={23} />ISKRY / KRAKÓW</span><h3>{name.trim() || 'Miejski odkrywca'}</h3><p className="ex-card-rank">{state.rank.name}</p><div className="ex-card-badges">{shown.length ? shown.map(b => <div key={b.id}><ExplorerBadgeArt badge={b} /><strong>{b.name}</strong></div>) : <div className="ex-card-empty"><ExplorerBadgeArt badge={introBadge} locked /><p>Tu znajdą się Twoje zdobyte odznaki.</p></div>}</div><div className="ex-card-stat"><strong>{state.stats.contributions}</strong><span>{polishNoun(state.stats.contributions, 'obserwacja', 'obserwacje', 'obserwacji')} dla miasta</span></div><p className="ex-card-details">{state.stats.refreshes} {polishNoun(state.stats.refreshes, 'aktualizacja', 'aktualizacje', 'aktualizacji')} · {state.stats.measurements} {polishNoun(state.stats.measurements, 'pomiar', 'pomiary', 'pomiarów')} · {state.stats.xp} XP</p><small>Obserwacje społeczności, bez niezależnego audytu.</small></div><div className="ex-profile-controls"><label>Nazwa na karcie<input maxLength={32} value={name} onChange={e => setName(e.target.value)} placeholder="Twój pseudonim" /></label><p className="ex-fine">Karta zawiera wyłącznie nazwę, odznaki i liczniki. Bez adresów i lokalizacji obserwacji. Sam wybierasz, komu ją pokażesz.</p><fieldset disabled={busy || !state.user}><legend>Styl wizytówki</legend><div className="ex-theme-options">{state.themes.map(t => <button type="button" key={t.id} className={`ex-theme ${t.id}`} aria-pressed={state.theme === t.id} disabled={state.stats.xp < t.xp} onClick={async () => { setBusy(true); setNotice(''); try { onState(await api<ExplorerState>('/game/showcase', { expectedUserId: state.user?.id, featured: state.featured, theme: t.id })); } catch (cause) { setNotice((cause as Error).message); } finally { setBusy(false); } }}><span />{t.name}<small>{state.stats.xp < t.xp ? `${t.xp} XP` : state.theme === t.id ? 'Wybrany' : 'Odblokowany'}</small></button>)}</div></fieldset><button className="ex-button outline full" type="button" onClick={onCollection}>Wybierz odznaki <Award size={18} /></button><button className="ex-button primary full" type="button" disabled={busy || !state.user || !shown.length} onClick={() => void exportCard(true)}>Udostępnij kartę <Share2 size={18} /></button><button className="ex-button outline full" type="button" disabled={busy || !state.user || !shown.length} onClick={() => void exportCard(false)}>Pobierz PNG <Download size={18} /></button>{!shown.length && <p className="ex-fine">Zdobądź pierwszą odznakę, aby zapisać swoją kartę.</p>}<p role="status">{notice}</p>{state.nextRank && <div className="ex-rank-progress"><strong>Przed Tobą: {state.nextRank.name}</strong><span>{state.stats.xp} / {state.nextRank.xp} XP</span><progress value={state.stats.xp - state.rank.xp} max={state.nextRank.xp - state.rank.xp} aria-label="Postęp do kolejnej rangi" /></div>}</div></div><section className="ex-history"><h3>Twoje ostatnie ślady</h3>{state.recent.length ? <ul>{state.recent.map(r => <li key={r.id}><span>{r.activity === 'refresh' ? 'Ponowne sprawdzenie' : r.activity === 'measure' ? 'Obserwacja z pomiarem' : 'Nowe odkrycie'}</span><time dateTime={r.at}>{new Date(r.at).toLocaleDateString('pl-PL')}</time><strong>+{r.points} XP</strong></li>)}</ul> : <p>Historia pojawi się po pierwszym nagrodzonym odkryciu. Trening zapisuje się osobno.</p>}</section></>;
}
