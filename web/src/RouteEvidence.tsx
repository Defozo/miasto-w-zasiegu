import { dateLabel, metres } from "./api";
import type { Route, RouteFact } from "./types";
export default function RouteEvidence({ route, onFocus }: { route: Route; onFocus?: (fact: RouteFact) => void }) {
  const data = route.accessibility;
  if (!data) return <p className="muted">Szczegółowe dane tej zapisanej trasy nie są dostępne. Wyznacz ją ponownie.</p>;
  return <section className="route-evidence" aria-label="Bariery i warunki na trasie">
    <h3>Po drodze: bariery i warunki</h3>
    <p>{data.note}</p>
    <p>{data.coverage.routeMatched ? `Dane o nawierzchni: ${metres(data.coverage.knownSurfaceM)}. Brak danych: ${metres(data.coverage.unknownSurfaceM)}.` : "Nie udało się powiązać odcinków z danymi źródłowymi. Nie znamy kompletności opisu trasy."}</p>
    {!data.events.length && <p>Nie znaleziono szczegółowych obserwacji przy tej trasie. Nie oznacza to, że nie ma na niej barier.</p>}
    <ol className="route-facts">{data.events.map((fact, i) => <li key={`${fact.id}-${i}`}>
      <details><summary><strong>{metres(fact.distanceAlongM)} · {fact.title}</strong>{fact.applicability === "nearby" ? " · w pobliżu" : ""}</summary>
        <ul>{fact.details.map((d, j) => <li key={j}>{d}</li>)}</ul>
        {fact.uncertainties.map((d, j) => <p className="evidence-unknown" key={j}>{d}</p>)}
        <p className="muted">{fact.sourceLabel}{fact.updatedAt ? ` · wpis z ${dateLabel(fact.updatedAt)}` : " · data nieznana"}. Data wpisu nie jest datą audytu.</p>
        <div className="evidence-actions">{onFocus && <button type="button" className="text-button" onClick={() => onFocus(fact)}>Pokaż na mapie</button>}{fact.sourceUrl && <a href={fact.sourceUrl} target="_blank" rel="noreferrer">Źródło</a>}</div>
      </details>
    </li>)}</ol>
    {data.truncated && <p>Pokazano pierwsze {data.events.length} z {data.totalEvents} opisów. Przybliż mapę, aby zobaczyć pozostałe dane.</p>}
  </section>;
}
