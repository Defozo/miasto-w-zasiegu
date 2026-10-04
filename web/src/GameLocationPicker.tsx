import { useEffect, useId, useRef, useState } from 'react';
import { Check, Crosshair, LocateFixed, MapPin, Minus, Plus } from 'lucide-react';
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import AddressInput from './AddressInput';
import { api } from './api';
import { motionReduced } from './display-preferences';
import type { LocationPoint } from './types';
import './game-location.css';

type Point = [number, number];
type Props = {
  initialCenter: Point;
  missionKey: string;
  accountKey: string | null;
  value: Point | null;
  onChange: (point: Point | null) => void;
  disabled?: boolean;
};
const insideArea = (point: Point) => point.every(Number.isFinite) && point[0] >= 19.75 && point[0] <= 20.25 && point[1] >= 49.9 && point[1] <= 50.2;

export default function GameLocationPicker(props: Props) {
  const { initialCenter, missionKey, accountKey, value, onChange, disabled = false } = props;
  const id = useId();
  const container = useRef<HTMLDivElement>(null), map = useRef<MapLibreMap | null>(null), marker = useRef<Marker | null>(null);
  const mounted = useRef(false), gpsGeneration = useRef(0);
  const current = useRef({ onChange, disabled, missionKey, accountKey });
  current.current = { onChange, disabled, missionKey, accountKey };
  const candidateRef = useRef<Point | null>(value);
  const [candidate, setCandidate] = useState<Point | null>(value);
  const [address, setAddress] = useState<LocationPoint | null>(null);
  const [ready, setReady] = useState(false), [mapError, setMapError] = useState('');
  const [message, setMessage] = useState('Wybierz adres, kliknij mapę lub ustaw pinezkę w jej środku.');
  const [gpsBusy, setGpsBusy] = useState(false);
  const [latitude, setLatitude] = useState(value ? String(value[1]) : ''), [longitude, setLongitude] = useState(value ? String(value[0]) : '');

  function propose(point: Point | null, detail: string, moveMap = false) {
    if (!mounted.current || current.current.disabled) return;
    gpsGeneration.current++; setGpsBusy(false);
    current.current.onChange(null);
    if (point && !insideArea(point)) {
      setMessage('Ten punkt leży poza obszarem Krakowa obsługiwanym w prototypie. Wybierz miejsce na mapie.');
      candidateRef.current = null; setCandidate(null); marker.current?.remove(); return;
    }
    const next: Point | null = point ? [Number(point[0].toFixed(6)), Number(point[1].toFixed(6))] : null;
    candidateRef.current = next; setCandidate(next); setMessage(detail);
    setLatitude(next ? String(next[1]) : ''); setLongitude(next ? String(next[0]) : '');
    if (next && map.current) {
      marker.current?.setLngLat(next).addTo(map.current);
      if (moveMap) map.current.jumpTo({ center: next, zoom: Math.max(map.current.getZoom(), 17) });
    } else marker.current?.remove();
  }
  const proposeRef = useRef(propose); proposeRef.current = propose;

  useEffect(() => {
    let cancelled = false;
    let observer: ResizeObserver | undefined;
    mounted.current = true; gpsGeneration.current++;
    candidateRef.current = null; setCandidate(null); setAddress(null); setLatitude(''); setLongitude(''); setReady(false); setMapError(''); setGpsBusy(false);
    setMessage('Mapa pokazuje okolicę misji. Wybierz dokładne miejsce obserwacji.');
    current.current.onChange(null);
    Promise.all([import('maplibre-gl'), import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'), import('maplibre-gl/dist/maplibre-gl.css')]).then(([lib, worker]) => {
      if (cancelled || !container.current) return;
      lib.setWorkerUrl(worker.default);
      const instance = new lib.Map({
        container: container.current, style: 'https://tiles.openfreemap.org/styles/positron',
        center: initialCenter, zoom: 17, minZoom: 12, maxZoom: 20, fadeDuration: motionReduced() ? 0 : 200,
        maxBounds: [[19.75, 49.9], [20.25, 50.2]], attributionControl: { compact: false },
        cooperativeGestures: true,
        locale: { 'CooperativeGesturesHandler.WindowsHelpText': 'Przytrzymaj Ctrl, aby przybliżyć mapę', 'CooperativeGesturesHandler.MobileHelpText': 'Przesuń mapę dwoma palcami', 'AttributionControl.ToggleAttribution': 'Informacje o mapie' },
      });
      map.current = instance;
      instance.getCanvas().setAttribute('aria-label', 'Mapa miejsca obserwacji. Strzałki przesuwają mapę. Następnie użyj przycisku ustawienia pinezki w środku.');
      const pin = document.createElement('button'); pin.type = 'button'; pin.className = 'game-location-pin';
      pin.setAttribute('aria-label', 'Pinezka obserwacji. Przeciągnij lub przesuń strzałkami.');
      pin.innerHTML = '<svg width="27" height="32" viewBox="0 0 24 30" aria-hidden="true"><path d="M12 29C9 23 2 18 2 11a10 10 0 1 1 20 0c0 7-7 12-10 18Z" fill="#315e45" stroke="#fff9ed" stroke-width="2"/><circle cx="12" cy="11" r="3" fill="#f7d377"/></svg>';
      const selectedMarker = new lib.Marker({ element: pin, draggable: !current.current.disabled, anchor: 'bottom' });
      marker.current = selectedMarker;
      selectedMarker.on('dragend', () => { const point = selectedMarker.getLngLat(); proposeRef.current([point.lng, point.lat], 'Pinezka przesunięta. Sprawdź miejsce i potwierdź wybór.'); });
      pin.addEventListener('keydown', event => {
        if (!candidateRef.current || current.current.disabled || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        const [lon, lat] = candidateRef.current, step = event.shiftKey ? .0001 : .00002;
        proposeRef.current([lon + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0), lat + (event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0)], 'Pinezka przesunięta klawiaturą. Potwierdź nowe miejsce.');
      });
      instance.on('click', event => proposeRef.current([event.lngLat.lng, event.lngLat.lat], 'Pinezka ustawiona. To propozycja miejsca, która wymaga potwierdzenia.'));
      instance.on('load', () => { if (!cancelled) { setReady(true); setMapError(''); } });
      instance.on('error', () => { if (!cancelled && !instance.isStyleLoaded()) setMapError('Nie udało się wczytać podkładu mapy. Nadal możesz wybrać adres lub użyć GPS i potwierdzić punkt.'); });
      if (candidateRef.current) selectedMarker.setLngLat(candidateRef.current).addTo(instance);
      observer = new ResizeObserver(() => instance.resize()); observer.observe(container.current);
    }).catch(() => { if (!cancelled) setMapError('Podgląd mapy jest niedostępny. Wybierz adres lub użyj GPS.'); });
    return () => { cancelled = true; mounted.current = false; gpsGeneration.current++; observer?.disconnect(); marker.current?.remove(); marker.current = null; map.current?.remove(); map.current = null; };
  }, [missionKey, accountKey]);
  useEffect(() => { marker.current?.setDraggable(!disabled); }, [disabled]);

  function chooseAddress(point: LocationPoint | null) {
    setAddress(point);
    propose(point?.coordinates ?? null, point ? 'Adres ustawił propozycję pinezki. Punkt adresowy nie potwierdza wejścia. Przesuń pinezkę, jeśli trzeba, i potwierdź miejsce.' : 'Wybierz nowy adres z podpowiedzi lub wskaż punkt na mapie.', true);
  }
  function editCoordinate(axis: 'latitude' | 'longitude', text: string) {
    gpsGeneration.current++; setGpsBusy(false);
    candidateRef.current = null; setCandidate(null); marker.current?.remove(); onChange(null);
    if (axis === 'latitude') setLatitude(text); else setLongitude(text);
    setMessage('Ustaw punkt z obu współrzędnych, a potem potwierdź miejsce.');
  }
  function locate() {
    if (!navigator.geolocation) { setMessage('GPS jest niedostępny. Wyszukaj adres lub ustaw pinezkę na mapie.'); return; }
    const generation = ++gpsGeneration.current, key = { missionKey, accountKey };
    const active = () => mounted.current && gpsGeneration.current === generation && current.current.missionKey === key.missionKey && current.current.accountKey === key.accountKey && !current.current.disabled;
    onChange(null); setGpsBusy(true); setMessage('Sprawdzamy pozycję po Twoim kliknięciu…');
    navigator.geolocation.getCurrentPosition(async position => {
      if (!active()) return;
      try {
        const session = await api<{ user: { id: string } | null }>('/auth/me');
        if (!active()) return;
        if ((session.user?.id ?? null) !== key.accountKey) {
          gpsGeneration.current++; setGpsBusy(false); candidateRef.current = null; setCandidate(null);
          setAddress(null); setLatitude(''); setLongitude(''); marker.current?.remove();
          map.current?.jumpTo({ center: initialCenter }); current.current.onChange(null);
          setMessage('Konto zmieniło się w innej karcie. Wybór miejsca został wyczyszczony. Odśwież widok przed dalszą pracą.'); return;
        }
        propose([position.coords.longitude, position.coords.latitude], `Dokładność GPS: około ${Math.round(position.coords.accuracy)} m. Sprawdź pinezkę, popraw ją w razie potrzeby i potwierdź miejsce.`, true);
      } catch { if (active()) { setGpsBusy(false); setMessage('Nie udało się sprawdzić sesji. Wyszukaj adres lub spróbuj GPS ponownie.'); } }
    }, () => { if (active()) { setGpsBusy(false); setMessage('GPS nie zadziałał. Wyszukaj adres lub kliknij miejsce na mapie, bez podawania współrzędnych.'); } }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }

  return <fieldset className="game-location-picker" disabled={disabled}>
    <legend><MapPin size={18} aria-hidden="true" />Gdzie jest Twoje odkrycie?</legend>
    <p id={`${id}-help`} className="game-location-help">Wybierz adres albo zaznacz miejsce na mapie. Adres jest wskazówką, nie potwierdzonym wejściem.</p>
    <AddressInput key={`${missionKey}:${accountKey}`} label="Adres w okolicy obserwacji" value={address} onChange={chooseAddress} placeholder="Ulica i numer lub pobliskie miejsce" />
    <div className="game-location-actions"><button type="button" onClick={locate} disabled={gpsBusy || disabled}><LocateFixed size={17} aria-hidden="true" />{gpsBusy ? 'Ustalam pozycję…' : 'Użyj mojego GPS'}</button><span>GPS jest opcjonalny.</span></div>
    <div className="game-location-map-wrap"><div ref={container} className="game-location-map" role="region" aria-label="Mapa punktu obserwacji" aria-describedby={`${id}-help`} />
      <div className="game-location-zoom"><button type="button" aria-label="Przybliż mapę obserwacji" disabled={!ready} onClick={() => map.current?.zoomIn({ duration: 0 })}><Plus size={19} aria-hidden="true" /></button><button type="button" aria-label="Oddal mapę obserwacji" disabled={!ready} onClick={() => map.current?.zoomOut({ duration: 0 })}><Minus size={19} aria-hidden="true" /></button></div>
      {!ready && !mapError && <span className="game-location-loading" role="status">Wczytujemy mapę…</span>}
    </div>
    {mapError && <p className="game-location-help" role="status">{mapError}</p>}
    <button type="button" className="game-location-center" disabled={!ready} onClick={() => { const center = map.current?.getCenter(); if (center) propose([center.lng, center.lat], 'Pinezka jest w środku mapy. Potwierdź, jeśli to rzeczywiste miejsce obserwacji.'); }}><Crosshair size={17} aria-hidden="true" />Ustaw pinezkę w środku mapy</button>
    <p className="game-location-status" role="status">{value ? 'Miejsce potwierdzone. Każde przesunięcie pinezki wymaga ponownego potwierdzenia.' : message}</p>
    <button type="button" className={`game-location-confirm ${value ? 'is-confirmed' : ''}`} disabled={!candidate || disabled} onClick={() => { if (candidateRef.current) { gpsGeneration.current++; setGpsBusy(false); onChange([...candidateRef.current]); } }}><Check size={18} aria-hidden="true" />{value ? 'Miejsce obserwacji potwierdzone' : 'To miejsce obserwacji'}</button>
    <details className="game-location-details"><summary>Szczegóły punktu: współrzędne</summary><div className="game-location-coordinates"><label>Szerokość geograficzna<input type="number" step="any" min="49.9" max="50.2" value={latitude} onChange={event => editCoordinate('latitude', event.target.value)} /></label><label>Długość geograficzna<input type="number" step="any" min="19.75" max="20.25" value={longitude} onChange={event => editCoordinate('longitude', event.target.value)} /></label></div><button type="button" onClick={() => { if (!latitude.trim() || !longitude.trim()) { setMessage('Uzupełnij obie współrzędne lub wybierz adres.'); return; } propose([Number(longitude), Number(latitude)], 'Punkt ze współrzędnych gotowy do sprawdzenia. Potwierdź miejsce.', true); }}>Ustaw punkt ze współrzędnych</button></details>
  </fieldset>;
}
