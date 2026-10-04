import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Armchair, BookOpen, Check, CircleHelp, DoorOpen, Flower2, History, Leaf, LockKeyhole, MapPin, Pause, Play, Plus, Search, ShieldCheck, Sparkles, Sprout, X } from 'lucide-react';
import { api, readLocal, writeLocal } from './api';
import './game.css';
import BrandName from './BrandName';
import GameLocationPicker from './GameLocationPicker';
import { motionReduced } from './display-preferences';
import GardenPicture, { gardenStage, Ornament } from './GameGarden';
import GameAlbum from './GameAlbum';

type Item = { id: string; name: string; cost: number; description: string; icon: string };
type Decoration = { slot: number; itemId: string };
type Progress = { earned: number; spent: number; balance: number; observations: number; kinds: string[]; claimedMissions: string[]; unlocked: string[]; decorations: Decoration[]; items: Item[]; authenticated: boolean };
type User = { id: string; displayName: string };
type Mission = { id: string; kind: string; source: 'report' | 'observation'; title: string; subtitle: string; points: number; instruction: string; target: { id: string; name: string; address: string; coordinates: [number, number]; sourceUrl: string } };
type Training = { earned: number; completed: string[]; unlocked: string[]; decorations: Decoration[] };
type Reward = { title: string; points: number; bonus?: number; training: boolean };
type LocationHint = { id: string; label: string; coordinates: [number, number]; precision: string };
type PositiveObservation = { id: string; type: string; label: string; description: string; observedAt: string; validUntil: string; status: 'active' | 'withdrawn'; stale: boolean };
const POSITIVE_KINDS = ['rest_place', 'step_free_entrance', 'lift_working'];
const STORAGE = 'iskry-miasta-training-v1';
const ITEMS: Item[] = [
  { id: 'flowers', name: 'Łąka iskier', cost: 15, description: 'Kolorowe kwiaty na wybranej grządce.', icon: 'flower' },
  { id: 'lantern', name: 'Lampion odkrywcy', cost: 25, description: 'Ciepłe światło na spokojny wieczór.', icon: 'lantern' },
  { id: 'pond', name: 'Sadzawka spokoju', cost: 35, description: 'Mały staw otoczony kamieniami.', icon: 'pond' },
  { id: 'tree', name: 'Drzewo opowieści', cost: 45, description: 'Rośnie razem z dobrymi odkryciami.', icon: 'tree' },
];
const TRAINING = [
  { id: 'training-kerb', kind: 'kerb', title: 'Brama z niespodzianką', subtitle: 'Czy dostrzegasz drobny szczegół?', points: 20, question: 'Co warto zapisać o tym wymyślonym wejściu?', choices: ['Szerokie drzwi wystarczą, by uznać wejście za dostępne', 'Przed wejściem jest stopień, który trzeba opisać', 'Nie trzeba patrzeć na drogę do drzwi'], answer: 1, hint: 'Spójrz na dolną krawędź drzwi. Szerokość to tylko część historii.', success: 'Masz oko do szczegółów! Jeden stopień może zmienić całą drogę.' },
  { id: 'training-width', kind: 'width', title: 'Miara ma znaczenie', subtitle: 'Tym razem liczy się dokładność.', points: 20, question: 'Miara pokazuje wolną przestrzeń między słupkami. Co zapiszesz?', choices: ['Około jednego metra, na oko', '86 cm wolnego przejścia', '86 cm szerokości siedziska'], answer: 1, hint: 'Zapisz dokładny odczyt i to, co zmierzono. Nie chodzi o wymiary wózka.', success: 'Dokładnie 86 cm. Konkretny pomiar pomaga komuś podjąć własną decyzję.' },
  { id: 'training-surface', kind: 'surface', title: 'Historia pod kołami', subtitle: 'Nie każda ścieżka jest taka sama.', points: 20, question: 'Jak opisać zaznaczony fragment wymyślonego chodnika?', choices: ['Równa i gładka powierzchnia', 'Na pewno nieprzejezdny dla wszystkich', 'Nierówne płyty z wystającymi krawędziami'], answer: 2, hint: 'Opisz to, co widzisz. Nie zgaduj, kto da radę przejechać.', success: 'Opisujesz fakty, bez oceniania możliwości innych. To dobry trop.' },
  { id: 'training-source', kind: 'source', title: 'Detektyw niewiadomych', subtitle: 'Czasem najlepsza odpowiedź to: nie wiem.', points: 20, question: 'Na karcie miejsca nie ma informacji o windzie. Co z tego wynika?', choices: ['Nie znamy aktualnego stanu windy', 'Winda na pewno działa', 'W tym miejscu na pewno nie ma windy'], answer: 0, hint: 'Brak wpisu nie potwierdza ani istnienia, ani braku udogodnienia.', success: 'Niewiadoma też jest cenna. Dzięki za niezgadywanie!' },
  { id: 'training-rest', kind: 'rest_place', title: 'Miejsce na oddech', subtitle: 'Czasem skarbem jest zwykła ławka.', points: 20, question: 'Przy alejce stoi ławka z oparciem. Jak podzielisz się tym odkryciem?', choices: ['Dodam ją jako przeszkodę, żeby zdobyć punkty', 'Opiszę ławkę, jej położenie i dojście jako dobre odkrycie', 'Napiszę, że cała okolica jest dostępna dla wszystkich'], answer: 1, hint: 'Dobre miejsce to osobne odkrycie. Opisz ławkę i dojście, bez tworzenia nieistniejącej przeszkody.', success: 'Jest gdzie złapać oddech! Twój ogród też dostał przytulny zakątek.' },
  { id: 'training-entry', kind: 'step_free_entrance', title: 'Drzwi do odkrycia', subtitle: 'Dobry znak, ale jeszcze nie cała historia.', points: 20, question: 'Do drzwi prowadzi wejście bez schodów. Co naprawdę wiemy?', choices: ['Każdy wózek na pewno zmieści się w środku', 'Każda trasa prowadząca tu jest już sprawdzona', 'To wejście nie ma schodów; szerokość i dalszą drogę trzeba sprawdzić osobno'], answer: 2, hint: 'Jeden dobry szczegół nie potwierdza całej drogi. Zapisuj konkretną obserwację.', success: 'Otwarte drzwi do lepszych informacji. Dobre odkrycia też budują miasto.' },
];
const EMPTY: Progress = { earned: 0, spent: 0, balance: 0, observations: 0, kinds: [], claimedMissions: [], unlocked: [], decorations: [], items: ITEMS, authenticated: false };
function savedTraining(): Training {
  const raw = readLocal<Partial<Training> | null>(STORAGE, {}), value = raw && typeof raw === 'object' ? raw : {};
  const completed = [...new Set(Array.isArray(value.completed) ? value.completed.filter(id => TRAINING.some(mission => mission.id === id)) : [])];
  const earned = TRAINING.filter(item => completed.includes(item.id)).reduce((sum, item) => sum + item.points, 0);
  let unlocked = [...new Set(Array.isArray(value.unlocked) ? value.unlocked.filter(id => ITEMS.some(item => item.id === id)) : [])];
  if (unlocked.reduce((sum, id) => sum + ITEMS.find(item => item.id === id)!.cost, 0) > earned) unlocked = [];
  const decorations = Array.isArray(value.decorations) ? value.decorations.filter(item => item && Number.isInteger(item.slot) && item.slot >= 0 && item.slot <= 3 && unlocked.includes(item.itemId)) : [];
  return { earned, completed, unlocked, decorations: decorations.filter((item, index) => decorations.findIndex(other => other.slot === item.slot) === index) };
}

function Garden({ progress, paused, selectedSlot, onSlot }: { progress: Progress; paused: boolean; selectedSlot: number; onSlot: (slot: number) => void }) {
  const plots = [[260, 268], [384, 268], [256, 337], [387, 337]];
  return <div className={`ig-world ${paused ? 'ig-paused' : ''}`}>
    <GardenPicture progress={progress} selectedSlot={selectedSlot} />
    <div className="ig-plot-controls" role="group" aria-label="Wybierz grządkę do udekorowania">{plots.map((_, index) => <button key={index} type="button" onClick={() => onSlot(index)} className={selectedSlot === index ? 'selected' : ''} aria-pressed={selectedSlot === index} aria-label={`Grządka ${index + 1}${progress.decorations.find(item => item.slot === index) ? ', z ozdobą' : ', pusta'}`}>{index + 1}{progress.decorations.some(item => item.slot === index) ? <Leaf size={14} aria-hidden="true" /> : <Plus size={13} aria-hidden="true" />}</button>)}</div>
  </div>;
}

function PuzzlePicture({ kind }: { kind: string }) {
  return <svg className="ig-puzzle-picture" viewBox="0 0 450 230" role="img" aria-label={kind === 'rest_place' ? 'Schemat treningowy: przy alejce stoi ławka z oparciem, obok jest wolne miejsce.' : kind === 'step_free_entrance' ? 'Schemat treningowy: do otwartych drzwi prowadzi płaskie wejście bez schodów; szerokość nie została zmierzona.' : kind === 'width' ? 'Schemat treningowy: miara między słupkami pokazuje 86 centymetrów.' : kind === 'kerb' ? 'Schemat treningowy: przed szerokimi drzwiami znajduje się stopień.' : kind === 'surface' ? 'Schemat treningowy: chodnik ma nierówne, uniesione płyty.' : 'Schemat treningowy: karta windy z napisem brak danych.'}>
    <rect width="450" height="230" rx="22" fill="#e9eddb" /><ellipse cx="225" cy="192" rx="135" ry="15" fill="#d6ddc4" />
    {kind === 'rest_place' ? <g><path d="m88 180 106-60 171 53-106 43Z" fill="#d0c4a3" /><rect x="135" y="115" width="165" height="18" rx="6" fill="#bd8257" /><rect x="144" y="60" width="147" height="19" rx="5" fill="#d7a273" /><rect x="144" y="86" width="147" height="16" rx="4" fill="#d7a273" /><path d="M154 70v110M280 70v110" stroke="#577354" strokeWidth="8" strokeLinecap="round" /><path d="M125 107h28m137 0h23" stroke="#577354" strokeWidth="7" strokeLinecap="round" /><circle cx="328" cy="74" r="23" fill="#f4d77e" /><path d="m318 73 8 8 14-17" stroke="#496a55" strokeWidth="4" fill="none" /><path d="M91 159v-23m0 12-9-9m9 4 8-9" stroke="#679057" strokeWidth="4" /></g>
      : kind === 'step_free_entrance' ? <g><rect x="142" y="25" width="168" height="152" rx="7" fill="#e1c9a3" /><rect x="172" y="50" width="110" height="127" fill="#739589" /><path d="m177 52 51 18v105h-51Z" fill="#b9d0b8" /><circle cx="215" cy="122" r="4" fill="#577354" /><path d="M142 177h168l41 33H101Z" fill="#d9d6bb" /><path d="M210 207v-22m-7 8 7-8 7 8" stroke="#5d7755" strokeWidth="4" fill="none" /><circle cx="335" cy="62" r="22" fill="#f6da87" /><path d="m326 62 7 7 13-16" stroke="#496a55" strokeWidth="4" fill="none" /></g>
      : kind === 'kerb' ? <g><rect x="139" y="23" width="172" height="158" rx="7" fill="#e1c9a3" /><rect x="168" y="46" width="114" height="128" rx="2" fill="#6e9890" /><path d="M225 46v128" stroke="#d9ead1" strokeWidth="3" /><circle cx="239" cy="112" r="4" fill="#f2d48e" /><path d="M154 166h142v23H154Z" fill="#b98969" /><path d="M154 166h142l-14-10H166Z" fill="#d3af87" /><path d="M316 170h35m-9-8 9 8-9 8" stroke="#ce6d50" strokeWidth="4" fill="none" /><text x="326" y="146" fontSize="13" fill="#6c4b35">stopień</text></g>
      : kind === 'width' ? <g><rect x="113" y="62" width="38" height="112" rx="7" fill="#91a698" /><rect x="298" y="62" width="38" height="112" rx="7" fill="#91a698" /><rect x="151" y="112" width="147" height="25" fill="#f7d77d" />{Array.from({ length: 15 }, (_, index) => <path key={index} d={`M${153 + index * 10} 112v${index % 5 ? 7 : 13}`} stroke="#735b38" strokeWidth="1" />)}<text x="225" y="90" fontSize="29" fontWeight="800" fill="#294c3f" textAnchor="middle">86 cm</text><path d="M160 152h129m-122-5-7 5 7 5m115-10 7 5-7 5" stroke="#496a55" strokeWidth="2" fill="none" /></g>
      : kind === 'surface' ? <g><path d="m92 136 122-66 145 81-124 65Z" fill="#bcc4ad" /><path d="m102 131 37-19 44 23-35 20Z" fill="#e9e6d5" /><path d="m151 106 34-19 44 24-35 18Z" fill="#e2dfcb" /><path d="m196 81 21-11 45 25-24 13Z" fill="#e9e6d5" /><path d="m157 158 37-20 44 24-36 21Z" fill="#efddbe" /><path d="m157 158 37-20v-14l-37 20Z" fill="#9b997f" /><path d="m157 144 37-20 44 24-36 21Z" fill="#f2e5cf" /><path d="m207 132 33-18 44 24-33 20Z" fill="#e9e6d5" /><path d="m251 106 22-11 43 24-21 12Z" fill="#e9e6d5" /><path d="m210 187 36-20 45 23-36 20Z" fill="#e9e6d5" /><path d="m258 160 34-18 44 24-33 19Z" fill="#e9e6d5" /><path d="m303 135 23-12 33 19-24 12Z" fill="#e9e6d5" /><circle cx="192" cy="149" r="43" fill="none" stroke="#cd785e" strokeDasharray="5 5" strokeWidth="3" /></g>
      : <g><rect x="123" y="44" width="203" height="139" rx="15" fill="#fffaf0" stroke="#c1cbb6" strokeWidth="2" /><rect x="151" y="69" width="36" height="41" rx="5" fill="#cedcc2" /><path d="m164 95 0-16m-5 5 5-5 5 5" stroke="#496a55" strokeWidth="2" fill="none" /><text x="205" y="96" fontSize="19" fontWeight="700" fill="#294c3f">Winda</text><text x="225" y="150" fontSize="21" fill="#496a55" textAnchor="middle">Brak danych</text></g>}
    <text x="20" y="215" fontSize="10" fill="#4c6352">Wymyślony przykład treningowy</text>
  </svg>;
}

export default function Game() {
  const [mode, setMode] = useState<'training' | 'city'>('training');
  const [training, setTraining] = useState<Training>(savedTraining);
  const [player, setPlayer] = useState<Progress>(EMPTY);
  const [user, setUser] = useState<User | null>(null);
  const [accountLoading, setAccountLoading] = useState(true);
  const [albumAccount, setAlbumAccount] = useState<string | null>(null);
  const [panel, setPanel] = useState<'missions' | 'garden' | 'history'>('missions');
  const [selectedSlot, setSelectedSlot] = useState(0);
  const [paused, setPaused] = useState(false);
  const [missionId, setMissionId] = useState<string | null>(null);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [missionFilter, setMissionFilter] = useState<'all' | 'positive' | 'barrier'>('all');
  const [myObservations, setMyObservations] = useState<PositiveObservation[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [locationHints, setLocationHints] = useState<LocationHint[]>([]);
  const [area, setArea] = useState<LocationHint | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');
  const [busy, setBusy] = useState(false);
  const [reward, setReward] = useState<Reward | null>(null);
  const [description, setDescription] = useState('');
  const [selectedPoint, setSelectedPoint] = useState<[number, number] | null>(null);
  const [width, setWidth] = useState('');
  const [observed, setObserved] = useState(false);
  const [pendingRecord, setPendingRecord] = useState<string | null>(null);
  const [birdMessage, setBirdMessage] = useState(0);
  const gardenRef = useRef<HTMLElement>(null);
  const focusRef = useRef<HTMLHeadingElement>(null);
  const decorateHeading = useRef<HTMLHeadingElement>(null);
  const pendingRewardFocus = useRef<boolean | null>(null);
  const accountIdRef = useRef<string | null>(null);
  const trainingSpent = training.unlocked.reduce((total, id) => total + (ITEMS.find(item => item.id === id)?.cost ?? 0), 0);
  const progress: Progress = mode === 'training' ? { ...EMPTY, earned: training.earned, balance: training.earned - trainingSpent, spent: trainingSpent, observations: training.completed.length,
    kinds: TRAINING.filter(item => training.completed.includes(item.id)).map(item => item.kind), claimedMissions: training.completed, unlocked: training.unlocked, decorations: training.decorations } : player;
  const selectedTraining = TRAINING.find(item => item.id === missionId);
  const selectedMission = missions.find(item => item.id === missionId);
  const positiveMission = selectedMission?.source === 'observation';
  const visibleMissions = missions.filter(item => missionFilter === 'all' || (item.source === 'observation') === (missionFilter === 'positive'));
  const stage = gardenStage(progress.earned);
  const threshold = [15, 40, 75].find(value => value > progress.earned);
  const trainingComplete = training.completed.length === TRAINING.length;
  const tips = [mode === 'training' && trainingComplete ? 'Twój ogród ma już swoją historię. Ułóż ozdoby i zachowaj pocztówkę w albumie.' : 'Hej, jestem Iskra! Zacznij od jednego małego odkrycia.', 'Nie ścigamy czasu. Ogród poczeka na Ciebie.', 'Miasto najlepiej poznaje się z uważnością.', 'Nie wiesz? Nie zgaduj. To też dobra obserwacja.'];

  useEffect(() => {
    const title = document.title;
    let manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const oldHref = manifest?.getAttribute('href');
    const created = !manifest;
    if (!manifest) { manifest = document.createElement('link'); manifest.rel = 'manifest'; document.head.append(manifest); }
    manifest.href = '/iskry.webmanifest'; document.title = 'Iskry Miasta · Twój mały ogród';
    return () => { document.title = title; if (created) manifest.remove(); else if (oldHref) manifest.setAttribute('href', oldHref); };
  }, []);

  useEffect(() => {
    let active = true, generation = 0;
    const refresh = () => {
      const request = ++generation; setAccountLoading(true); setAlbumAccount(null);
      return Promise.all([api<{ user: User | null }>('/auth/me'), api<Progress>('/game/state')]).then(([account, state]) => {
      if (active && request === generation) { if (accountIdRef.current !== (account.user?.id ?? null)) { setMissionId(null); setPendingRecord(null); setReward(null); } accountIdRef.current = account.user?.id ?? null; setUser(account.user); setPlayer(state); setAlbumAccount(account.user?.id ?? null); }
    }).catch(() => { /* Local training stays available without backend. */ }).finally(() => { if (active && request === generation) setAccountLoading(false); });
    };
    refresh(); window.addEventListener('focus', refresh);
    return () => { active = false; window.removeEventListener('focus', refresh); };
  }, []);
  useEffect(() => {
    if (mode !== 'city' || !user) return;
    let active = true;
    const timeout = window.setTimeout(() => {
      setSearching(true);
      const near = area ? `&lon=${area.coordinates[0]}&lat=${area.coordinates[1]}` : '';
      api<{ missions: Mission[] }>(`/game/missions?q=${encodeURIComponent(query)}${near}`).then(result => { if (active) setMissions(result.missions); }).catch(cause => { if (active) setError(cause.message); }).finally(() => { if (active) setSearching(false); });
      if (query.trim().length >= 2) api<{ locations: LocationHint[] }>(`/locations?q=${encodeURIComponent(query)}&limit=5`).then(result => { if (active) setLocationHints(result.locations); }).catch(() => { if (active) setLocationHints([]); });
      else setLocationHints([]);
    }, 250);
    return () => { active = false; window.clearTimeout(timeout); };
  }, [mode, query, area, user, player.observations]);
  useEffect(() => {
    if (!missionId || !focusRef.current) return;
    focusRef.current.focus({ preventScroll: true });
    if (matchMedia('(max-width: 850px)').matches) focusRef.current.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, [missionId]);
  useEffect(() => {
    if (panel !== 'garden' || pendingRewardFocus.current === null || !decorateHeading.current) return;
    const keyboard = pendingRewardFocus.current;
    pendingRewardFocus.current = null;
    decorateHeading.current.focus({ preventScroll: true });
    const target = keyboard ? decorateHeading.current : gardenRef.current;
    target?.scrollIntoView({ block: 'start', behavior: keyboard || motionReduced() ? 'instant' : 'smooth' });
  }, [panel, reward]);
  useEffect(() => {
    if (mode !== 'city' || panel !== 'history' || !user) return;
    let active = true; setHistoryLoading(true);
    api<{ observations: PositiveObservation[] }>('/observations/mine').then(result => { if (active) setMyObservations(result.observations); })
      .catch(cause => { if (active) setError(cause.message); }).finally(() => { if (active) setHistoryLoading(false); });
    return () => { active = false; };
  }, [mode, panel, user]);

  async function withdrawObservation(item: PositiveObservation) {
    if (!user || busy) return;
    setBusy(true); setError('');
    try {
      const result = await api<PositiveObservation>(`/observations/${item.id}/withdraw`, { expectedUserId: user.id });
      setMyObservations(items => items.map(value => value.id === item.id ? result : value));
      setHint('Odkrycie wycofane z publicznej listy. Historia i przyznane wcześniej iskry pozostają; ten sam wpis nie daje kolejnej nagrody.');
      if (pendingRecord === item.id) { setPendingRecord(null); writeLocal('iskry-miasta-pending', null); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Nie udało się wycofać odkrycia.'); }
    finally { setBusy(false); }
  }

  function saveTraining(next: Training) { setTraining(next); if (!writeLocal(STORAGE, next)) setHint('Postęp działa w tej karcie, ale przeglądarka nie pozwala go zachować po zamknięciu.'); }
  function openMission(id: string) {
    setMissionId(id); setPanel('missions'); setHint(''); setError(''); setReward(null); setDescription(''); setWidth(''); setSelectedPoint(null); setObserved(false);
    const pending = readLocal<{ reportId?: string; observationId?: string; missionId: string; userId: string } | null>('iskry-miasta-pending', null);
    setPendingRecord(mode === 'city' && pending?.missionId === id && pending.userId === user?.id ? (missions.find(item => item.id === id)?.source === 'observation' ? pending.observationId ?? null : pending.reportId ?? null) : null);
  }
  function showGarden(nextReward: Reward) {
    pendingRewardFocus.current = document.activeElement?.matches(':focus-visible') ?? false;
    setReward(nextReward); setMissionId(null); setPanel('garden'); setError(''); setHint('');
  }
  function answerTraining(choice: number) {
    if (!selectedTraining || training.completed.includes(selectedTraining.id)) return;
    if (choice !== selectedTraining.answer) { setHint(selectedTraining.hint); return; }
    const next = { ...training, earned: training.earned + selectedTraining.points, completed: [...training.completed, selectedTraining.id] };
    saveTraining(next); showGarden({ title: selectedTraining.success, points: selectedTraining.points, training: true });
  }
  async function decorate(item: Item) {
    if (busy) return;
    setError('');
    if (mode === 'training') {
      if (!training.unlocked.includes(item.id) && progress.balance < item.cost) { setHint('Jeszcze chwila! Rozwiąż kolejną zagadkę, a zbierzesz iskry na tę ozdobę.'); return; }
      saveTraining({ ...training, unlocked: [...new Set([...training.unlocked, item.id])], decorations: [...training.decorations.filter(value => value.slot !== selectedSlot), { slot: selectedSlot, itemId: item.id }] });
      setHint(`${item.name} na grządce ${selectedSlot + 1}. Już odblokowaną ozdobę możesz stawiać bez kolejnych kosztów.`);
      return;
    }
    setBusy(true);
    try { const result = await api<{ state: Progress }>('/game/decorate', { itemId: item.id, slot: selectedSlot, expectedUserId: user?.id }); setPlayer(result.state); setHint(`${item.name} zdobi grządkę ${selectedSlot + 1}.`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Nie udało się zapisać ogrodu.'); }
    finally { setBusy(false); }
  }
  async function submitObservation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selectedMission || !user || busy) return;
    setBusy(true); setError('');
    try {
      let recordId = pendingRecord;
      if (!recordId) {
        if (!observed) throw new Error('Potwierdź własną obserwację po zatrzymaniu się.');
        if (!selectedPoint) throw new Error('Wybierz punkt na mapie lub adres i potwierdź miejsce obserwacji.');
        const words = description.toLocaleLowerCase('pl').normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').filter(Boolean);
        if (description.trim().length < 35 || words.length < 6 || new Set(words).size < 5) throw new Error('Dodaj konkretny opis: minimum 35 znaków, 6 słów i 5 różnych słów.');
        if (selectedMission.kind === 'width' && (!width.trim() || !Number.isFinite(Number(width)) || Number(width) < 20 || Number(width) > 400)) throw new Error('Podaj zmierzoną wolną szerokość od 20 do 400 cm.');
        const content = { expectedUserId: user.id, coordinates: selectedPoint, description: description.trim() };
        const result = positiveMission
          ? await api<{ id: string }>('/observations', { ...content, type: selectedMission.kind, observedNow: true })
          : await api<{ id: string }>('/reports', { ...content, kind: selectedMission.kind, ...(selectedMission.kind === 'width' ? { widthCm: Number(width) } : {}) });
        recordId = result.id; setPendingRecord(recordId); writeLocal('iskry-miasta-pending', { [positiveMission ? 'observationId' : 'reportId']: recordId, missionId: selectedMission.id, userId: user.id });
      }
      const result = await api<{ awarded: number; varietyBonus: number; state: Progress }>('/game/claim', { [positiveMission ? 'observationId' : 'reportId']: recordId, missionId: selectedMission.id, expectedUserId: user.id });
      setPlayer(result.state); setPendingRecord(null); writeLocal('iskry-miasta-pending', null);
      showGarden({ title: result.awarded ? (positiveMission ? 'Dobre odkrycie zapisane osobno od przeszkód. Ogród rozkwita!' : 'Obserwacja zapisana. Twój ogród dostał nową energię!') : 'Te iskry są już w Twoim ogrodzie. Nic nie policzono drugi raz.', points: result.awarded, bonus: result.varietyBonus, training: false });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Nie udało się zapisać obserwacji.'); }
    finally { setBusy(false); }
  }

  return <div className={`ig-app ${paused ? 'ig-paused' : ''}`}>
    <a className="ig-skip" href="#ig-main">Przejdź do gry</a>
    <header className="ig-header"><a href="/" className="ig-back" aria-label="Miasto w zasięgu, strona główna"><ArrowLeft size={18} aria-hidden="true" /><BrandName /></a><a className="ig-logo" href="/gra"><span><Sparkles size={25} aria-hidden="true" /></span><strong>Iskry<span>Miasta</span></strong></a><a className="ig-account" href="/app?konto=1">{user?.displayName || 'Twoje konto'}<ArrowUpRight size={17} aria-hidden="true" /></a></header>
    <main id="ig-main" className="ig-main">
      <div className="ig-intro"><div><span className="ig-kicker">Gra o dostępności miasta</span><h1 aria-label="Zbieraj iskry, urządzaj ogród.">Zbieraj iskry,<br />{' '}<span>urządzaj ogród.</span></h1><p>Rozwiązuj zagadki w treningu lub dodawaj obserwacje z miasta.<br className="ig-desktop-break" /> Za zdobyte iskry odblokowuj ozdoby do ogrodu.</p>{mode === 'training' && training.completed.length < TRAINING.length && <button type="button" className="ig-start" onClick={() => openMission(TRAINING.find(item => !training.completed.includes(item.id))!.id)}>Zacznij małe odkrycie <ArrowRight size={17} aria-hidden="true" /></button>}</div><div className="ig-mode-switch" role="group" aria-label="Tryb gry"><button type="button" aria-pressed={mode === 'training'} onClick={() => { setMode('training'); setMissionId(null); setReward(null); setError(''); setHint(''); }}><Sprout size={18} aria-hidden="true" />Trening</button><button type="button" aria-pressed={mode === 'city'} onClick={() => { setMode('city'); setMissionId(null); setReward(null); setError(''); setHint(''); }}><MapPin size={18} aria-hidden="true" />Moje miasto</button></div></div>
      <div className={`ig-mode-note ${mode === 'city' ? 'city' : ''}`}><span>{mode === 'training' ? <Sprout size={19} aria-hidden="true" /> : <ShieldCheck size={19} aria-hidden="true" />}</span><p>{mode === 'training' ? <><strong>Tryb treningowy.</strong> Zagadki i iskry są treningowe. Nic nie trafia na prawdziwą mapę.</> : <><strong>Prawdziwe miejsce, prawdziwa obserwacja.</strong> Graj po zatrzymaniu się. Zapisuj dobre odkrycia osobno od przeszkód. Nie zgaduj.</>}</p></div>

      <div className="ig-game-layout">
        <section ref={gardenRef} className="ig-garden" aria-labelledby="ig-garden-title"><div className="ig-garden-head"><div><span className="ig-kicker">{mode === 'training' ? 'Ogród treningowy' : 'Twój miejski ogród'}</span><h2 id="ig-garden-title">{stage}</h2></div><button className="ig-pause" type="button" aria-pressed={paused} aria-label={paused ? 'Wznów animacje ogrodu' : 'Zatrzymaj animacje ogrodu'} onClick={() => setPaused(value => !value)}>{paused ? <Play size={18} aria-hidden="true" /> : <Pause size={18} aria-hidden="true" />}</button></div>
          <div className="ig-garden-stats"><span><Sparkles size={17} aria-hidden="true" /><strong>{progress.balance}</strong> iskier do użycia</span><span>{progress.observations} {mode === 'training' ? 'odkryć treningowych' : 'obserwacji z punktami'}</span></div>
          {reward && <div className="ig-garden-gift"><Sparkles size={18} aria-hidden="true" /><strong>+{reward.points} iskier</strong><span className="ig-petal-burst" aria-hidden="true">{[0, 1, 2, 3, 4, 5].map(index => <i key={index} style={{ rotate: `${index * 60}deg` }} />)}</span><span>Masz więcej iskier na ozdoby.</span></div>}
          <Garden progress={progress} paused={paused} selectedSlot={selectedSlot} onSlot={slot => { setSelectedSlot(slot); setPanel('garden'); setMissionId(null); setHint(''); }} />
          {progress.kinds.some(kind => POSITIVE_KINDS.includes(kind)) && <div className="ig-world-discoveries">{progress.kinds.includes('rest_place') && <span><Armchair size={15} aria-hidden="true" />Zakątek odpoczynku</span>}{progress.kinds.includes('step_free_entrance') && <span><DoorOpen size={15} aria-hidden="true" />Otwarte drzwi</span>}{progress.kinds.includes('lift_working') && <span><Sparkles size={15} aria-hidden="true" />Nowa perspektywa</span>}</div>}
          <div className="ig-growth"><div><span>{threshold ? `Jeszcze ${threshold - progress.earned} iskier do kolejnego rozkwitu` : 'Twój ogród rozkwitł. Teraz urządź go po swojemu.'}</span><strong>{threshold ? `${progress.earned} / ${threshold}` : `${progress.earned} zdobytych`}</strong></div><progress value={Math.min(progress.earned, 75)} max="75" aria-label="Rozwój ogrodu" /></div>
          <button type="button" className="ig-bird" onClick={() => setBirdMessage(value => (value + 1) % tips.length)} aria-label={`Iskra mówi: ${tips[birdMessage]}. Kliknij, aby przeczytać następną wskazówkę.`}><svg viewBox="0 0 75 75" aria-hidden="true"><ellipse cx="37" cy="64" rx="22" ry="5" fill="#c6cdae" /><path d="M21 44c-2-21 11-34 28-24 9 5 11 21 3 32-10 12-26 6-31-8Z" fill="#db926b" /><path d="M21 38c-17-7-15 10 0 14" fill="#b56a4d" /><ellipse cx="42" cy="45" rx="12" ry="14" fill="#f5c795" /><circle cx="45" cy="29" r="3" fill="#354a39" /><path d="m53 32 13 6-14 3" fill="#edbd57" /><path d="M31 59v8m12-8v8" stroke="#645a3a" strokeWidth="3" strokeLinecap="round" /><path d="m31 16 5-8 4 9" fill="#da926b" /></svg><span>{tips[birdMessage]}</span><span className="ig-bird-next"><Sparkles size={15} aria-hidden="true" /></span></button>
        </section>

        <section className="ig-play-panel" aria-label="Odkrycia i ozdoby"><div className="ig-panel-tabs"><button type="button" aria-pressed={panel === 'missions'} onClick={() => { setPanel('missions'); setMissionId(null); setHint(''); }}><Search size={18} aria-hidden="true" />Odkrywaj</button><button type="button" aria-pressed={panel === 'garden'} onClick={() => { setPanel('garden'); setMissionId(null); setHint(''); }}><Flower2 size={18} aria-hidden="true" />Urządź ogród</button>{mode === 'city' && user && <button type="button" aria-pressed={panel === 'history'} onClick={() => { setPanel('history'); setMissionId(null); setHint(''); setReward(null); }}><History size={18} aria-hidden="true" />Moje odkrycia</button>}</div>
          {reward && <div className="ig-reward" role="status"><div className="ig-reward-spark"><Sparkles size={27} aria-hidden="true" /></div><div><strong>+{reward.points} {reward.training ? 'treningowych iskier' : 'iskier'}</strong><p>{reward.title}</p>{!!reward.bonus && <span>W tym +{reward.bonus} za trzy różne rodzaje obserwacji. Bez limitu czasu.</span>}</div><button type="button" onClick={() => setReward(null)} aria-label="Zamknij wiadomość o nagrodzie"><X size={17} aria-hidden="true" /></button></div>}
          {error && <div className="ig-message ig-error" role="alert">{error}{pendingRecord && <p>Obserwacja jest już zapisana. Ponowne odebranie iskier nie doda drugiego zgłoszenia.</p>}</div>}
          {hint && <div className="ig-message" role="status"><CircleHelp size={19} aria-hidden="true" /><span>{hint}</span></div>}
          {mode === 'city' && !user ? <div className="ig-gate"><span className="ig-gate-icon"><LockKeyhole size={32} aria-hidden="true" /></span><span className="ig-kicker">Jeden ogród, Twoje odkrycia</span><h2>{accountLoading ? 'Sprawdzamy konto…' : 'Zabierz Iskrę do miasta.'}</h2><p>Konto łączy prawdziwe obserwacje z Twoim ogrodem. Nie pytamy o stan zdrowia. Trening pozostaje dostępny bez logowania.</p><a className="ig-button ig-button-primary" href="/app?konto=1">Przejdź do konta <ArrowUpRight size={19} aria-hidden="true" /></a><button className="ig-button ig-button-quiet" type="button" onClick={() => setMode('training')}>Jeszcze chwilę poćwiczę</button></div>
            : panel === 'history' && mode === 'city' ? <div className="ig-history"><span className="ig-kicker">Twoja uważność ma znaczenie</span><h2>Moje dobre odkrycia</h2><p>Publiczne tylko do daty ważności. To obserwacje z konkretnego momentu, bez gwarancji dostępności i bez zmiany tras.</p>{historyLoading ? <p role="status">Wczytujemy historię…</p> : myObservations.length ? <div className="ig-history-list">{myObservations.map(item => <article key={item.id}><div><strong>{item.label}</strong><span className={item.status === 'withdrawn' || item.stale ? 'ig-history-muted' : 'ig-positive-tag'}>{item.status === 'withdrawn' ? 'Wycofane' : item.stale ? 'Wygasło' : 'Publiczna obserwacja'}</span></div><p>{item.description}</p><small>Zapis: {new Date(item.observedAt).toLocaleString('pl-PL')}<br />Ważne do: {new Date(item.validUntil).toLocaleString('pl-PL')}</small>{item.status !== 'withdrawn' && <button type="button" className="ig-button ig-button-outline" disabled={busy} onClick={() => withdrawObservation(item)}>Wycofaj odkrycie</button>}</article>)}</div> : <div className="ig-history-empty"><Sprout size={36} aria-hidden="true" /><p>Nie masz jeszcze zapisanych obserwacji.</p><button type="button" className="ig-button ig-button-primary" onClick={() => { setPanel('missions'); setMissionFilter('positive'); }}>Znajdź dobrą misję <ArrowRight size={18} aria-hidden="true" /></button></div>}</div>
            : panel === 'garden' ? <div className="ig-decorate-panel"><div className="ig-panel-heading"><span className="ig-kicker">Ozdoby ogrodu</span><h2 ref={decorateHeading} tabIndex={-1}>Co tu posadzimy?</h2><p>Wybierz grządkę pod ogrodem, potem ozdobę. Odblokowane ozdoby ustawiasz bez dodatkowych kosztów.</p><span className="ig-selected-bed"><Sprout size={16} aria-hidden="true" />Teraz urządzasz grządkę {selectedSlot + 1}</span></div><div className="ig-items">{ITEMS.map(item => { const owned = progress.unlocked.includes(item.id), affordable = owned || progress.balance >= item.cost; return <button type="button" key={item.id} className={`ig-item ${owned ? 'owned' : ''}`} onClick={() => decorate(item)} disabled={busy || !affordable} aria-label={`${item.name}, ${owned ? 'odblokowana, ustaw bez kosztu' : `${item.cost} iskier`}, grządka ${selectedSlot + 1}`}><span className={`ig-item-picture ${item.id}`}><svg viewBox="0 0 110 100" aria-hidden="true"><Ornament id={item.id} x={55} y={item.id === 'tree' ? 86 : 65} /></svg></span><strong>{item.name}</strong><span className="ig-item-description">{item.description}</span><span className="ig-item-cost">{owned ? <><Check size={15} aria-hidden="true" />Ustaw</> : <><Sparkles size={15} aria-hidden="true" />{item.cost} iskier{!affordable && <LockKeyhole size={13} aria-hidden="true" />}</>}</span></button>; })}</div><button className="ig-button ig-button-primary ig-wide" type="button" onClick={() => { setPanel('missions'); setReward(null); setHint(''); }}>Kolejne odkrycie <ArrowRight size={19} aria-hidden="true" /></button></div>
              : selectedTraining && mode === 'training' ? <div className="ig-puzzle"><button type="button" className="ig-back-small" onClick={() => { setMissionId(null); setHint(''); }}><ArrowLeft size={17} aria-hidden="true" />Wróć do odkryć</button><span className="ig-kicker">Zagadka treningowa · +{selectedTraining.points} iskier</span><h2 ref={focusRef} tabIndex={-1}>{selectedTraining.title}</h2><PuzzlePicture kind={selectedTraining.kind} /><h3>{selectedTraining.question}</h3><div className="ig-answers">{selectedTraining.choices.map((choice, index) => <button type="button" key={choice} onClick={() => answerTraining(index)}><span>{String.fromCharCode(65 + index)}</span>{choice}<ArrowRight size={17} aria-hidden="true" /></button>)}</div><p className="ig-small-print">Wymyślony przykład. Odpowiedzi pozostają w treningu i nie zmieniają mapy.</p></div>
                : selectedMission && mode === 'city' ? <form className="ig-observation" onSubmit={submitObservation}><button className="ig-back-small" type="button" onClick={() => setMissionId(null)}><ArrowLeft size={17} aria-hidden="true" />Wróć do misji</button><span className="ig-kicker">{positiveMission ? 'Dobre odkrycie' : 'Przeszkoda'} · +{selectedMission.points} iskier</span><h2 ref={focusRef} tabIndex={-1}>{selectedMission.title}</h2><p className="ig-mission-place"><MapPin size={17} aria-hidden="true" />{selectedMission.target.name}</p><p className="ig-instruction">{selectedMission.instruction}</p>{positiveMission && <div className="ig-positive-note"><Leaf size={18} aria-hidden="true" /><p><strong>Osobne dobre odkrycie.</strong> Nie powstanie raport przeszkody. Obserwacja będzie publiczna przez {selectedMission.kind === 'lift_working' ? '2 godziny' : selectedMission.kind === 'rest_place' ? '7 dni' : '24 godziny'}, z datą zapisu i możliwością wycofania. Nie potwierdza całej trasy.</p></div>}{pendingRecord ? <div className="ig-message"><ShieldCheck size={22} aria-hidden="true" /><span>Obserwacja jest już zapisana. Możesz ponowić odbiór iskier bez dodawania jej drugi raz.</span></div> : <><GameLocationPicker key={`${selectedMission.id}:${user?.id}`} initialCenter={selectedMission.target.coordinates} missionKey={selectedMission.id} accountKey={user?.id ?? null} value={selectedPoint} onChange={setSelectedPoint} disabled={busy} />{selectedMission.kind === 'width' && <label>Zmierzona wolna szerokość w cm<input required type="number" min="20" max="400" step="0.1" value={width} onChange={event => setWidth(event.target.value)} placeholder="Pomiar miarą, nie szacunek" /></label>}<label>Co dokładnie zauważono?<textarea required minLength={35} maxLength={800} rows={4} value={description} onChange={event => setDescription(event.target.value)} placeholder={positiveMission ? 'Co sprawdzono, gdzie dokładnie i jakie są ograniczenia? Minimum 35 znaków i 6 słów.' : 'Opisz przeszkodę, jej dokładne położenie i ewentualny pomiar. Minimum 35 znaków i 6 słów.'} /></label><label className="ig-check"><input type="checkbox" required checked={observed} onChange={event => setObserved(event.target.checked)} /><span>To moja rzeczywista obserwacja. Zatrzymałem się w miejscu, w którym mogę spokojnie ją opisać.</span></label></>}<button className="ig-button ig-button-primary ig-wide" type="submit" disabled={busy || (!selectedPoint && !pendingRecord)}>{busy ? 'Zapisujemy…' : pendingRecord ? 'Odbierz iskry za zapis' : 'Zapisz obserwację i odbierz iskry'}<ArrowRight size={19} aria-hidden="true" /></button><button type="button" className="ig-button ig-button-quiet ig-wide" onClick={() => { setMissionId(null); setHint('Dzięki za uważność. Gdy nie możesz potwierdzić obserwacji, pomiń ją bez zapisu i bez utraty iskier.'); }}>{positiveMission ? 'Nie mogę tego potwierdzić' : 'Nie widzę przeszkody / nie mam pewności'}</button><p className="ig-small-print">Punkty oznaczają poprawny zapis, nie weryfikację terenową. Dobre odkrycia są publiczne, mają datę ważności i nie zmieniają oceny tras. Obserwację zapisujemy w tej aplikacji, bez zmieniania mapy źródłowej.</p></form>
                  : <div className="ig-mission-list"><div className="ig-panel-heading"><span className="ig-kicker">{mode === 'training' ? 'Rozgrzej swoją uważność' : 'Odkrywaj po drodze'}</span><h2>{mode === 'training' ? 'Mała misja. Duża iskra.' : 'Gdzie dziś zajrzysz?'}</h2><p>{mode === 'training' ? 'Sześć zagadek: przeszkody, dobre miejsca i sztuka niezgadywania. Bez zegara i bez straty punktów.' : 'Odkrywaj dobre miejsca i zauważaj przeszkody. Wybierz misję pasującą do tego, co naprawdę możesz sprawdzić.'}</p></div>{mode === 'city' && <div className="ig-mission-filters" role="group" aria-label="Rodzaj misji">{([['all', 'Wszystkie'], ['positive', 'Dobre odkrycia'], ['barrier', 'Przeszkody']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={missionFilter === value} onClick={() => setMissionFilter(value)}>{label}</button>)}</div>}{mode === 'city' && <label className="ig-search-label"><Search size={18} aria-hidden="true" /><input type="search" value={query} onChange={event => { setQuery(event.target.value); setArea(null); }} placeholder="Szukaj miejsca lub ulicy" aria-label="Szukaj miejsca misji" /></label>}{mode === 'city' && locationHints.length > 0 && <div className="ig-location-hints" role="group" aria-label="Okolice z wyszukiwarki"><p>Odkrywaj miejsca w pobliżu adresu:</p>{locationHints.map(location => <button type="button" key={location.id} onClick={() => { setArea(location); setQuery(''); setLocationHints([]); }}><MapPin size={16} aria-hidden="true" /><span>{location.label}<small>{location.precision === 'approximate' ? 'Położenie przybliżone' : 'Punkt adresowy'}</small></span><ArrowRight size={16} aria-hidden="true" /></button>)}</div>}{mode === 'city' && area && <div className="ig-area"><span>Okolica: {area.label}</span><button type="button" aria-label="Wyczyść wybraną okolicę" onClick={() => setArea(null)}><X size={16} aria-hidden="true" /></button></div>}
                    {mode === 'training' && trainingComplete && <div className="ig-training-complete"><Flower2 size={29} aria-hidden="true" /><h3>Masz oko do miasta!</h3><p>Sześć odkryć jest już w Twoim ogrodzie. Teraz ułóż ozdoby po swojemu i zachowaj pierwszą pocztówkę. Możesz wracać do komponowania bez nowych obserwacji i bez wydawania iskier na zapis.</p><button className="ig-button ig-button-primary" type="button" onClick={() => { setPanel('garden'); setReward(null); setHint(''); }}>Urządź i zachowaj ogród <ArrowRight size={18} aria-hidden="true" /></button><a className="ig-button ig-button-quiet" href="#ig-album">Otwórz album ogrodu <BookOpen size={17} aria-hidden="true" /></a><p>Moje miasto to osobny ogród prawdziwych obserwacji. Twój trening i pocztówki tutaj pozostają.</p><button className="ig-button ig-button-quiet" type="button" onClick={() => { setMode('city'); setHint(''); }}>Zajrzyj do miasta <ArrowRight size={18} aria-hidden="true" /></button></div>}
                    {mode === 'training' ? <div className="ig-mission-cards">{TRAINING.map((item, index) => { const done = training.completed.includes(item.id); return <button className={`ig-mission-card ${done ? 'done' : ''}`} type="button" key={item.id} disabled={done} onClick={() => openMission(item.id)}><span className={`ig-mission-badge badge-${index}`}>{done ? <Check size={22} aria-hidden="true" /> : <span>0{index + 1}</span>}</span><span><strong>{item.title}</strong><small>{done ? 'Odkrycie jest już w Twoim ogrodzie' : item.subtitle}</small></span><span className="ig-mission-points">{done ? 'Gotowe' : <><Sparkles size={13} aria-hidden="true" />{item.points}</>}</span></button>; })}</div>
                      : <div className="ig-mission-cards" aria-busy={searching}>{searching ? <p className="ig-search-status" role="status">Szukamy miejsc do odkrycia…</p> : visibleMissions.length ? visibleMissions.slice(0, 12).map(item => <button className="ig-mission-card" type="button" key={item.id} onClick={() => openMission(item.id)}><span className={item.source === 'observation' ? 'ig-mission-badge ig-positive-badge' : 'ig-mission-badge'}>{item.kind === 'rest_place' ? <Armchair size={21} aria-hidden="true" /> : item.kind === 'step_free_entrance' ? <DoorOpen size={21} aria-hidden="true" /> : <MapPin size={21} aria-hidden="true" />}</span><span><strong>{item.title}</strong><small>{item.target.name}</small><em className={item.source === 'observation' ? 'ig-positive-tag' : 'ig-barrier-tag'}>{item.source === 'observation' ? 'Dobre odkrycie' : 'Przeszkoda'}</em></span><span className="ig-mission-points"><Sparkles size={13} aria-hidden="true" />{item.points}</span></button>) : <p className="ig-search-status">Brak misji dla tego wyszukiwania. Spróbuj innej nazwy miejsca.</p>}</div>}
                    
                    <div className="ig-collection"><span><Leaf size={18} aria-hidden="true" /><strong>{mode === 'training' ? 'Kolekcja uważności' : 'Trzy perspektywy'}</strong></span><div>{(mode === 'training' ? ['kerb', 'width', 'surface', 'source', 'rest_place', 'step_free_entrance'] : ['rest_place', 'step_free_entrance', 'lift_working', 'width', 'surface', 'kerb']).map((kind, index) => <span key={kind} role="img" className={progress.kinds.includes(kind) ? 'collected' : ''} aria-label={`Perspektywa ${index + 1}: ${progress.kinds.includes(kind) ? 'odkryta' : 'do odkrycia'}`}>{progress.kinds.includes(kind) ? <Check size={15} aria-hidden="true" /> : index + 1}</span>)}</div><p>{mode === 'training' ? 'Odkrywaj w dowolnej kolejności. Każda zagadka liczy się raz.' : 'Pierwsze trzy różne rodzaje obserwacji dają dodatkowe 10 iskier. Żadnej serii dni, żadnego pośpiechu.'}</p></div></div>}
        </section>
      </div>
      {(mode === 'training' || (user && !accountLoading && albumAccount === user.id)) && <GameAlbum context={mode === 'training' ? 'training' : `account:${user!.id}`} training={mode === 'training'} progress={progress} />}
      <section className="ig-rules" aria-labelledby="ig-rules-title"><div><span className="ig-kicker">Nasza umowa</span><h2 id="ig-rules-title">Uważność wygrywa.</h2></div><p><Check size={18} aria-hidden="true" />Nie musisz być w każdym miejscu.</p><p><Check size={18} aria-hidden="true" />Nie musisz grać codziennie.</p><p><Check size={18} aria-hidden="true" />Nie zgaduj i nie graj podczas jazdy.</p></section>
    </main>
    <footer className="ig-footer"><a href="/app">Otwórz Miasto w zasięgu <ArrowUpRight size={17} aria-hidden="true" /></a><p>Prototyp. Miejsca z OpenStreetMap; ogród i przykłady treningowe są fikcyjne.</p><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors<span className="ig-sr-only">, nowa karta</span></a></footer>
  </div>;
}
