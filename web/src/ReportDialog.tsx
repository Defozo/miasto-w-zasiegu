import { useEffect, useRef, useState } from "react";
import { X, MapPin, CheckCircle2 } from "lucide-react";
import { api } from "./api";
import type { AccessibilityFeature, Coordinates, BarrierReport, Place, ObservationGeometry } from "./types";
import ReportPhotoAssistant from "./ReportPhotoAssistant";
import { BrowserReportLocation, ReportLocationMap } from "./ReportLocation";
import { inReportArea, type PhotoSuggestion } from "./report-photo";
const localDateTime = (value?: string) => { const date = new Date(value || Date.now()); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
export const reportLabels = { obstacle: "Zablokowane przejście", kerb: "Krawężnik lub próg", surface: "Nawierzchnia", width: "Szerokość przejścia", lift: "Winda", steps: "Schody", ramp: "Podjazd", entrance: "Wejście", rest_place: "Miejsce odpoczynku", toilet: "Toaleta" };
const getPoints = (g?: ObservationGeometry): Coordinates[] => !g ? [] : g.type === "Point" ? [g.coordinates] : g.type === "Polygon" ? g.coordinates[0].slice(0, -1) : g.coordinates;
function ShapePreview({ points, shape }: { points: Coordinates[]; shape: string }) {
  if (points.length < 2) return null;
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]), minX = Math.min(...xs), minY = Math.min(...ys);
  const sx = Math.max(.00001, Math.max(...xs) - minX), sy = Math.max(.00001, Math.max(...ys) - minY);
  const projected = points.map(p => `${20 + (p[0] - minX) / sx * 240},${140 - (p[1] - minY) / sy * 120}`).join(" ");
  return <svg className="geometry-preview" viewBox="0 0 280 160" role="img" aria-label={`Schemat zaznaczenia: ${points.length} punktów. Północ u góry.`}>{shape === "Polygon" ? <polygon points={projected} fill="#dfede4" stroke="#245c46" strokeWidth="3" /> : <polyline points={projected} fill="none" stroke="#245c46" strokeWidth="3" />}</svg>;
}
export default function ReportDialog({ open, onClose, coordinates, locationChosen, onCoordinates, places, onSaved, onPick, userId, initialFeature, initialReport }: {
  open: boolean; onClose: () => void; coordinates: Coordinates; locationChosen: boolean; onCoordinates: (c: Coordinates) => void; places: Place[];
  onSaved: (r: BarrierReport) => void; onPick: () => void; userId: string | null; initialFeature?: AccessibilityFeature | null; initialReport?: BarrierReport | null;
}) {
  const ref = useRef<HTMLDialogElement>(null), waitingForMap = useRef<Coordinates | null>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const [kind, setKind] = useState<BarrierReport["kind"]>("obstacle"), [description, setDescription] = useState("");
  const [shape, setShape] = useState<ObservationGeometry["type"]>("Point"), [vertices, setVertices] = useState<Coordinates[]>([]);
  const [width, setWidth] = useState(""), [height, setHeight] = useState(""), [incline, setIncline] = useState(""), [surface, setSurface] = useState(""), [side, setSide] = useState("");
  const [measurement, setMeasurement] = useState("unknown"), [accuracy, setAccuracy] = useState("approximate"), [duration, setDuration] = useState("temporary"), [effect, setEffect] = useState("barrier"), [kerbType, setKerbType] = useState("unknown");
  const [until, setUntil] = useState(""), [featureId, setFeatureId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [success, setSuccess] = useState(false);
  const [explorerReward, setExplorerReward] = useState<BarrierReport['explorerReward']>();
  const [photoUsed, setPhotoUsed] = useState(false), [photoReviewed, setPhotoReviewed] = useState(false);
  const [locationSource, setLocationSource] = useState<NonNullable<BarrierReport['locationSource']>>('manual');
  const [observedAt, setObservedAt] = useState(() => localDateTime()), [detailsOpen, setDetailsOpen] = useState(false);
  useEffect(() => {
    const r = initialReport, f = initialFeature;
    const k = r?.kind || (f?.properties.kind === "path" ? "surface" : f?.properties.kind as BarrierReport["kind"]) || "obstacle";
    setKind(k); setDescription(r?.description || ""); setShape(r?.geometry?.type || f?.geometry.type || "Point");
    setVertices(getPoints(r?.geometry || f?.geometry)); setFeatureId(r?.featureId || f?.id || null);
    setWidth(r?.widthCm == null ? "" : String(r.widthCm)); setHeight(r?.heightCm == null ? "" : String(r.heightCm)); setIncline(r?.inclinePercent == null ? "" : String(r.inclinePercent));
    setSide(r?.side || ""); setSurface(r?.surface || ""); setKerbType(r?.kerbType || "unknown");
    setMeasurement(r?.measurement || "unknown"); setAccuracy(r?.locationAccuracy || (f ? "precise" : "approximate"));
    setDuration(r?.duration || (["obstacle", "lift"].includes(k) ? "temporary" : "permanent")); setEffect(r?.effect || "barrier"); setUntil(""); setError(""); setSuccess(false);
    setPhotoUsed(r?.inputMethod === 'photo-ai'); setPhotoReviewed(false); setLocationSource(r?.locationSource || 'manual');
    setObservedAt(localDateTime(r?.observedAt)); setDetailsOpen(Boolean(r || f?.geometry.type && f.geometry.type !== 'Point'));
  }, [initialFeature?.id, initialReport?.id]);
  useEffect(() => {
    const dialog = ref.current;
    if (open) {
      const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setSuccess(false); setError(""); dialog?.showModal();
      if (waitingForMap.current) { if (waitingForMap.current !== coordinates) { if (shape !== "Point") setVertices(v => [...v, coordinates]); setFeatureId(null); setLocationSource('manual'); setPhotoReviewed(false); } waitingForMap.current = null; }
      return () => { dialog?.close(); if (previous?.isConnected) previous.focus(); };
    } else dialog?.close();
  }, [open]);
  function changeKind(k: BarrierReport["kind"]) {
    setKind(k); setDuration(["obstacle", "lift"].includes(k) ? "temporary" : "permanent"); setEffect(["ramp", "entrance", "rest_place", "toilet"].includes(k) ? "facility" : "barrier");
  }
  function chooseLocation(point: Coordinates, source: NonNullable<BarrierReport['locationSource']> = 'manual') {
    onCoordinates(point); setFeatureId(null); setLocationSource(source); setAccuracy('approximate'); setPhotoReviewed(false);
  }
  function applyPhoto(suggestion: PhotoSuggestion) {
    setKind(suggestion.kind); setDescription(suggestion.description); setEffect(suggestion.effect); setDuration(suggestion.duration);
    setWidth(''); setHeight(''); setIncline(''); setSurface(''); setKerbType('unknown'); setMeasurement('unknown');
    setAccuracy('approximate'); setFeatureId(null);
    setPhotoUsed(true); setPhotoReviewed(false); setUntil('');
    requestAnimationFrame(() => descriptionRef.current?.focus());
  }
  const valid = shape === "Point" ? locationChosen && inReportArea(coordinates) : vertices.length >= (shape === "LineString" ? 2 : 3);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (!valid || busy || photoUsed && !photoReviewed) return; setBusy(true); setError("");
    const geometry: ObservationGeometry = shape === "Point" ? { type: shape, coordinates } : shape === "LineString" ? { type: shape, coordinates: vertices } : { type: shape, coordinates: [[...vertices, vertices[0]]] };
    try {
      const r = await api<BarrierReport>(initialReport ? `/reports/${initialReport.id}` : "/reports", {
        expectedUserId: userId, kind, description: description.trim(), coordinates, geometry, duration, effect, measurement, locationAccuracy: accuracy,
        featureId, side, kerbType, surface: kind === "surface" ? surface : null,
        inputMethod: photoUsed ? 'photo-ai' : 'manual', photoReviewed, locationSource, observedAt: new Date(observedAt).toISOString(),
        widthCm: width === "" ? null : Number(width), heightCm: height === "" ? null : Number(height), inclinePercent: incline === "" ? null : Number(incline),
        ...(duration === "temporary" && until ? { validUntil: new Date(until).toISOString() } : {}),
      }, initialReport ? "PUT" : "POST");
      onSaved(r); setExplorerReward(r.explorerReward); setSuccess(true);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <dialog ref={ref} className="report-dialog" aria-labelledby="report-title" aria-describedby={success ? undefined : "report-public-notice"} onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}>
    <div className="report-toolbar"><button className="dialog-close icon-button" aria-label="Zamknij zgłoszenie" disabled={busy} onClick={onClose}><X /></button></div>
    {success ? <div className="report-success"><CheckCircle2 size={48} /><h2 id="report-title">Obserwacja zapisana.</h2><p>Ma własną geometrię, datę i status. Nadal wymaga niezależnego potwierdzenia.</p>{explorerReward && <p role="status">{explorerReward.awarded ? `+${explorerReward.awarded} XP w Iskrach Miasta. ${explorerReward.badges?.length ? `Nowa odznaka: ${explorerReward.badges.join(', ')}.` : ''}` : explorerReward.reason}</p>}<button className="button primary full" onClick={onClose}>Wróć do mapy</button><a href="/gra" className="button secondary full">Zobacz odznaki i misje w Iskrach</a></div> : <>
      <h2 id="report-title">{initialReport ? "Popraw obserwację" : "Co jest na drodze?"}</h2><p className="muted">Opisz fakty, które pomogą innym ocenić przejazd.</p>
      <p id="report-public-notice" className="muted">Obserwacje są publiczne. Nie podawaj danych osobowych w opisie ani na zdjęciu.</p>
      <ReportPhotoAssistant userId={userId} onApply={applyPhoto} onLocation={p => chooseLocation(p, 'photo-gps')} disabled={busy} />
      <form onSubmit={submit} onChange={e => { if ((e.target as HTMLElement).id !== 'report-photo-review') setPhotoReviewed(false); }}>
        <label className="field-label" htmlFor="report-kind">Rodzaj obserwacji</label><select id="report-kind" value={kind} onChange={e => changeKind(e.target.value as BarrierReport["kind"])}>{Object.entries(reportLabels).map(([k, v]) => <option value={k} key={k}>{v}</option>)}</select>
        <label className="field-label" htmlFor="report-description">Krótki opis</label><textarea ref={descriptionRef} id="report-description" rows={3} minLength={3} maxLength={800} required value={description} onChange={e => setDescription(e.target.value)} placeholder="Opisz warunki przejazdu i dokładne miejsce. Nie podawaj danych osobowych." />
        {photoUsed && <p className="evidence-unknown">Opis przygotowany z pomocą AI. Popraw go, jeśli coś się nie zgadza. Wymiarów nie ustalamy ze zdjęcia.</p>}
        <h3>Miejsce obserwacji</h3>
        {open && <BrowserReportLocation coordinates={coordinates} disabled={busy} onLocation={p => chooseLocation(p, 'browser')} />}
        <button type="button" className="text-button" onClick={() => { waitingForMap.current = coordinates; onPick(); }}><MapPin size={16} />{shape === "Point" ? "Wskaż na mapie" : "Dodaj kolejny punkt na mapie"}</button>
        {open && locationChosen && inReportArea(coordinates) && shape === 'Point' && <ReportLocationMap coordinates={coordinates} onLocation={chooseLocation} />}
        {locationChosen && <p className="muted">Położenie: {locationSource === 'photo-gps' ? 'z GPS zdjęcia' : locationSource === 'browser' ? 'z przeglądarki' : 'wskazane ręcznie'}. {accuracy === 'approximate' ? 'Orientacyjne, sprawdź dokładne miejsce bariery.' : 'Oznaczone jako dokładne.'}</p>}
        {!valid && <p className="evidence-unknown">Wskaż położenie i pełny zasięg obserwacji.</p>}
        <details className="report-details" open={detailsOpen} onToggle={e => setDetailsOpen(e.currentTarget.open)}><summary>Zasięg, wymiary i dodatkowe szczegóły</summary>
        <label className="field-label" htmlFor="report-effect">Znaczenie</label><select id="report-effect" value={effect} onChange={e => setEffect(e.target.value)}><option value="barrier">Utrudnienie</option><option value="facility">Udogodnienie</option><option value="information">Informacja do oceny</option></select>
        <label className="field-label" htmlFor="report-shape">Zasięg obserwacji</label><select id="report-shape" value={shape} onChange={e => { setShape(e.target.value as ObservationGeometry["type"]); setVertices([]); setFeatureId(null); }}><option value="Point">Punkt: przejście, próg, winda, pojedyncza przeszkoda</option><option value="LineString">Odcinek: krawężnik, nierówna nawierzchnia, zwężenie</option><option value="Polygon">Obszar: remont, zamknięty fragment placu</option></select>
        {kind === "kerb" && <p className="evidence-unknown">Jeśli krawężnik trzeba przekroczyć, wskaż miejsce wejścia lub zejścia z jezdni. Krawężnik wzdłuż chodnika zaznacz odcinkiem. Nie zakładaj, że „obniżony” oznacza konkretną wysokość.</p>}
        {featureId && <p className="source-badge">Powiązanie z elementem OSM: {featureId}. Sprawdź, czy zaznaczenie odpowiada całej obserwacji.</p>}
        {shape === "Point" && <><label className="field-label" htmlFor="report-place">Miejsce obserwacji</label><select id="report-place" value="" onChange={e => { const p = places.find(p => p.id === e.target.value); if (p) chooseLocation(p.coordinates); }}><option value="">Wybierz punkt z listy lub wskaż na mapie</option>{places.slice(0, 100).map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</select></>}
        <div className="two-fields"><div><label className="field-label" htmlFor="report-lat">Szerokość geogr.</label><input id="report-lat" type="number" step="any" min="49.9" max="50.2" value={coordinates[1]} onChange={e => chooseLocation([coordinates[0], Number(e.target.value)])} /></div><div><label className="field-label" htmlFor="report-lon">Długość geogr.</label><input id="report-lon" type="number" step="any" min="19.75" max="20.25" value={coordinates[0]} onChange={e => chooseLocation([Number(e.target.value), coordinates[1]])} /></div></div>
        {shape !== "Point" && <><button type="button" className="text-button" disabled={!locationChosen || vertices.length >= 59} onClick={() => { setVertices(v => [...v, coordinates]); setFeatureId(null); }}>Dodaj punkt ze współrzędnych</button><ShapePreview points={vertices} shape={shape} /><ol className="geometry-points">{vertices.map((p, i) => <li key={i}>{p[1].toFixed(6)}, {p[0].toFixed(6)} <button type="button" className="text-button" aria-label={`Usuń punkt ${i + 1}`} onClick={() => { setVertices(v => v.filter((_, j) => i !== j)); setFeatureId(null); }}>Usuń</button></li>)}</ol><p>{shape === "Polygon" ? "Zaznacz co najmniej 3 wierzchołki. Obrys zamkniemy automatycznie." : "Zaznacz co najmniej 2 punkty, w kolejności wzdłuż odcinka."}</p></>}
        {!valid && <p className="evidence-unknown">Wskaż położenie i pełny zasięg obserwacji.</p>}
        <label className="field-label" htmlFor="report-side">Strona ulicy lub szczegóły położenia</label><input id="report-side" value={side} maxLength={140} onChange={e => setSide(e.target.value)} placeholder="Np. wschodnia strona, przy wejściu od parku" />
        <label className="field-label" htmlFor="report-accuracy">Dokładność zaznaczenia</label><select id="report-accuracy" value={accuracy} onChange={e => setAccuracy(e.target.value)}><option value="approximate">Orientacyjna: nie wiem, czy punkt trafia w przejście</option><option value="precise">Dokładna: wskazuję konkretne przejście lub odcinek</option></select>
        {kind === "kerb" && <><label className="field-label" htmlFor="report-kerb">Rodzaj krawężnika</label><select id="report-kerb" value={kerbType} onChange={e => setKerbType(e.target.value)}><option value="unknown">Nie wiem</option><option value="raised">Wysoki</option><option value="lowered">Obniżony</option><option value="flush">Zlicowany z jezdnią</option><option value="no">Brak krawężnika</option></select></>}
        <fieldset><legend>Wymiary, jeśli je znasz</legend><div className="two-fields"><div><label className="field-label" htmlFor="report-width">Wolna szerokość (cm)</label><input id="report-width" type="number" min="0" max="1000" step="0.1" value={width} onChange={e => setWidth(e.target.value)} /></div><div><label className="field-label" htmlFor="report-height">Wysokość progu / krawężnika (cm)</label><input id="report-height" type="number" min="0" max="100" step="0.1" value={height} onChange={e => setHeight(e.target.value)} /></div></div><label className="field-label" htmlFor="report-incline">Nachylenie (%)</label><input id="report-incline" type="number" min="0" max="40" step="0.1" value={incline} onChange={e => setIncline(e.target.value)} /><label className="field-label" htmlFor="report-measurement">Skąd są wymiary?</label><select id="report-measurement" value={measurement} onChange={e => setMeasurement(e.target.value)}><option value="unknown">Brak pomiaru</option><option value="measured">Zmierzone na miejscu</option><option value="estimated">Szacowane wzrokowo</option></select></fieldset>
        {kind === "surface" && <><label className="field-label" htmlFor="report-surface">Nawierzchnia</label><select id="report-surface" value={surface} onChange={e => setSurface(e.target.value)}><option value="">Nie wiem</option><option value="asphalt">Asfalt</option><option value="paving_stones">Kostka</option><option value="cobblestone">Bruk</option><option value="gravel">Żwir</option><option value="ground">Grunt</option><option value="sand">Piasek</option><option value="grass">Trawa</option></select></>}
        <label className="field-label" htmlFor="report-duration">Jak długo występuje?</label><select id="report-duration" value={duration} onChange={e => setDuration(e.target.value)}><option value="permanent">Stały element miejsca</option><option value="temporary">Tymczasowe utrudnienie lub stan</option><option value="unknown">Nie wiem</option></select>
        {duration === "temporary" && <><label className="field-label" htmlFor="report-until">Przewidywany koniec (opcjonalnie)</label><input id="report-until" type="datetime-local" value={until} onChange={e => setUntil(e.target.value)} /><p className="muted">Bez terminu poprosimy o ponowne potwierdzenie po {kind === "lift" ? "4 godzinach" : "24 godzinach"}.</p></>}
        </details>
        <label className="field-label" htmlFor="report-observed">Data obserwacji</label><input id="report-observed" type="datetime-local" required value={observedAt} onChange={e => setObservedAt(e.target.value)} />
        {photoUsed && <><p className="muted">Jeśli zdjęcie jest starsze, podaj datę zrobienia zdjęcia. Data przesłania nie potwierdza aktualności bariery.</p><label className="report-review"><input id="report-photo-review" type="checkbox" checked={photoReviewed} onChange={e => setPhotoReviewed(e.target.checked)} />Sprawdziłem opis, położenie i datę obserwacji.</label></>}
        {error && <p role="alert" className="error-box">{error}</p>}<button className="button primary full" disabled={busy || !valid || photoUsed && !photoReviewed} type="submit">{busy ? "Zapisujemy…" : initialReport ? "Zapisz poprawkę" : "Dodaj obserwację"}</button>
      </form>
    </>}
  </dialog>;
}
