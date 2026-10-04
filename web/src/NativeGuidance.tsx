import { useState } from 'react';
import { Navigation, Watch } from 'lucide-react';
import type { Profile, Route } from './types';
import { nativeRequest } from './native';

export default function NativeGuidance({ route, profile, saved }: { route: Route; profile: Profile; saved: boolean }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function open() {
    setBusy(true); setError('');
    try { await nativeRequest('guidance.prepare', { route, profile }); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="foreground-guidance" aria-label="Prowadzenie na telefonie">
    <button className="button primary full" disabled={busy || saved} onClick={open}>
      <Navigation size={20} /> {busy ? 'Otwieramy prowadzenie…' : 'Rozpocznij prowadzenie'}
    </button>
    {saved && <p className="field-help">Oblicz trasę ponownie, zanim rozpoczniesz prowadzenie według zapisanego planu.</p>}
    <details className="guidance-help">
      <summary>Głos i zegarek</summary>
      <p className="field-help">GPS i polskie instrukcje głosowe mogą działać również przy zablokowanym ekranie.</p>
      <p className="field-help"><Watch size={16} aria-hidden="true" /> Sparowany zegarek Wear OS może pokazywać bieżący manewr. Telefon działa także bez zegarka.</p>
    </details>
    {error && <p className="error-box" role="alert">{error}</p>}
  </section>;
}
