import { useEffect, useState } from "react";
import { api, dateLabel } from "./api";
import type { Place } from "./types";
import GooglePlaceCard from "./GooglePlaceCard";
const labels: Record<string, string> = { entrance: "Wejście", threshold: "Próg", steps: "Schody", ramp: "Podjazd", lift: "Winda", width: "Szerokość", surface: "Nawierzchnia", toilet: "Toaleta", rest: "Odpoczynek", assistance: "Pomoc na miejscu" };
interface Job { id: string; placeId: string; status: string; message: string; result: null | { checkedAt: string; facts: { category: string; value: string; quote: string; sourceUrl: string }[]; missing: string[]; sources: { url: string; fetchedAt: string | null }[]; notes: string; notice: string; errors?: { url: string; reason: string }[] } }
export default function PlaceResearch({ place }: { place: Place }) {
  const [job, setJob] = useState<Job | null>(null), [error, setError] = useState(""), [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true, timer: ReturnType<typeof setTimeout>;
    setJob(null); setError("");
    const poll = async (id: string) => {
      try { const next = await api<Job>(`/place-research/${id}`); if (!active) return; setJob(next); if (next.status === "searching") timer = setTimeout(() => void poll(id), 2000); }
      catch (e) { if (active) setError((e as Error).message); }
    };
    // A short delay avoids paying for transient selections during rapid map browsing.
    timer = setTimeout(() => { void api<Job>(`/places/${encodeURIComponent(place.id)}/research`, {}).then(next => {
      if (!active) return; setJob(next); if (next.status === "searching") timer = setTimeout(() => void poll(next.id), 2000);
    }).catch(e => { if (active) setError(e.message); }); }, 700);
    return () => { active = false; clearTimeout(timer); };
  }, [place.id, retry]);
  const result = job?.result;
  return <section className="place-research" aria-label="Informacje ze strony obiektu">
    <h2>Co podaje strona obiektu?</h2>
    <p role="status">{error || job?.message || "Przygotowujemy wyszukiwanie strony obiektu…"}</p>
    {job?.status === "searching" && <p className="muted">Sprawdzamy nazwę i lokalizację, a następnie informacje o wejściu, windzie, toalecie i innych warunkach. Możesz korzystać z mapy podczas wyszukiwania.</p>}
    {result && <>
      <p className="source-badge">Odczyt automatyczny · {dateLabel(result.checkedAt)} · do sprawdzenia</p>
      {result.facts.map((fact, i) => <article className="web-fact" key={i}><strong>{labels[fact.category]}</strong><p>{fact.value}</p><details><summary>Cytat i źródło</summary><blockquote>{fact.quote}</blockquote><a href={fact.sourceUrl} target="_blank" rel="noreferrer">Otwórz stronę źródłową</a></details></article>)}
      {result.notes && <p>{result.notes}</p>}
      <p className="evidence-unknown">Brak potwierdzonych danych: {result.missing.map(c => labels[c]).join(", ") || "wszystkie kategorie mają opis; sprawdź jego szczegóły"}.</p>
      <p className="muted">{result.notice}</p>
      {!!result.errors?.length && <details><summary>Ograniczenia odczytu ({result.errors.length})</summary>{result.errors.map((e, i) => <p key={i}><a href={e.url} target="_blank" rel="noreferrer">Źródło</a>: {e.reason}</p>)}</details>}
      {!result.facts.length && result.sources.map(s => <p key={s.url}><a href={s.url} target="_blank" rel="noreferrer">Sprawdź znalezioną stronę</a></p>)}
    </>}
    {(error || job?.status === "failed" || job?.status === "not_found") && <button className="text-button" onClick={() => setRetry(v => v + 1)}>Spróbuj ponownie</button>}
    <GooglePlaceCard place={place} />
  </section>;
}
