import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Heart, MapPin, Megaphone, ShieldCheck, Sparkles, ExternalLink } from 'lucide-react';
import BrandName from './BrandName';
import { api } from './api';
import type { Place } from './types';
import './pricing.css';

type Plan = 'premium' | 'map' | 'sponsored' | 'donation';
export type BillingState = {
  user: { id: string; displayName: string } | null;
  enabled: boolean; mode: 'test' | 'live' | 'unavailable'; premium: boolean; premiumUntil: string | null;
  canManage: boolean; currency: string; donationMinimum: number;
  plans: Record<'premium' | 'map' | 'sponsored', { name: string; amount: number; interval: string }>;
  subscriptions: { id: string; kind: Plan; placeId: string | null; placeName: string | null; status: string; active: boolean; paidUntil: string | null; accessUntil?: string | null; cancelAtPeriodEnd: boolean }[];
};
const titles = { premium: 'Premium', map: 'Miejsce na mapie', sponsored: 'Mapa + polecenia', donation: 'Jednorazowe wsparcie' };
const money = (value: number) => new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN', maximumFractionDigits: 2 }).format(value / 100);
const date = (value: string) => new Date(value).toLocaleDateString('pl-PL');

export default function Pricing() {
  const [state, setState] = useState<BillingState | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Plan | null>(null);
  const [donation, setDonation] = useState('20');
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<Place[]>([]);
  const [place, setPlace] = useState<Place | null>(null);
  const [searching, setSearching] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const form = useRef<HTMLElement>(null);
  const requestVersion = useRef(0);
  const owner = useRef<string | null>(null);
  const sessionId = new URLSearchParams(location.search).get('session_id');
  async function refresh() {
    const version = ++requestVersion.current;
    try {
      const next = await api<BillingState>('/billing/state');
      if (version !== requestVersion.current) return;
      if (owner.current !== next.user?.id) { setAccepted(false); setAuthorized(false); setPlace(null); }
      owner.current = next.user?.id ?? null;
      setState(next); setError('');
      if (sessionId && next.user && next.enabled) {
        setNotice('Sprawdzamy potwierdzenie płatności…');
        const result = await api<{status: string; state: BillingState}>('/billing/confirm', {sessionId,expectedUserId: next.user.id});
        if (version !== requestVersion.current || owner.current !== next.user.id) return;
        setState(result.state);
        setNotice(result.status === 'paid' ? 'Płatność potwierdzona. Dziękujemy za wsparcie Miasta w zasięgu.' : result.status === 'expired' ? 'Ta płatność wygasła. Możesz wybrać ofertę ponownie.' : 'Płatność oczekuje na potwierdzenie. Odśwież status za chwilę.');
      }
    } catch (e) { if (version === requestVersion.current) setError((e as Error).message); }
  }
  useEffect(() => {
    const oldTitle = document.title;
    document.title = 'Cennik i wsparcie · Miasto w zasięgu';
    void refresh();
    window.addEventListener('focus', refresh);
    return () => { requestVersion.current++; owner.current = null; document.title = oldTitle; window.removeEventListener('focus', refresh); };
  }, []);
  useEffect(() => {
    let canceled = false;
    setPlaces([]);
    if (query.trim().length < 2 || (selected !== 'map' && selected !== 'sponsored')) { setSearching(false); return; }
    setSearching(true);
    const timer = setTimeout(() => {
      api<{ places: Place[] }>(`/places?q=${encodeURIComponent(query)}&limit=30`).then(result => {
        if (!canceled) setPlaces(result.places.filter(p => ['food', 'services', 'accommodation', 'culture'].includes(p.category)));
      }).catch(e => { if (!canceled) setError(e.message); }).finally(() => { if (!canceled) setSearching(false); });
    }, 250);
    return () => { canceled = true; clearTimeout(timer); };
  }, [query, selected]);
  function choose(plan: Plan) {
    setSelected(plan); setAccepted(false); setAuthorized(false); setError('');
    requestAnimationFrame(() => { form.current?.scrollIntoView({ block: 'center', behavior: 'instant' }); form.current?.focus(); });
  }
  function navigateToStripe(url: string) {
    const target = new URL(url);
    if (target.protocol !== 'https:' || !['checkout.stripe.com', 'billing.stripe.com'].includes(target.hostname)) throw new Error('Nieprawidłowy adres płatności. Spróbuj ponownie.');
    location.assign(target.href);
  }
  async function checkout(event: React.FormEvent) {
    event.preventDefault(); if (!selected || !state?.user || busy) return;
    const currentOwner = state.user.id;
    setBusy(true); setError('');
    try {
      const value = donation.replace(',', '.');
      if (selected === 'donation' && !/^\d+(\.\d{1,2})?$/.test(value)) throw new Error('Podaj kwotę z dokładnością do grosza.');
      const result = await api<{ url: string }>('/billing/checkout', { kind: selected, expectedUserId: state.user.id,
        acceptedTerms: accepted, authorized, ...(selected === 'donation' ? { amount: Math.round(Number(value) * 100) } : {}),
        ...(selected === 'map' || selected === 'sponsored' ? { placeId: place?.id } : {}) });
      if (owner.current !== currentOwner) throw new Error('Konto zmieniło się. Odśwież stronę przed płatnością.');
      navigateToStripe(result.url);
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }
  async function portal() {
    if (!state?.user || busy) return;
    const currentOwner = state.user.id;
    setBusy(true); setError('');
    try { const result = await api<{ url: string }>('/billing/portal', { expectedUserId: currentOwner });
      if (owner.current !== currentOwner) throw new Error('Konto zmieniło się. Odśwież stronę przed płatnością.');
      navigateToStripe(result.url); }
    catch (e) { setError((e as Error).message); setBusy(false); }
  }
  const price = (plan: Exclude<Plan, 'donation'>) => state ? money(state.plans[plan].amount) : ({ premium: '10 zł', map: '49 zł', sponsored: '99 zł' })[plan];
  const isAd = selected === 'map' || selected === 'sponsored';
  return <div className="pricing-page">
    <a className="skip-link" href="#pricing-main">Przejdź do cennika</a>
    <header className="pricing-header"><a href="/" aria-label="Miasto w zasięgu, strona główna"><BrandName /></a><nav aria-label="Nawigacja cennika"><a href="#dla-firm">Dla firm</a><a href="/app">Otwórz mapę <ArrowRight size={17} /></a></nav></header>
    <main id="pricing-main">
      <section className="pricing-hero"><div><span className="pricing-eyebrow">CENNIK I WSPARCIE</span><h1>Mapa bez opłat.<br /><span>Opcje dodatkowe.</span></h1><p>Korzystaj z mapy i informacji o dostępności bez opłat. Premium usuwa reklamy. Możesz też wesprzeć rozwój aplikacji lub promować swój lokal.</p><a className="pricing-text-link" href="#oferty">Porównaj oferty <ArrowRight size={18} /></a></div><div className="pricing-hero-art" aria-hidden="true"><div className="pricing-map-road road-one" /><div className="pricing-map-road road-two" /><div className="pricing-map-park"><span>mapa i trasy<br />bez opłat</span><Sparkles size={30} /></div><div className="pricing-map-point"><MapPin size={29} /></div><div className="pricing-art-note"><ShieldCheck size={20} /> Dane o dostępności</div></div></section>
      {error && <div className="pricing-alert" role="alert">{error}</div>}
      {notice && <div className="pricing-notice" role="status">{notice}<button type="button" onClick={refresh}>Odśwież status</button></div>}
      {new URLSearchParams(location.search).get('payment') === 'canceled' && <p className="pricing-notice" role="status">Powrót z płatności. Jeśli jej nie zakończono, oferta pozostaje nieaktywna.</p>}
      {state?.mode === 'test' && <p className="pricing-notice">Płatności testowe. Używaj wyłącznie danych testowych Stripe; nie pobieramy prawdziwych pieniędzy.</p>}
      {state && !state.enabled && <p className="pricing-notice">Płatności uruchomimy wkrótce. Możesz już poznać ofertę; obecnie nie pobieramy opłat.</p>}
      <section className="pricing-personal" id="oferty" aria-labelledby="personal-title"><div className="pricing-section-heading"><span className="pricing-eyebrow">DLA CIEBIE</span><h2 id="personal-title">Wersja bezpłatna i Premium</h2></div><div className="pricing-personal-grid">
        <article className="pricing-free"><span className="pricing-icon"><MapPin /></span><h3>Wersja bezpłatna</h3><p className="pricing-amount">0 zł <small>zawsze za podstawowe funkcje</small></p><p>Planuj drogę, poznawaj miejsca i dziel się obserwacjami.</p><ul><li><Check /> Mapa, miejsca i planowanie tras</li><li><Check /> Informacje o barierach i ich źródłach</li><li><Check /> Gra Iskry Miasta</li></ul><a className="pricing-button secondary" href="/app">Przejdź do mapy <ArrowRight size={18} /></a></article>
        <article className="pricing-premium"><span className="pricing-badge">BEZ REKLAM</span><span className="pricing-icon"><Sparkles /></span><h3>Premium</h3><p className="pricing-amount">{price('premium')} <small>/ miesiąc</small></p><p>Usuń sponsorowane pinezki i rekomendacje na urządzeniach z tym samym kontem.</p><ul><li><Check /> Bez reklamowych ikon na mapie</li><li><Check /> Bez sponsorowanych rekomendacji</li><li><Check /> Na urządzeniach z tym samym kontem</li><li><Check /> Anulowanie przedłużenia w dowolnym momencie</li></ul><button className="pricing-button" onClick={() => state?.premium ? void portal() : choose('premium')} disabled={busy}>{state?.premium ? 'Zarządzaj Premium' : 'Wybieram Premium'} <ArrowRight size={18} /></button><p className="pricing-small">{state?.premiumUntil ? `Premium opłacone do ${date(state.premiumUntil)}.` : 'Odnawiane co miesiąc. Dostępność miejsc oceniamy według tych samych danych.'}</p></article>
      </div></section>
      <section className="pricing-business" id="dla-firm" aria-labelledby="business-title"><div className="pricing-section-heading"><span className="pricing-eyebrow">DLA LOKALNYCH FIRM</span><h2 id="business-title">Reklama Twojego lokalu na mapie</h2><p>Promuj konkretny obiekt w jego rzeczywistym miejscu. Reklamy widzą osoby korzystające z bezpłatnego konta i goście.</p></div><div className="pricing-business-grid">
        <article><MapPin size={29} /><h3>Miejsce na mapie</h3><p className="pricing-amount">{price('map')} <small>/ miesiąc / obiekt</small></p><p>Wyróżniona, oznaczona jako sponsorowana pinezka Twojego lokalu.</p><ul><li><Check /> Rzeczywiste położenie obiektu</li><li><Check /> Przejście do szczegółów miejsca</li><li><Check /> Widoczność w pasującym obszarze i filtrach</li></ul><button className="pricing-button secondary" onClick={() => choose('map')}>Wybierz miejsce <ArrowRight size={18} /></button></article>
        <article><Megaphone size={29} /><h3>Mapa + polecenia</h3><p className="pricing-amount">{price('sponsored')} <small>/ miesiąc / obiekt</small></p><p>Reklama na mapie i wyróżnienie w odpowiednich wynikach wyszukiwania.</p><ul><li><Check /> Wszystko z pakietu „Miejsce na mapie”</li><li><Check /> Sponsorowane wyniki dla pasującej kategorii</li><li><Check /> Jasne oznaczenie reklamy i reklamodawcy</li></ul><button className="pricing-button secondary" onClick={() => choose('sponsored')}>Promuj swój obiekt <ArrowRight size={18} /></button></article>
      </div><p className="pricing-business-note"><ShieldCheck size={21} /> Sponsoring nie zmienia informacji o dostępności i nie omija filtrów. Emisja zależy od obszaru mapy, wyszukiwania i dostępnego miejsca. Nie gwarantujemy liczby wyświetleń ani wizyt.</p></section>
      <section className="pricing-support" aria-labelledby="support-title"><div className="pricing-support-icon"><Heart size={33} /></div><div><span className="pricing-eyebrow">JEDNORAZOWE WSPARCIE</span><h2 id="support-title">Wesprzyj rozwój jednorazowo.</h2><p>Wybierz własną kwotę od 5 zł. To jednorazowe wsparcie bez automatycznego odnawiania i bez abonamentu Premium.</p></div><button className="pricing-button" onClick={() => choose('donation')}>Chcę wesprzeć <Heart size={18} /></button></section>
      {selected && <section className="pricing-checkout" ref={form} tabIndex={-1} aria-labelledby="checkout-title"><span className="pricing-eyebrow">TWÓJ WYBÓR</span><h2 id="checkout-title">{titles[selected]}</h2>{!state ? <p role="status">Sprawdzamy konto i dostępność płatności…</p> : !state.user ? <div><p>Zaloguj się, żeby połączyć płatność i wybraną ofertę z Twoim kontem.</p><a className="pricing-button" href="/sign-in?return_to=%2Fcennik">Zaloguj się i wróć do cennika <ArrowRight size={18} /></a></div> : <form onSubmit={checkout}>
        <p>Płatność dla konta: <strong>{state.user.displayName}</strong></p>
        {isAd && <><label htmlFor="ad-place-search">Znajdź swój obiekt</label><input id="ad-place-search" value={query} onChange={e => { setQuery(e.target.value); setPlace(null); }} placeholder="Nazwa restauracji, sklepu lub hotelu" autoComplete="off" />{searching && <p role="status">Szukamy miejsc…</p>}<div className="pricing-place-results">{places.map(p => <button type="button" aria-pressed={place?.id === p.id} key={p.id} onClick={() => setPlace(p)}><MapPin size={18} /><span><strong>{p.name}</strong><small>{p.address}</small></span>{place?.id === p.id && <Check size={20} />}</button>)}</div>{!searching && query.length >= 2 && !places.length && <p>Nie znaleziono pasującego obiektu. Najpierw dodaj jego paszport w <a href="/app?obiekty=1">sekcji Moje obiekty</a>.</p>}{place && <p>Promujesz: <strong>{place.name}</strong>. Lokalizacja i opis pochodzą z jego karty.</p>}<label className="pricing-checkbox"><input type="checkbox" required checked={authorized} onChange={e => setAuthorized(e.target.checked)} />Mam prawo promować ten obiekt.</label></>}
        {selected === 'donation' && <><label htmlFor="support-amount">Kwota jednorazowego wsparcia (zł)</label><div className="pricing-donation-presets">{['10', '20', '50'].map(value => <button type="button" key={value} aria-pressed={donation === value} onClick={() => setDonation(value)}>{value} zł</button>)}</div><input id="support-amount" type="number" min="5" max="1000" step="0.01" required value={donation} onChange={e => setDonation(e.target.value)} /><p className="pricing-small">Od 5 do 1000 zł. Jednorazowa wpłata nie odblokowuje Premium.</p></>}
        <div className="pricing-checkout-summary">{selected === 'donation' ? `Jednorazowo: ${money(Math.round(Number(donation.replace(',', '.')) * 100) || 0)}` : `${price(selected)} miesięcznie. Abonament odnawia się automatycznie do anulowania.`}</div>
        <label className="pricing-checkbox"><input type="checkbox" required checked={accepted} onChange={e => setAccepted(e.target.checked)} />{selected === 'donation' ? 'Potwierdzam jednorazową wpłatę w podanej kwocie.' : 'Akceptuję cenę, miesięczne odnawianie i zasady oferty opisane na tej stronie. Przedłużenie mogę anulować w panelu płatności.'}</label>
        <button className="pricing-button" disabled={busy || !state.enabled || !accepted || (isAd && (!place || !authorized))} type="submit">{busy ? 'Otwieramy płatność…' : !state.enabled ? 'Płatności wkrótce' : 'Przejdź do płatności Stripe'} <ExternalLink size={17} /></button><p className="pricing-small">Dane karty podajesz bezpośrednio w Stripe. Oferta uaktywni się po potwierdzeniu płatności.</p>
      </form>}</section>}
      {state?.canManage && <section className="pricing-account" aria-labelledby="payments-title"><h2 id="payments-title">Twoje płatności</h2>{state.subscriptions.map(sub => <div key={sub.id}><strong>{titles[sub.kind]}{sub.placeName ? ` · ${sub.placeName}` : ''}</strong><span>{sub.active ? `Dostęp do ${date((sub.accessUntil ?? sub.paidUntil)!)}` : 'Obecnie nieaktywne'}{sub.cancelAtPeriodEnd ? '. Przedłużenie anulowane.' : ''}</span></div>)}<button className="pricing-button secondary" disabled={busy || !state.enabled} onClick={portal}>Zarządzaj płatnościami i anuluj przedłużenie <ExternalLink size={17} /></button></section>}
      <section className="pricing-faq" aria-labelledby="faq-title"><h2 id="faq-title">Dobrze wiedzieć.</h2>{[
        ['Czy bez Premium mogę korzystać z aplikacji?', 'Tak. Mapa, planowanie tras, informacje o dostępności i Iskry pozostają bezpłatne. Premium usuwa reklamowe pinezki i sponsorowane rekomendacje.'],
        ['Czy z Premium znikną restauracje i sklepy?', 'Nie. Miejsca nadal są dostępne w zwykłych wynikach. Znikają płatne wyróżnienia, a kolejność nie uwzględnia sponsoringu.'],
        ['Jak zrezygnować z abonamentu?', 'W sekcji Twoje płatności otwórz panel Stripe i anuluj przedłużenie. Korzystasz z opłaconego okresu do jego końca. Bez skutecznej kolejnej płatności dostęp nie jest przedłużany.'],
        ['Czy sponsorowane miejsce ma potwierdzoną dostępność?', 'Sponsoring dotyczy wyłącznie widoczności. Źródła, daty, bariery i niepewne informacje są prezentowane na takich samych zasadach dla wszystkich miejsc.'],
        ['Czym różni się wsparcie od Premium?', 'Wsparcie jednorazowe ma wybraną przez Ciebie kwotę i nie odnawia się. Premium to abonament 10 zł miesięcznie, który wyłącza oba rodzaje reklam na zalogowanym koncie.'],
      ].map(([title, text]) => <details key={title}><summary>{title}</summary><p>{text}</p></details>)}</section>
    </main><footer className="pricing-footer"><a href="/app"><ArrowLeft size={16} /> Wróć do miasta</a><span>Miasto w zasięgu · Ceny w PLN, kwota do zapłaty przed potwierdzeniem w Stripe.</span></footer>
  </div>;
}
