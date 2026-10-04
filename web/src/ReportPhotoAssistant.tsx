import { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, MapPin } from 'lucide-react';
import { api } from './api';
import { inReportArea, prepareReportPhoto, type PhotoJob, type PhotoSuggestion } from './report-photo';
import type { Coordinates } from './types';

export default function ReportPhotoAssistant({ userId, onApply, onLocation, disabled }: {
  userId: string | null; onApply: (suggestion: PhotoSuggestion) => void;
  onLocation: (point: Coordinates) => void; disabled: boolean;
}) {
  const gallery = useRef<HTMLInputElement>(null), camera = useRef<HTMLInputElement>(null);
  const generation = useRef(0), clientId = useRef(crypto.randomUUID());
  const [prepared, setPrepared] = useState<{ image: string; gps: Coordinates | null } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [job, setJob] = useState<PhotoJob | null>(null), [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    void api<{ enabled: boolean }>('/report-photos/config').then(data => { if (active) setEnabled(data.enabled); }).catch(() => { if (active) setEnabled(false); });
    return () => { active = false; generation.current++; };
  }, []);
  useEffect(() => {
    if (job?.status !== 'analyzing') return;
    const token = generation.current;
    let active = true, timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await api<PhotoJob>(`/report-photos/${job.id}?clientId=${encodeURIComponent(clientId.current)}`);
        if (!active || token !== generation.current) return;
        setJob(next);
        if (next.status === 'analyzing') timer = setTimeout(poll, 1800);
        else setBusy(false);
      } catch (e) { if (active && token === generation.current) { setError((e as Error).message); setBusy(false); } }
    };
    timer = setTimeout(poll, 1000);
    return () => { active = false; clearTimeout(timer); };
  }, [job?.id, job?.status]);
  async function choose(file?: File) {
    if (!file) return;
    const token = ++generation.current;
    setBusy(true); setError(''); setJob(null); setPrepared(null);
    try {
      const next = await prepareReportPhoto(file);
      if (token === generation.current) setPrepared(next);
    } catch (e) { if (token === generation.current) setError((e as Error).message); }
    finally { if (token === generation.current) setBusy(false); }
  }
  async function analyze() {
    if (!prepared || busy) return;
    const token = ++generation.current;
    setBusy(true); setError(''); setJob(null);
    try {
      const next = await api<PhotoJob>('/report-photos', { image: prepared.image, clientId: clientId.current, expectedUserId: userId });
      if (token === generation.current) setJob(next);
    } catch (e) { if (token === generation.current) { setError((e as Error).message); setBusy(false); } }
  }
  function clear() { generation.current++; setPrepared(null); setJob(null); setError(''); setBusy(false); }
  return <section className="report-photo" aria-label="Zgłoszenie ze zdjęcia">
    <h3>Zacznij od zdjęcia</h3>
    <p>Dodaj zdjęcie, a AI zaproponuje rodzaj obserwacji i opis. Możesz też wypełnić formularz samodzielnie.</p>
    <input ref={gallery} type="file" accept="image/jpeg,image/png,image/webp" className="visually-hidden" tabIndex={-1} aria-label="Plik zdjęcia bariery" onChange={e => { void choose(e.target.files?.[0]); e.target.value = ''; }} />
    <input ref={camera} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="visually-hidden" tabIndex={-1} aria-label="Zdjęcie bariery z aparatu" onChange={e => { void choose(e.target.files?.[0]); e.target.value = ''; }} />
    <div className="evidence-actions">
      <button type="button" className="button secondary" disabled={disabled || busy} onClick={() => camera.current?.click()}><Camera size={18} />Zrób zdjęcie</button>
      <button type="button" className="text-button" disabled={disabled || busy} onClick={() => gallery.current?.click()}><ImagePlus size={18} />Wybierz zdjęcie</button>
    </div>
    {prepared && <>
      <img className="report-photo-preview" src={prepared.image} alt="Wybrane zdjęcie do przygotowania obserwacji" />
      {prepared.gps ? inReportArea(prepared.gps) ? <div className="photo-gps"><p>Zdjęcie zawiera GPS: {prepared.gps[1].toFixed(6)}, {prepared.gps[0].toFixed(6)}. To pozycja aparatu, która może różnić się od miejsca bariery.</p><button type="button" className="text-button" disabled={disabled} onClick={() => onLocation(prepared.gps!)}><MapPin size={16} />Użyj lokalizacji zdjęcia</button></div> : <p className="evidence-unknown">GPS zdjęcia jest poza obsługiwanym obszarem Krakowa. Wskaż miejsce ręcznie, jeśli zdjęcie dotyczy tego obszaru.</p> : <p className="muted">Zdjęcie nie zawiera lokalizacji GPS. Użyj swojego położenia poniżej albo wskaż miejsce na mapie.</p>}
      <p className="photo-privacy">Przycisk analizy wyśle pomniejszone zdjęcie do OpenAI, bez metadanych GPS. Nie dodawaj zdjęć z danymi osobowymi. Zdjęcie nie będzie zapisane ani opublikowane w aplikacji.</p>
      <div className="evidence-actions"><button type="button" className="button secondary" disabled={disabled || busy || enabled !== true} onClick={() => void analyze()}>{busy ? 'Analizujemy…' : job ? 'Przeanalizuj ponownie' : 'Przeanalizuj zdjęcie'}</button><button type="button" className="text-button" disabled={disabled} onClick={clear}>Usuń zdjęcie</button></div>
    </>}
    {busy && <p role="status">{job ? 'Analizujemy zdjęcie. Nic nie zostało opublikowane.' : 'Przygotowujemy zdjęcie…'}</p>}
    {enabled === false && <p className="evidence-unknown">Analiza zdjęć jest chwilowo niedostępna. Lokalizację GPS możesz odczytać ze zdjęcia, a opis wpisać samodzielnie.</p>}
    {job && job.status !== 'analyzing' && <div className="photo-result" aria-live="polite"><p>{job.message}</p>
      {job.result?.observations.map((suggestion, index) => <article key={index} className="photo-suggestion">
        <p><strong>{suggestion.description}</strong></p><p>{suggestion.evidence}</p>
        <p className="muted">Do sprawdzenia: {suggestion.uncertainty || 'Dokładne położenie, wymiary i aktualność.'}</p>
        {suggestion.suggestedGeometry !== 'Point' && <p className="muted">Ta obserwacja może dotyczyć {suggestion.suggestedGeometry === 'LineString' ? 'odcinka' : 'obszaru'}. Pełny zasięg możesz zaznaczyć w szczegółach formularza.</p>}
        <button type="button" className="button secondary" disabled={disabled} onClick={() => onApply(suggestion)}>Użyj tej propozycji</button>
      </article>)}
    </div>}
    {error && <p role="alert" className="error-box">{error}</p>}
  </section>;
}
