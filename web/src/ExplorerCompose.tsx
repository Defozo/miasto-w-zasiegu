import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, MapPin, X } from 'lucide-react';
import { api } from './api';
import ReportPhotoAssistant from './ReportPhotoAssistant';
import GameLocationPicker from './GameLocationPicker';
import type { Coordinates } from './types';
import type { PhotoSuggestion } from './report-photo';
import type { ExplorerMission, ExplorerReward } from './explorer-types';

const kinds: [string, string][] = [['obstacle', 'Zablokowane przejście'], ['kerb', 'Krawężnik lub próg'], ['surface', 'Nawierzchnia'], ['width', 'Szerokość przejścia'], ['steps', 'Schody'], ['entrance', 'Wejście'], ['ramp', 'Podjazd'], ['lift', 'Winda: opis warunków'], ['toilet', 'Toaleta'], ['rest_place', 'Miejsce odpoczynku: dobre odkrycie'], ['rest_issue', 'Miejsce odpoczynku: opis warunków lub problemu'], ['step_free_entrance', 'Wejście bez schodów'], ['lift_working', 'Winda sprawdzona w działaniu']];
const positiveKind = (kind: string) => ['rest_place', 'step_free_entrance', 'lift_working'].includes(kind);
const defaultEffect = (kind: string) => ['ramp', 'entrance', 'toilet'].includes(kind) ? 'information' : 'barrier';
const defaultDuration = (kind: string) => ['obstacle', 'lift'].includes(kind) ? 'temporary' : 'permanent';
const localNow = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
export default function ExplorerCompose({ mission, userId, onClose, onSaved }: {
  mission: ExplorerMission; userId: string; onClose: () => void; onSaved: (reward: ExplorerReward, owner: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null), alive = useRef(true), photoPoint = useRef<Coordinates | null>(null);
  const [kind, setKind] = useState(mission.kind), [description, setDescription] = useState(''), [answer, setAnswer] = useState('');
  const [point, setPoint] = useState<Coordinates | null>(null), [center, setCenter] = useState(mission.coordinates);
  const [width, setWidth] = useState(''), [height, setHeight] = useState(''), [observedAt, setObservedAt] = useState(localNow);
  const [observed, setObserved] = useState(false), [photoUsed, setPhotoUsed] = useState(false);
  const [locationSource, setLocationSource] = useState('manual'), [effect, setEffect] = useState(() => defaultEffect(mission.kind));
  const [duration, setDuration] = useState(() => defaultDuration(mission.kind)), [surface, setSurface] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { alive.current = true; const previous = document.activeElement as HTMLElement | null; dialog.current?.showModal();
    return () => { alive.current = false; dialog.current?.close(); previous?.focus(); }; }, []);
  const refresh = mission.type === 'refresh';
  function apply(suggestion: PhotoSuggestion) {
    setPhotoUsed(true); setObserved(false); setDescription(suggestion.description);
    if (!refresh) { setKind(suggestion.kind === 'rest_place' && suggestion.effect !== 'facility' ? 'rest_issue' : suggestion.kind); setEffect(suggestion.effect); setDuration(suggestion.duration); setWidth(''); setHeight(''); setSurface(''); }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy || !point || !observed) return;
    const words = description.toLocaleLowerCase('pl').normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ');
    if (description.trim().length < 35 || words.length < 6 || new Set(words).size < 5) { setError('Dodaj konkretny opis: minimum 35 znaków, 6 słów i 5 różnych słów.'); return; }
    if (refresh && !answer) { setError('Wybierz, czy poprzednia obserwacja pozostaje aktualna.'); return; }
    setBusy(true); setError('');
    try {
      let reward: ExplorerReward;
      if (refresh) {
        const result = await api<{ reward: ExplorerReward }>('/game/recheck', { expectedUserId: userId, reportId: mission.reportId,
          revision: mission.revision, answer, description, coordinates: point, observedNow: observed }); reward = result.reward;
      } else {
        const positive = positiveKind(kind);
        const date = new Date(observedAt);
        if (positive && Math.abs(Date.now() - date.getTime()) > 10 * 60000) throw new Error('Dobre odkrycie musi opisywać to, co sprawdzono teraz. Dla starego zdjęcia wróć do sprawdzenia miejsca.');
        const result = await api<{ explorerReward: ExplorerReward }>(positive ? '/observations' : '/reports', {
          expectedUserId: userId, coordinates: point, description: description.trim(),
          ...(positive ? { type: kind, observedNow: true } : { kind: kind === 'rest_issue' ? 'rest_place' : kind, effect, duration, observedAt: date.toISOString(),
            inputMethod: photoUsed ? 'photo-ai' : 'manual', photoReviewed: observed, locationSource,
            widthCm: width ? Number(width) : null, heightCm: height ? Number(height) : null,
            measurement: width || height ? 'measured' : 'unknown', surface: kind === 'surface' ? surface : null }),
        }); reward = result.explorerReward || { awarded: 0, reason: 'Obserwacja została zapisana.' };
      }
      if (alive.current) onSaved(reward, userId);
    } catch (cause) { if (alive.current) { setError(cause instanceof Error ? cause.message : 'Nie udało się zapisać. Zachowaliśmy opis.'); setBusy(false); } }
  }
  return <dialog className="ex-dialog" ref={dialog} aria-labelledby="ex-compose-title" onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}>
    <div className="ex-dialog-top"><span className="ex-eyebrow">{refresh ? 'Ponowne sprawdzenie' : 'Twoja obserwacja'} · do {refresh ? 25 : 20} XP</span><button className="ex-icon-button" type="button" onClick={onClose} disabled={busy} aria-label="Zamknij misję"><X /></button></div>
    <h2 id="ex-compose-title">{mission.title}</h2><p className="ex-place"><MapPin size={16} />{mission.place}</p>
    <p>{mission.reason}</p>
    {refresh && <blockquote><span>Poprzednia obserwacja</span><p>{mission.description}</p><small>{mission.lastObservedAt ? new Date(mission.lastObservedAt).toLocaleString('pl-PL') : 'Data obserwacji nieznana'}</small></blockquote>}
    <ReportPhotoAssistant userId={userId} disabled={busy} onApply={apply} onLocation={p => { photoPoint.current = p; setCenter(p); setPoint(null); setLocationSource('photo-gps'); setObserved(false); }} />
    <form onSubmit={submit}>
      <fieldset disabled={busy} className="ex-form-fields">
        {refresh ? <fieldset className="ex-answer"><legend>Jak jest teraz?</legend><label><input type="radio" name="answer" value="same" checked={answer === 'same'} onChange={() => { setAnswer('same'); setObserved(false); }} required />Opis nadal pasuje</label><label><input type="radio" name="answer" value="changed" checked={answer === 'changed'} onChange={() => { setAnswer('changed'); setObserved(false); }} />Widzę zmianę</label><p>Obie odpowiedzi dają taki sam postęp. Opisz to, co rzeczywiście sprawdzono.</p></fieldset>
          : <><label>Co opisujesz?<select value={kind} onChange={e => { const next = e.target.value; setKind(next); setObserved(false); setWidth(''); setHeight(''); setSurface(''); setEffect(defaultEffect(next)); setDuration(defaultDuration(next)); }}>{kinds.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            {!positiveKind(kind) && <><label>Znaczenie obserwacji<select value={effect} onChange={e => { setEffect(e.target.value); setObserved(false); }}><option value="information">Opis warunków</option><option value="barrier">Przeszkoda</option><option value="facility">Udogodnienie</option></select></label><label>Jak długo może być aktualna?<select value={duration} onChange={e => { setDuration(e.target.value); setObserved(false); }}><option value="temporary">Sytuacja tymczasowa</option><option value="permanent">Stała cecha miejsca</option><option value="unknown">Nie wiem</option></select><small>{duration === 'temporary' ? `Poprosimy o ponowne sprawdzenie po ${kind === 'lift' ? '4 godzinach' : '24 godzinach'}.` : 'Stała cecha też może się zmienić. Zachowamy datę Twojej obserwacji.'}</small></label></>}
            {kind === 'surface' && <label>Rodzaj nawierzchni<select value={surface} onChange={e => { setSurface(e.target.value); setObserved(false); }}><option value="">Nie określam</option><option value="asphalt">Asfalt</option><option value="paving_stones">Kostka</option><option value="cobblestone">Bruk</option><option value="concrete">Beton</option><option value="gravel">Żwir</option><option value="ground">Ziemia</option><option value="sand">Piasek</option><option value="grass">Trawa</option></select></label>}
            {kind === 'width' && <label>Zmierzona wolna szerokość (cm)<input required min="20" max="400" step="0.1" type="number" value={width} onChange={e => { setWidth(e.target.value); setObserved(false); }} /><small>Pomiar miarą na miejscu. Zdjęcie nie ustala wymiarów.</small></label>}
            {kind === 'kerb' && <label>Zmierzona wysokość progu (cm), opcjonalnie<input min="0" max="100" step="0.1" type="number" value={height} onChange={e => { setHeight(e.target.value); setObserved(false); }} /><small>Wypełnij tylko po pomiarze na miejscu.</small></label>}</>}
        <label>{refresh ? 'Co sprawdzono na miejscu?' : 'Krótki, konkretny opis'}<textarea rows={4} minLength={35} maxLength={800} required value={description} onChange={e => { setDescription(e.target.value); setObserved(false); }} placeholder="Co widzisz, gdzie dokładnie i jakie są ograniczenia?" /><small>Minimum 35 znaków i 6 słów. Obserwacja będzie publiczna.</small></label>
        {photoUsed && <p className="ex-notice">Opis pochodzi z propozycji AI. Sprawdź go i popraw. Zdjęcie nie ustala wymiarów ani działania windy.</p>}
        <GameLocationPicker key={`${mission.id}:${center.join(',')}`} initialCenter={center} missionKey={mission.id} accountKey={userId} value={point} disabled={busy} onChange={p => { setPoint(p); if (p) setLocationSource(photoPoint.current && p.every((v, i) => Math.abs(v - photoPoint.current![i]) < 0.0000001) ? 'photo-gps' : 'manual'); setObserved(false); }} />
        {!refresh && <label>Data obserwacji<input required type="datetime-local" value={observedAt} onChange={e => { setObservedAt(e.target.value); setObserved(false); }} /><small>Przy starszym zdjęciu podaj rzeczywistą datę. XP dotyczy obserwacji z ostatnich 24 godzin.</small></label>}
        {kind === 'lift_working' && <p className="ex-notice">Tę obserwację dodaj po rzeczywistym sprawdzeniu działania windy teraz.</p>}
        <label className="ex-confirm"><input type="checkbox" required checked={observed} onChange={e => setObserved(e.target.checked)} /><span>To moja obserwacja. Po zatrzymaniu się sprawdziłem opis, miejsce i datę.</span></label>
      </fieldset>
      {error && <p className="ex-error" role="alert">{error}</p>}
      <button className="ex-button primary full" disabled={busy || !point || !observed} type="submit">{busy ? 'Zapisujemy obserwację…' : 'Zapisz odkrycie'}{busy ? <Check size={18} /> : <ArrowRight size={18} />}</button>
      <button className="ex-button quiet full" disabled={busy} type="button" onClick={onClose}>Nie mogę tego sprawdzić. Pomiń misję</button>
      <p className="ex-fine">XP nagradza wkład, nie potwierdza dostępności miejsca. Brak pewności jest powodem, żeby pominąć misję.</p>
    </form>
  </dialog>;
}
