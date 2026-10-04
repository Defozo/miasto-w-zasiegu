import { Car, Footprints, Navigation, MapPin } from "lucide-react";
import type { JourneyAlternative, JourneyResult } from "./types";
import { metres } from "./api";
export function googleParkingUrl(journey: JourneyAlternative) {
  const p = journey.transfer.vehicleEntrance;
  const params = new URLSearchParams({ api: "1", destination: `${p[1]},${p[0]}`, travelmode: "driving", dir_action: "navigate" });
  return `https://www.google.com/maps/dir/?${params}`;
}
export default function JourneyPanel({ mode, onMode, result, selectedId, onSelect, onDepart, onContinue, departed, ramp, onRamp }: {
  mode: "direct" | "car"; onMode: (v: "direct" | "car") => void; result: JourneyResult | null;
  selectedId: string | null; onSelect: (a: JourneyAlternative) => void; onDepart: (a: JourneyAlternative) => boolean;
  onContinue: (a: JourneyAlternative) => void; departed: boolean; ramp: boolean; onRamp: (v: boolean) => void;
}) {
  const selected = result?.alternatives.find(a => a.id === selectedId);
  return <section className="journey-panel" aria-label="Sposób podróży">
    <div className="travel-modes"><button aria-pressed={mode === "direct"} onClick={() => onMode("direct")}><Footprints size={19} />Bez auta</button><button aria-pressed={mode === "car"} onClick={() => onMode("car")}><Car size={19} />Auto + dalszy odcinek</button></div>
    {mode === "car" && <>
      <details><summary>Warunki przesiadki</summary><label className="check-row"><input type="checkbox" checked={ramp} onChange={e => onRamp(e.target.checked)} />Potrzebuję miejsca na rampę lub wysiadanie</label><p className="field-help">Ocenisz miejsce na podstawie opisów. Nie znamy zajętości parkingu ani Twoich uprawnień parkingowych.</p></details>
      {result && <><h2>Wybierz parking</h2><p className="field-help">Data obliczenia: {new Date(result.calculatedAt).toLocaleString("pl-PL")}</p>
        {result.alternatives.map(a => <button className={`parking-choice ${a.id === selectedId ? "selected" : ""}`} key={a.id} aria-pressed={a.id === selectedId} onClick={() => onSelect(a)}>
          <strong><MapPin size={16} />{a.parking.name}</strong><span>{a.parking.address}</span><span>Auto: {Math.ceil(a.drive.durationS / 60)} min · dalej: {metres(a.onward.distanceM)}, {Math.ceil(a.onward.durationS / 60)} min</span><small>Przesiadka: {a.transfer.status === "unknown" ? "brak pełnych danych" : "opisana w źródle"}</small>
        </button>)}
        {selected && <div className="parking-detail"><p>{selected.transfer.message}</p>
          <ul>{selected.warnings.map(w => <li key={w}>{w}</li>)}</ul>
          <dl><dt>Miejsca specjalne według źródła</dt><dd>{selected.parking.parking?.disabledSpaces || "Brak danych"}</dd><dt>Opłaty</dt><dd>{selected.parking.fee === "no" ? "Według źródła: bezpłatny" : selected.parking.fee === "yes" ? "Według źródła: płatny" : "Brak danych"}</dd><dt>Godziny</dt><dd>{selected.parking.openingHours || "Brak danych"}</dd></dl>
          <a href={selected.parking.sourceUrl} target="_blank" rel="noreferrer">Źródło danych o parkingu</a>
          <a className="button primary full" href={googleParkingUrl(selected)} target="_blank" rel="noreferrer" onClick={e => { if (!onDepart(selected)) e.preventDefault(); }}><Navigation size={19} />Jedź do parkingu</a>
          <p className="field-help">Otworzysz Google Maps. Trasę samochodową i czas obliczy ta aplikacja.</p>
          <button className="button secondary full" onClick={() => onContinue(selected)}>{departed ? "Kontynuuj od parkingu" : "Zaplanuj dalszy odcinek od parkingu"}</button>
        </div>}
      </>}
    </>}
  </section>;
}
