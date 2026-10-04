import { useEffect, useRef, useState } from "react";
import type { Coordinates, Route } from "./types";
import { metres } from "./api";

export function nearestRoutePosition(point: Coordinates, route: Coordinates[]) {
  const x = Math.cos(point[1] * Math.PI / 180) * 111320, y = 111320;
  let best = { distance: Infinity, index: 0 };
  for (let i = 0; i < route.length - 1; i++) {
    const a = [(route[i][0] - point[0]) * x, (route[i][1] - point[1]) * y];
    const b = [(route[i + 1][0] - point[0]) * x, (route[i + 1][1] - point[1]) * y];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dy) / (dx * dx + dy * dy || 1)));
    const distance = Math.hypot(a[0] + t * dx, a[1] + t * dy);
    if (distance < best.distance) best = { distance, index: i };
  }
  return best;
}
export default function ForegroundGuidance({ route, onPosition }: { route: Route; onPosition: (p: Coordinates | null) => void }) {
  const [active, setActive] = useState(false), [message, setMessage] = useState("");
  const [step, setStep] = useState<number | null>(null);
  const onPositionRef = useRef(onPosition); onPositionRef.current = onPosition;
  useEffect(() => {
    if (!active) return;
    if (!navigator.geolocation) { setMessage("Ta przeglądarka nie udostępnia lokalizacji."); setActive(false); return; }
    let last = 0;
    const watch = navigator.geolocation.watchPosition(position => {
      last = position.timestamp;
      if (Date.now() - last > 15000 || position.coords.accuracy > 35) {
        setStep(null); onPositionRef.current(null); setMessage("Pozycja jest zbyt niedokładna. Poczekaj na aktualny sygnał GPS."); return;
      }
      const point: Coordinates = [position.coords.longitude, position.coords.latitude]; onPositionRef.current(point);
      const nearest = nearestRoutePosition(point, route.geometry.coordinates);
      if (nearest.distance > 45) { setStep(null); setMessage(`Jesteś około ${metres(nearest.distance)} od trasy. Sprawdź pozycję i zaplanuj trasę ponownie.`); return; }
      const index = route.steps.findIndex(s => s.wayPoints[1] > nearest.index);
      setStep(index < 0 ? route.steps.length - 1 : index); setMessage("Pozycja na trasie. Obserwuj warunki wokół siebie.");
    }, error => { setStep(null); onPositionRef.current(null); setMessage(error.code === 1 ? "Lokalizacja nie została udostępniona. Nadal możesz przeglądać plan." : "Nie otrzymaliśmy aktualnej pozycji. Spróbuj ponownie."); setActive(false); }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
    const clock = setInterval(() => { if (last && Date.now() - last > 15000) { setStep(null); onPositionRef.current(null); setMessage("Pozycja jest nieaktualna. Czekamy na GPS."); } }, 3000);
    function visibility() { if (document.hidden) { setActive(false); setStep(null); setMessage("Widok został ukryty. Wznów prowadzenie, gdy wrócisz do aplikacji."); } }
    document.addEventListener("visibilitychange", visibility);
    return () => { navigator.geolocation.clearWatch(watch); clearInterval(clock); document.removeEventListener("visibilitychange", visibility); onPositionRef.current(null); };
  }, [active, route]);
  return <section className="foreground-guidance" aria-label="Prowadzenie w przeglądarce">
    <button className="button primary full" onClick={() => { setStep(null); setMessage(active ? "Prowadzenie zakończone." : "Czekamy na aktualną pozycję GPS…"); setActive(!active); }}>{active ? "Zakończ prowadzenie" : "Rozpocznij prowadzenie"}</button>
    <p className="field-help">Pozycja i instrukcje działają, gdy ta strona jest widoczna. Po zablokowaniu ekranu lub przełączeniu aplikacji prowadzenie zostaje wstrzymane.</p>
    <div role="status" aria-live="polite">{message}{active && step !== null && <p><strong>{route.steps[step]?.instruction}</strong><br />Manewr {step + 1} z {route.steps.length}</p>}</div>
  </section>;
}
