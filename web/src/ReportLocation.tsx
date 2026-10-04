import { useEffect, useRef, useState } from 'react';
import { LocateFixed } from 'lucide-react';
import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { inReportArea } from './report-photo';
import type { Coordinates } from './types';
maplibregl.setWorkerUrl(workerUrl);

export function BrowserReportLocation({ onLocation, disabled, coordinates }: { onLocation: (point: Coordinates) => void; disabled: boolean; coordinates: Coordinates }) {
  const active = useRef(true), generation = useRef(0);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => { generation.current++; setBusy(false); }, [coordinates[0], coordinates[1], disabled]);
  function locate() {
    if (!navigator.geolocation) { setMessage('Ta przeglądarka nie udostępnia lokalizacji. Wskaż miejsce na mapie.'); return; }
    const token = ++generation.current;
    setBusy(true); setMessage('');
    navigator.geolocation.getCurrentPosition(position => {
      if (!active.current || token !== generation.current) return;
      setBusy(false);
      const point: Coordinates = [position.coords.longitude, position.coords.latitude];
      if (!inReportArea(point)) { setMessage('Twoja lokalizacja jest poza obsługiwanym obszarem Krakowa. Wskaż miejsce obserwacji na mapie.'); return; }
      onLocation(point);
      setMessage(`Użyto Twojego położenia. Dokładność GPS: około ${Math.round(position.coords.accuracy)} m. Przesuń pinezkę na miejsce bariery, jeśli jest obok.`);
    }, error => {
      if (!active.current || token !== generation.current) return;
      setBusy(false); setMessage(error.code === 1 ? 'Nie udzielono dostępu do lokalizacji. Nadal możesz wskazać miejsce na mapie lub użyć GPS zdjęcia.' : 'Nie udało się ustalić położenia. Spróbuj ponownie lub wskaż miejsce na mapie.');
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
  }
  return <><button type="button" className="text-button" disabled={disabled || busy} onClick={locate}><LocateFixed size={16} />{busy ? 'Ustalamy położenie…' : 'Użyj mojego położenia'}</button>{message && <p className="muted" role="status">{message}</p>}</>;
}

export function ReportLocationMap({ coordinates, onLocation }: { coordinates: Coordinates; onLocation: (point: Coordinates) => void }) {
  const container = useRef<HTMLDivElement>(null), map = useRef<maplibregl.Map | null>(null), marker = useRef<maplibregl.Marker | null>(null);
  const current = useRef({ coordinates, onLocation }); current.current = { coordinates, onLocation };
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!container.current) return;
    let instance: maplibregl.Map;
    try {
      instance = new maplibregl.Map({ container: container.current, style: 'https://tiles.openfreemap.org/styles/positron',
        center: current.current.coordinates, zoom: 17, minZoom: 10, maxZoom: 19,
        maxBounds: [[19.75, 49.9], [20.25, 50.2]], scrollZoom: false,
        attributionControl: { compact: true }, locale: { 'Map.Title': 'Miejsce obserwacji', 'AttributionControl.ToggleAttribution': 'Informacje o mapie' },
      });
      map.current = instance;
      const pin = new maplibregl.Marker({ color: '#985110', draggable: true }).setLngLat(current.current.coordinates).addTo(instance);
      marker.current = pin;
      const choose = (lng: number, lat: number) => { const p: Coordinates = [lng, lat]; if (inReportArea(p)) current.current.onLocation(p); };
      pin.on('dragend', () => { const p = pin.getLngLat(); choose(p.lng, p.lat); });
      instance.on('click', e => choose(e.lngLat.lng, e.lngLat.lat));
      instance.on('error', () => setFailed(true));
      instance.on('load', () => { instance.resize(); setFailed(false); });
      return () => { pin.remove(); instance.remove(); map.current = null; marker.current = null; };
    } catch { setFailed(true); }
  }, []);
  useEffect(() => { marker.current?.setLngLat(coordinates); map.current?.jumpTo({ center: coordinates }); }, [coordinates[0], coordinates[1]]);
  return <div className="report-location-map">
    <div className="report-mini-map" ref={container} />
    <p className="muted">Kliknij miejsce bariery lub przeciągnij pinezkę. Współrzędne: {coordinates[1].toFixed(6)}, {coordinates[0].toFixed(6)}.</p>
    <button type="button" className="text-button" onClick={() => { const p = map.current?.getCenter(); if (p && inReportArea([p.lng, p.lat])) onLocation([p.lng, p.lat]); }}>Ustaw punkt w środku mapy</button>
    {failed && <p className="evidence-unknown">Podkład mapy jest niedostępny. Współrzędne możesz poprawić w szczegółach poniżej.</p>}
  </div>;
}
