import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { Place } from "./types";
let loader: Promise<void> | null = null;
function loadGoogle(key: string) {
  if (!loader) loader = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&v=weekly&language=pl&region=PL`;
    script.async = true;
    script.onload = () => resolve(); script.onerror = () => { loader = null; script.remove(); reject(new Error("Nie udało się wczytać karty Google.")); };
    document.head.append(script);
  });
  return loader;
}
export default function GooglePlaceCard({ place }: { place: Place }) {
  const [key, setKey] = useState<string | null>(null), [open, setOpen] = useState(false), [error, setError] = useState("");
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => { let active = true; void api<{ googlePlacesUi: { enabled: boolean; browserKey: string | null } }>("/integrations/maps").then(c => { if (active && c.googlePlacesUi.enabled) setKey(c.googlePlacesUi.browserKey); }).catch(() => {}); return () => { active = false; }; }, []);
  useEffect(() => {
    if (!open || !key) return;
    let active = true; const mount = host.current; setError("");
    void loadGoogle(key).then(async () => {
      const googleApi = (window as unknown as { google: { maps: { importLibrary: (name: string) => Promise<unknown> } } }).google;
      await googleApi.maps.importLibrary("places");
      if (!active || !mount) return;
      const search = document.createElement("gmp-place-search"); search.setAttribute("selectable", "");
      const request = document.createElement("gmp-place-text-search-request");
      request.setAttribute("text-query", `${place.name} ${place.address} Kraków`); request.setAttribute("max-result-count", "3");
      search.append(request, document.createElement("gmp-place-standard-content"));
      const details = document.createElement("gmp-place-details"); details.hidden = true;
      const detailRequest = document.createElement("gmp-place-details-place-request");
      const config = document.createElement("gmp-place-content-config");
      for (const tag of ["gmp-place-address", "gmp-place-accessible-entrance-icon", "gmp-place-feature-list", "gmp-place-website", "gmp-place-phone-number"]) config.append(document.createElement(tag));
      details.append(detailRequest, config);
      search.addEventListener("gmp-select", e => { const id = (e as Event & { place?: { id?: string } }).place?.id; if (id) { detailRequest.setAttribute("place", id); details.hidden = false; } });
      for (const element of [search, details]) element.addEventListener("gmp-error", () => { if (active) setError("Google nie udostępniło informacji. Otwórz link do Map Google."); });
      mount.replaceChildren(search, details);
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; mount?.replaceChildren(); };
  }, [key, open, place.id, place.name, place.address]);
  return <div className="google-place-card">
    {key && <button className="text-button" onClick={() => setOpen(v => !v)} aria-expanded={open}>Informacje w Google</button>}
    {open && <><p>Wybierz pasujący obiekt i sprawdź adres. Dane Google mogą opisywać inne wejście lub oddział.</p><div ref={host} />{error && <p role="status">{error}</p>}</>}
    <a target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.name} ${place.address} Kraków`)}`}>Sprawdź obiekt w Google Maps</a>
  </div>;
}
