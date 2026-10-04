import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  Navigation,
  Layers,
  Plus,
  Minus,
  Scan,
  SlidersHorizontal,
} from "lucide-react";
import { motionReduced } from "./display-preferences";
import AccessibilityMap from "./AccessibilityMap";
import type { AccessibilityFeature, RouteFact } from "./types";
import type {
  Place,
  MapPlace,
  Route,
  Coordinates,
  BarrierReport,
  CommunityObservation,
  LocationPoint,
} from "./types";
maplibregl.setWorkerUrl(workerUrl);

interface Props {
  onUnavailableChange: (unavailable: boolean) => void;
  evidenceFocus?: RouteFact | null;
  onReportFeature: (feature: AccessibilityFeature) => void;
  onReportSelect: () => void;
  livePosition?: Coordinates | null;
  mapPosition?: Coordinates | null;
  onLocate?: () => void;
  driveRoute?: Route | null;
  onAreaChange?: (bbox: string) => void;
  places: MapPlace[];
  showPlaces: boolean;
  filterSummary: string;
  onOpenFilters: () => void;
  selected: Place | null;
  onSelect: (p: MapPlace) => void;
  route: Route | null;
  start: Coordinates | null;
  waypoints: (LocationPoint | null)[];
  previewStop: LocationPoint | null;
  onDismissPreview: () => void;
  journeyMode: boolean;
  reports: BarrierReport[];
  observations: CommunityObservation[];
  focusedObservation: string | null;
  onObservation: (id: string) => void;
  picking: boolean;
  onPick: (p: Coordinates) => void;
  onCancelPick: () => void;
}
export default function CityMap({
  onUnavailableChange,
  evidenceFocus,
  onReportFeature,
  onReportSelect,
  livePosition,
  mapPosition,
  onLocate,
  driveRoute,
  onAreaChange,
  places,
  showPlaces,
  filterSummary,
  onOpenFilters,
  selected,
  onSelect,
  route,
  start,
  waypoints,
  previewStop,
  onDismissPreview,
  journeyMode,
  reports,
  observations,
  focusedObservation,
  onObservation,
  picking,
  onPick,
  onCancelPick,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const legend = useRef<HTMLDivElement>(null);
  const returnFromPick = useRef<HTMLButtonElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const positionMarker = useRef<maplibregl.Marker | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { if (ready && mapPosition) map.current?.easeTo({center: mapPosition, zoom: 15, duration: motionReduced() ? 0 : 250}); }, [ready, mapPosition]);
  useEffect(() => {
    positionMarker.current?.remove(); positionMarker.current = null;
    if (ready && map.current && livePosition) {
      const dot = document.createElement("div"); dot.className = "live-position"; dot.setAttribute("aria-label", "Twoja pozycja GPS");
      positionMarker.current = new maplibregl.Marker({element: dot}).setLngLat(livePosition).addTo(map.current);
    }
    return () => { positionMarker.current?.remove(); positionMarker.current = null; };
  }, [ready, livePosition]);
  const [failed, setFailed] = useState(false);
  useEffect(() => { onUnavailableChange(failed); }, [failed, onUnavailableChange]);
  const [style, setStyle] = useState(false);
  const [viewportVersion, setViewportVersion] = useState(0);
  const focusedObservationVisible = observations.some(
    (observation) => observation.id === focusedObservation,
  );
  const fitJourneyRef = useRef<() => void>(() => {});
  fitJourneyRef.current = () => {
    if (journeyMode) {
      if (previewStop) focusPreview();
      else fitJourney();
    }
  };
  const current = useRef({ onSelect, onPick, picking, onObservation, onAreaChange, onReportSelect });
  current.current = { onSelect, onPick, picking, onObservation, onAreaChange, onReportSelect };
  useEffect(() => {
    if (!container.current) return;
    let m: maplibregl.Map;
    try {
      m = new maplibregl.Map({
        container: container.current,
        style: "https://tiles.openfreemap.org/styles/positron",
        center: [19.941, 50.0575],
        zoom: 14.2,
        minZoom: 9,
        maxZoom: 19,
        attributionControl: { compact: false },
        cooperativeGestures: false,
        locale: {
          "Map.Title": "Mapa Krakowa",
          "AttributionControl.ToggleAttribution": "Informacje o mapie",
        },
      });
      map.current = m;
      m.on("load", () => {
        setReady(true);
        setFailed(false);
        m.addSource("route", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        m.addSource("drive-route", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        m.addLayer({ id: "drive-route-line", type: "line", source: "drive-route", paint: { "line-color": "#5265ad", "line-width": 5, "line-dasharray": [2, 1] } });
        m.addLayer({
          id: "route-outline",
          type: "line",
          source: "route",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-width": 11, "line-color": "#ffffff" },
        });
        m.addLayer({
          id: "route-line",
          type: "line",
          source: "route",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-width": 6, "line-color": "#245c46" },
        });
      });
      m.on("error", () => {
        if (!m.isStyleLoaded()) setFailed(true);
      });
      m.on("click", (e) => {
        if (current.current.picking)
          current.current.onPick([e.lngLat.lng, e.lngLat.lat]);
      });
      m.on("moveend", (event) => {
        setViewportVersion((v) => v + 1);
        if (event.originalEvent) { const b = m.getBounds(); current.current.onAreaChange?.([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map(v => v.toFixed(6)).join(",")); }
      });
    } catch {
      setFailed(true);
      return;
    }
    const observer = new ResizeObserver(() => {
      if (container.current?.clientWidth && container.current.clientHeight) {
        m.resize();
        fitJourneyRef.current();
      }
    });
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      setReady(false);
      m.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    markers.current.forEach((x) => x.remove());
    markers.current = [];
    const displayed = !showPlaces
      ? []
      : selected && !journeyMode
        ? [selected, ...places.filter((x) => x.id !== selected.id)]
        : journeyMode
          ? places.filter(
              (p) =>
                p.id !== selected?.id &&
                !waypoints.some((point) => point?.id === p.id),
            )
          : places;
    const groups: MapPlace[][] = [];
    const cells = new Map<string, { places: MapPlace[]; x: number; y: number }[]>();
    const zoom = m.getZoom();
    const overview = zoom < 15.5;
    // Keep the overview sparse; reveal individual places at street level.
    const spacing = zoom < 13 ? 220 : overview ? 160 : zoom < 17 ? 96 : 64;
    const width = m.getContainer().clientWidth, height = m.getContainer().clientHeight;
    // Most catalogue points are outside the viewport. Reject them before the
    // comparatively expensive map projection and screen-space clustering.
    const visibleBounds = new maplibregl.LngLatBounds();
    for (const corner of [[-64, -64], [width + 64, -64], [width + 64, height + 64], [-64, height + 64]]) {
      visibleBounds.extend(m.unproject(corner as [number, number]));
    }
    displayed.forEach((p) => {
      if (!visibleBounds.contains(p.coordinates)) return;
      const pt = m.project(p.coordinates);
      if (pt.x < -64 || pt.y < -64 || pt.x > width + 64 || pt.y > height + 64) return;
      const cellX = Math.floor(pt.x / spacing), cellY = Math.floor(pt.y / spacing);
      const standalone = selected?.id === p.id || (!overview && p.promotion);
      const nearby =
        standalone
          ? undefined
          : [-1, 0, 1].flatMap(dx => [-1, 0, 1].flatMap(dy => cells.get(`${cellX + dx},${cellY + dy}`) ?? []))
              .find(group => Math.hypot(group.x - pt.x, group.y - pt.y) < spacing);
      if (nearby) nearby.places.push(p);
      else {
        const group = [p];
        groups.push(group);
        if (!standalone) {
          const key = `${cellX},${cellY}`;
          const cell = cells.get(key) ?? [];
          cell.push({ places: group, x: pt.x, y: pt.y });
          cells.set(key, cell);
        }
      }
    });
    for (const group of groups) {
      const p = group[0];
      const isSelected = selected?.id === p.id;
      const isCluster = group.length > 1 || (overview && !isSelected);
      const promotion = !isCluster ? p.promotion : undefined;
      const clusterLabel = `Miejsca: ${group.length}. Przybliż mapę${group.some(place => place.promotion) ? ". Zawiera reklamę" : ""}`;
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.placeCount = String(group.length);
      b.className = `place-pin ${isSelected ? "is-selected" : ""} ${isCluster ? "place-cluster" : p.category} ${promotion ? "is-sponsored" : ""}`;
      b.tabIndex = -1;
      b.setAttribute(
        "aria-label",
        isCluster
          ? clusterLabel
          : `Pokaż miejsce: ${p.name}${promotion ? ". Reklama" : ""}${p.municipalFacts ? ". Dane miasta" : ""}`,
      );
      b.title = isCluster ? clusterLabel : p.name;
      if (isCluster) b.textContent = String(group.length);
      else if (p.category === "toilet") b.textContent = "WC";
      else
        b.innerHTML =
          '<svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>';
      if (promotion) { const label = document.createElement('span'); label.textContent = 'Reklama'; b.append(label); b.title = `${p.name} · Sponsorowane przez: ${promotion.advertiser}`; }
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        if (current.current.picking) current.current.onPick(p.coordinates);
        else if (isCluster)
          m.easeTo({
            center: p.coordinates,
            zoom: Math.min(19, Math.max(15.5, m.getZoom() + 1.8)),
            duration: motionReduced() ? 0 : 450,
          });
        else current.current.onSelect(p);
      });
      markers.current.push(
        new maplibregl.Marker({ element: b }).setLngLat(p.coordinates).addTo(m),
      );
    }
    if (start && journeyMode) {
      const s = document.createElement("div");
      s.className = "start-pin";
      s.setAttribute("aria-label", "Początek trasy");
      s.setAttribute("role", "img");
      s.textContent = "A";
      markers.current.push(
        new maplibregl.Marker({ element: s }).setLngLat(start).addTo(m),
      );
    }
    if (journeyMode) {
      const points = [
        ...waypoints.flatMap((point, i) =>
          point
            ? [
                {
                  point,
                  label: String(i + 1),
                  title: `Przystanek ${i + 1}: ${point.label}`,
                },
              ]
            : [],
        ),
        ...(selected
          ? [
              {
                point: { coordinates: selected.coordinates },
                label: "B",
                title: `Cel trasy: ${selected.name}`,
              },
            ]
          : []),
      ];
      for (const { point, label, title } of points) {
        const pin = document.createElement("div");
        pin.className =
          label === "B"
            ? "journey-pin journey-destination"
            : "journey-pin journey-stop";
        pin.textContent = label;
        pin.setAttribute("role", "img");
        pin.setAttribute("aria-label", title);
        pin.title = title;
        markers.current.push(
          new maplibregl.Marker({ element: pin })
            .setLngLat(point.coordinates)
            .addTo(m),
        );
      }
    }
    if (previewStop && journeyMode) {
      const pin = document.createElement("div");
      pin.className = "preview-stop-pin";
      pin.textContent = "+";
      pin.setAttribute("role", "img");
      pin.setAttribute(
        "aria-label",
        `Propozycja przystanku: ${previewStop.label}`,
      );
      markers.current.push(
        new maplibregl.Marker({ element: pin })
          .setLngLat(previewStop.coordinates)
          .addTo(m),
      );
    }
    reports
      .filter((r) => r.status === "active")
      .forEach((r) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = `report-pin${r.stale ? " report-pin-stale" : ""}`;
        b.textContent = "!";
        b.title = `Zgłoszenie: ${r.description}`;
        b.setAttribute("aria-label", `Obserwacja: ${r.description}. Pokaż szczegóły`);
        b.addEventListener("click", e => { e.stopPropagation(); if (!current.current.picking) current.current.onReportSelect(); });
        markers.current.push(
          new maplibregl.Marker({ element: b })
            .setLngLat(r.coordinates)
            .addTo(m),
        );
      });
    observations.forEach((o) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "observation-pin";
      b.textContent =
        o.type === "rest_place"
          ? "☕"
          : o.type === "step_free_entrance"
            ? "↗"
            : "↕";
      b.setAttribute("aria-label", `Odkrycie: ${o.label}. Pokaż opis`);
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!current.current.picking) current.current.onObservation(o.id);
      });
      markers.current.push(
        new maplibregl.Marker({ element: b }).setLngLat(o.coordinates).addTo(m),
      );
    });
  }, [
    places,
    showPlaces,
    selected,
    ready,
    start,
    waypoints,
    previewStop,
    journeyMode,
    reports,
    observations,
    viewportVersion,
  ]);
  useEffect(() => {
    const target = observations.find((o) => o.id === focusedObservation);
    if (target && ready)
      map.current?.easeTo({
        center: target.coordinates,
        zoom: 17,
        duration: motionReduced() ? 0 : 500,
      });
  }, [focusedObservation, focusedObservationVisible, ready]);
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const src = m.getSource("route") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData(
      route && journeyMode
        ? { type: "Feature", properties: {}, geometry: route.geometry }
        : { type: "FeatureCollection", features: [] },
    );
    if (route && journeyMode) fitJourney();
  }, [route, ready, journeyMode]);
  function fitJourney() {
    const m = map.current;
    if (
      !m ||
      !route?.geometry.coordinates.length ||
      !container.current?.clientWidth ||
      !container.current.clientHeight
    )
      return;
    const bounds = new maplibregl.LngLatBounds();
    route.geometry.coordinates.forEach((point) => bounds.extend(point));
    driveRoute?.geometry.coordinates.forEach(point => bounds.extend(point));
    if (start) bounds.extend(start);
    if (selected) bounds.extend(selected.coordinates);
    waypoints.forEach((point) => {
      if (point) bounds.extend(point.coordinates);
    });
    const canvasBounds = container.current.getBoundingClientRect();
    const legendBounds = legend.current?.getBoundingClientRect();
    const bottom = Math.max(
      150,
      legendBounds ? canvasBounds.bottom - legendBounds.top + 34 : 150,
    );
    m.fitBounds(bounds, {
      padding: { top: 80, right: 80, bottom, left: 55 },
      maxZoom: 16,
      duration: motionReduced() ? 0 : 650,
    });
  }
  useEffect(() => {
    const source = map.current?.getSource("drive-route") as maplibregl.GeoJSONSource | undefined;
    source?.setData(driveRoute && journeyMode ? { type: "Feature", properties: {}, geometry: driveRoute.geometry } : {type: "FeatureCollection", features: []});
    if (driveRoute && journeyMode) fitJourney();
  }, [driveRoute, ready, journeyMode]);
  function focusPreview() {
    if (
      !previewStop ||
      !container.current?.clientWidth ||
      !container.current.clientHeight
    )
      return;
    map.current?.easeTo({
      center: previewStop.coordinates,
      zoom: 17,
      padding: { top: 100, right: 65, bottom: 150, left: 25 },
      duration: motionReduced() ? 0 : 500,
    });
  }
  useEffect(() => {
    if (!ready || !journeyMode) return;
    if (previewStop) focusPreview();
    else fitJourney();
  }, [previewStop, ready]);
  const selectedId = selected?.id;
  const selectedLongitude = selected?.coordinates[0];
  const selectedLatitude = selected?.coordinates[1];
  const showingJourney = Boolean(route && journeyMode);
  useEffect(() => {
    if (ready && selectedLongitude !== undefined && selectedLatitude !== undefined && !showingJourney)
      map.current?.easeTo({
        center: [selectedLongitude, selectedLatitude],
        zoom: 15.5,
        duration: motionReduced() ? 0 : 250,
      });
  }, [selectedId, selectedLongitude, selectedLatitude, ready, showingJourney]);
  useEffect(() => {
    if (container.current)
      container.current.style.cursor = picking ? "crosshair" : "";
    if (picking) {
      const frame = requestAnimationFrame(() => returnFromPick.current?.focus());
      return () => cancelAnimationFrame(frame);
    }
  }, [picking]);
  return (
    <section
      className={`map-section ${style ? "map-high-contrast" : ""}`}
      aria-label="Mapa miejsc w Krakowie"
      data-map-ready={ready}
      onKeyDown={event => {
        if (picking && event.key === "Escape") {
          event.preventDefault();
          onCancelPick();
        }
      }}
    >
      <div ref={container} className="map-canvas" />
      <div className="map-filter-toolbar" role="group" aria-label="Warstwy i filtry mapy">
      <button
        type="button"
        className="map-filter-summary"
        aria-label="Zmień filtry mapy"
        aria-haspopup="dialog"
        onClick={onOpenFilters}
      >
        <SlidersHorizontal size={17} />
        <span>
          <strong>{filterSummary}</strong>
        </span>
      </button>
      {!failed && <AccessibilityMap map={map.current} ready={ready} picking={picking} reports={reports} route={journeyMode ? route : null} focus={evidenceFocus} onReport={onReportFeature} />}
      </div>
      <div className="map-controls">
        {journeyMode && route && (
          <button
            disabled={!ready}
            onClick={() => {
              onDismissPreview();
              fitJourney();
            }}
            aria-label="Pokaż całą trasę"
          >
            <Scan size={20} />
          </button>
        )}
        <button
          onClick={() =>
            map.current?.zoomIn({ duration: motionReduced() ? 0 : 300 })
          }
          disabled={!ready}
          aria-label="Przybliż mapę"
        >
          <Plus size={20} />
        </button>
        <button
          disabled={!ready}
          onClick={() =>
            map.current?.zoomOut({ duration: motionReduced() ? 0 : 300 })
          }
          aria-label="Oddal mapę"
        >
          <Minus size={20} />
        </button>
        <button
          onClick={onLocate}
          aria-label="Pokaż moją lokalizację"
        >
          <Navigation size={20} />
        </button>
        <button
          onClick={() => setStyle(!style)}
          aria-label="Większy kontrast mapy"
          aria-pressed={style}
        >
          <Layers size={20} />
        </button>
      </div>
      {picking && (
        <div className="map-message">
          <span id="report-pick-instruction" role="status">
            {failed
              ? "Podkład jest niedostępny. Wróć do formularza i wybierz miejsce z listy."
              : "Wskaż miejsce bariery na mapie. Możesz też wybrać punkt w formularzu."}
          </span>
          <button ref={returnFromPick} className="text-button" aria-describedby="report-pick-instruction" onClick={onCancelPick}>
            Wróć do formularza
          </button>
        </div>
      )}
      {previewStop && journeyMode && !picking && !failed && (
        <div className="map-message stop-preview-message" role="status">
          <strong>{previewStop.label}</strong>
          <span>Podgląd propozycji. Twój plan pozostał bez zmian.</span>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              onDismissPreview();
              container.current?.parentElement
                ?.querySelector<HTMLButtonElement>(
                  '[aria-label="Pokaż całą trasę"]',
                )
                ?.focus();
            }}
          >
            Zamknij podgląd
          </button>
        </div>
      )}
      <div className="map-legend" ref={legend}>
        <span>
          <i className="legend-route" />
          {journeyMode ? "Plan trasy" : "Odkrywaj miejsca"}
        </span>
        <span>
          <i className="legend-place" />
          {journeyMode && selected
            ? `A: początek · B: cel${waypoints.some(Boolean) ? " · liczby: przystanki" : ""}`
            : "Miejsce na mapie"}
        </span>
        <span>Informacje o barierach mogą być niepełne</span>
      </div>
    </section>
  );
}
