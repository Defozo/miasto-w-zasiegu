import { useEffect, useId, useRef, useState } from "react";
import { Layers, X } from "lucide-react";
import { LngLatBounds, type Map as MapLibre, type GeoJSONSource, type MapMouseEvent } from "maplibre-gl";
import type { AccessibilityFeature, BarrierReport, ObservationGeometry, Route, RouteFact } from "./types";
import { dateLabel } from "./api";
import { motionReduced } from "./display-preferences";
const DETAIL_ZOOM = 16;
const empty = () => ({ type: "FeatureCollection" as const, features: [] });
const points = (g: ObservationGeometry) => g.type === "Point" ? [g.coordinates] : g.type === "Polygon" ? g.coordinates[0] : g.coordinates;
export default function AccessibilityMap({ map, ready, picking, reports, route, focus, onReport }: {
  map: MapLibre | null; ready: boolean; picking: boolean; reports: BarrierReport[]; route: Route | null;
  focus?: RouteFact | null; onReport: (feature: AccessibilityFeature) => void;
}) {
  const [features, setFeatures] = useState<AccessibilityFeature[]>([]), [paths, setPaths] = useState(false), [enabled, setEnabled] = useState(true);
  const [open, setOpen] = useState(false), [selected, setSelected] = useState<AccessibilityFeature | null>(null), [message, setMessage] = useState("Wczytujemy dane OSM…");
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    else if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);
  const current = useRef({ features, picking }); current.current = { features, picking };
  useEffect(() => {
    if (!map || !ready) return;
    for (const id of ["access-data", "report-shapes", "route-facts", "access-focus"]) if (!map.getSource(id)) map.addSource(id, { type: "geojson", data: empty() });
    const definitions = [
      { id: "access-lines", type: "line" as const, source: "access-data", minzoom: DETAIL_ZOOM, filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": "#916016", "line-width": 3, "line-opacity": .65 } },
      { id: "access-points", type: "circle" as const, source: "access-data", minzoom: DETAIL_ZOOM, filter: ["==", ["geometry-type"], "Point"], paint: { "circle-color": "#9b5b15", "circle-radius": 5, "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 } },
      { id: "report-areas", type: "fill" as const, source: "report-shapes", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": "#ae3b32", "fill-opacity": .22 } },
      { id: "report-lines", type: "line" as const, source: "report-shapes", filter: ["!=", ["geometry-type"], "Point"], paint: { "line-color": "#ae3b32", "line-width": 5, "line-dasharray": [2, 1] } },
      { id: "fact-points", type: "circle" as const, source: "route-facts", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 7, "circle-color": "#9b5b15", "circle-stroke-width": 3, "circle-stroke-color": "white" } },
      { id: "focus-line", type: "line" as const, source: "access-focus", filter: ["!=", ["geometry-type"], "Point"], paint: { "line-color": "#7155c1", "line-width": 9, "line-opacity": .8 } },
      { id: "focus-point", type: "circle" as const, source: "access-focus", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 10, "circle-color": "#7155c1", "circle-stroke-color": "white", "circle-stroke-width": 3 } },
    ];
    for (const layer of definitions) if (!map.getLayer(layer.id)) map.addLayer(layer as Parameters<MapLibre["addLayer"]>[0]);
    const click = (event: MapMouseEvent) => {
      if (current.current.picking) return;
      const item = map.queryRenderedFeatures(event.point, { layers: ["access-points", "access-lines"] })[0];
      if (item) { const feature = current.current.features.find(f => f.id === item.id || f.id === item.properties?.featureId); if (feature) { setSelected(feature); setOpen(true); } }
    };
    map.on("click", click);
    return () => { map.off("click", click); };
  }, [map, ready]);
  useEffect(() => {
    if (!map || !ready) return;
    let controller: AbortController | null = null, active = true, timer: ReturnType<typeof setTimeout>;
    const source = () => map.getSource("access-data") as GeoJSONSource | undefined;
    const refresh = () => {
      clearTimeout(timer); controller?.abort();
      if (!enabled) { setFeatures([]); source()?.setData(empty()); setMessage("Warstwa danych OSM wyłączona."); return; }
      timer = setTimeout(async () => {
        const b = map.getBounds();
        if (map.getZoom() < DETAIL_ZOOM || b.getEast() - b.getWest() > .16 || b.getNorth() - b.getSouth() > .12) { setFeatures([]); source()?.setData(empty()); setMessage("Przybliż mapę, aby zobaczyć krawężniki i odcinki."); return; }
        controller = new AbortController();
        try {
          const bbox = [Math.max(19.7, b.getWest()), Math.max(49.85, b.getSouth()), Math.min(20.3, b.getEast()), Math.min(50.25, b.getNorth())].join(",");
          const response = await fetch(`/api/accessibility?bbox=${bbox}&kinds=kerb,steps,lift,entrance${paths ? ",path" : ""}`, { signal: controller.signal });
          const data = await response.json(); if (!response.ok) throw new Error(data.error?.message || "Dane niedostępne.");
          if (!active) return;
          const center = map.getCenter();
          data.features.sort((a: AccessibilityFeature, b: AccessibilityFeature) => {
            const dist = (f: AccessibilityFeature) => { const p = points(f.geometry)[0]; return (p[0] - center.lng) ** 2 + (p[1] - center.lat) ** 2; }; return dist(a) - dist(b);
          });
          setFeatures(data.features); setSnapshot(data.source?.snapshotAt || null);
          source()?.setData({ type: "FeatureCollection", features: data.features.map((f: AccessibilityFeature) => ({ ...f, properties: { ...f.properties, featureId: f.id } })) });
          setMessage(data.available ? `${data.features.length} elementów w widoku${data.truncated ? `. Wynik ograniczony z ${data.total}; przybliż mapę` : ""}.` : "Brak pliku danych OSM. Warstwa jest niedostępna.");
        } catch (e) { if (active && (e as Error).name !== "AbortError") { setFeatures([]); source()?.setData(empty()); setMessage((e as Error).message); } }
      }, 250);
    };
    map.on("moveend", refresh); refresh();
    return () => { active = false; clearTimeout(timer); controller?.abort(); map.off("moveend", refresh); };
  }, [map, ready, paths, enabled]);
  useEffect(() => {
    if (!map || !ready) return;
    (map.getSource("report-shapes") as GeoJSONSource)?.setData({ type: "FeatureCollection", features: reports.filter(r => r.status === "active" && r.geometry).map(r => ({ type: "Feature", properties: {}, geometry: r.geometry! })) });
    (map.getSource("route-facts") as GeoJSONSource)?.setData({ type: "FeatureCollection", features: (route?.accessibility?.events || []).map(f => ({ type: "Feature", properties: {}, geometry: f.geometry })) });
  }, [map, ready, reports, route]);
  const showGeometry = (geometry: ObservationGeometry) => {
    if (!map) return;
    const b = new LngLatBounds(); points(geometry).forEach(p => b.extend(p));
    map.fitBounds(b, { padding: 80, maxZoom: 18, duration: motionReduced() ? 0 : 300 });
    (map.getSource("access-focus") as GeoJSONSource)?.setData({ type: "Feature", properties: {}, geometry });
  };
  useEffect(() => { if (focus && ready) { setSelected(null); showGeometry(focus.geometry); } }, [focus, ready, map]);
  return <aside className={`accessibility-map-panel ${open ? "expanded" : ""}`} aria-label="Warstwa krawężników i dróg">
    <button type="button" className="access-layer-toggle" aria-label="Krawężniki i drogi · OSM" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}><Layers size={16} aria-hidden="true" /><span>OSM</span></button>
    <dialog ref={dialog} className="access-layer-dialog" aria-labelledby={titleId} onClose={() => setOpen(false)} onCancel={() => setOpen(false)}>
      <header className="access-layer-header"><h2 id={titleId}>Krawężniki i drogi · OSM</h2><button type="button" className="icon-button" aria-label="Zamknij warstwę OSM" onClick={() => setOpen(false)}><X size={20} aria-hidden="true" /></button></header>
      <div className="access-layer-body">
      <label><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> Krawężniki, schody, wejścia, windy</label>
      <label><input type="checkbox" checked={paths} onChange={e => setPaths(e.target.checked)} /> Nawierzchnie i parametry dróg</label>
      <p role="status">{message}</p>
      <small>Brązowy punkt lub linia: dane OSM. Nie oznacza potwierdzonej bariery. {snapshot ? `Wyciąg: ${dateLabel(snapshot)}.` : ""}</small>
      {selected && <article className="access-selected"><h3>{selected.properties.title}</h3>
        {selected.properties.details.map((d, i) => <p key={i}>{d}</p>)}{selected.properties.uncertainties.map((d, i) => <p className="evidence-unknown" key={i}>{d}</p>)}
        <p className="muted">{selected.properties.updatedAt ? `Edycja mapy: ${dateLabel(selected.properties.updatedAt)}. ` : ""}Brak audytu terenowego.</p>
        <div className="evidence-actions"><a href={selected.properties.sourceUrl} target="_blank" rel="noreferrer">Źródło OSM</a><button className="text-button" onClick={() => { setOpen(false); onReport(selected); }}>Zgłoś obserwację tutaj</button></div>
      </article>}
      <details><summary>Lista elementów w pobliżu środka mapy ({Math.min(features.length, 40)})</summary>
        <ul className="access-feature-list">{features.slice(0, 40).map(f => <li key={f.id}><button className="text-button" onClick={() => { setSelected(f); showGeometry(f.geometry); }}>{f.properties.title} · {points(f.geometry)[0][1].toFixed(5)}, {points(f.geometry)[0][0].toFixed(5)}</button></li>)}</ul>
        {features.length > 40 && <p>Przesuń lub przybliż mapę, aby zmienić listę najbliższych elementów.</p>}
      </details>
      </div>
    </dialog>
  </aside>;
}
