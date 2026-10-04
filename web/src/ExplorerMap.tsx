import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { ExplorerMission } from './explorer-types';
maplibregl.setWorkerUrl(workerUrl);
export default function ExplorerMap({ missions, onSelect }: { missions: ExplorerMission[]; onSelect: (mission: ExplorerMission) => void }) {
  const container = useRef<HTMLDivElement>(null), map = useRef<maplibregl.Map | null>(null), callback = useRef(onSelect);
  const [unavailable, setUnavailable] = useState(false); callback.current = onSelect;
  useEffect(() => {
    if (!container.current) return;
    let instance: maplibregl.Map;
    try {
      instance = new maplibregl.Map({ container: container.current, style: 'https://tiles.openfreemap.org/styles/liberty',
        center: [19.938, 50.061], zoom: 13, attributionControl: { compact: true },
        locale: { 'Map.Title': 'Mapa misji', 'NavigationControl.ZoomIn': 'Przybliż mapę', 'NavigationControl.ZoomOut': 'Oddal mapę', 'AttributionControl.ToggleAttribution': 'Informacje o mapie' } });
      map.current = instance; instance.addControl(new maplibregl.NavigationControl({ showCompass: false }));
      instance.on('error', () => setUnavailable(true));
    } catch { setUnavailable(true); return; }
    return () => { instance.remove(); map.current = null; };
  }, []);
  useEffect(() => {
    if (!map.current) return;
    const markers = missions.map((mission, index) => {
      const element = document.createElement('button'); element.className = `ex-map-pin ${mission.type}`;
      element.type = 'button'; element.textContent = String(index + 1); element.setAttribute('aria-label', `${mission.title}: ${mission.place}`);
      element.addEventListener('click', () => callback.current(mission));
      return new maplibregl.Marker({ element }).setLngLat(mission.coordinates).addTo(map.current!);
    });
    if (missions.length) {
      const bounds = new maplibregl.LngLatBounds(); missions.forEach(m => bounds.extend(m.coordinates));
      map.current.fitBounds(bounds, { padding: 55, maxZoom: 15, duration: 0 });
    }
    return () => markers.forEach(marker => marker.remove());
  }, [missions]);
  return <div className="ex-map-shell"><div ref={container} className="ex-map" role="region" aria-label="Mapa misji, te same miejsca są na liście" />
    {unavailable && <p className="ex-map-fallback" role="status">Mapa nie wczytała się w całości. Wszystkie misje znajdziesz na liście poniżej.</p>}</div>;
}
