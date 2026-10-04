import { Camera, ExternalLink } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { api, metres } from "./api";
import { streetViewPoint, streetViewUrls } from "./street-view";
import type { Route } from "./types";
import "./street-view.css";

export default function RouteSteps({
  route,
  online,
}: {
  route: Route;
  online: boolean;
}) {
  const id = useId();
  const [selection, setSelection] = useState<{
    route: Route;
    index: number;
  } | null>(null);
  const selectedIndex = selection?.route === route ? selection.index : null;
  const [browserKey, setBrowserKey] = useState<string | null>();
  const [frameFailed, setFrameFailed] = useState(false);
  const needsKey = selectedIndex !== null && online && browserKey === undefined;

  useEffect(() => {
    if (!needsKey) return;
    let current = true;
    // Fetch once for the open route, only when a panorama is requested.
    void api<{
      googlePlacesUi?: { enabled: boolean; browserKey: string | null };
    }>("/integrations/maps")
      .then((config) => {
        if (current)
          setBrowserKey(
            config.googlePlacesUi?.enabled
              ? config.googlePlacesUi.browserKey
              : null,
          );
      })
      .catch(() => {
        if (current) setBrowserKey(null);
      });
    return () => {
      current = false;
    };
  }, [needsKey]);

  return (
    <>
      <p className="field-help street-view-intro">
        Podgląd Street View wysyła wybrany punkt trasy do Google.
      </p>
      <ol className="route-steps">
        {route.steps.map((step, index) => {
          const point = streetViewPoint(route, step);
          const open = selectedIndex === index;
          const urls = point ? streetViewUrls(point, browserKey) : null;
          const previewId = `${id}-street-view-${index}`;
          return (
            <li key={index}>
              <span className="step-number">{index + 1}</span>
              <div className="route-step-body">
                <p>{step.instruction}</p>
                <span>{metres(step.distanceM)}</span>
                {point && urls ? (
                  <>
                    <button
                      type="button"
                      className="text-button street-view-toggle"
                      aria-label={`${open ? "Ukryj" : "Pokaż"} Street View dla kroku ${index + 1}`}
                      aria-expanded={open}
                      aria-controls={previewId}
                      onClick={() => {
                        setFrameFailed(false);
                        setSelection(open ? null : { route, index });
                      }}
                    >
                      <Camera size={16} aria-hidden="true" />
                      {open ? "Ukryj Street View" : "Zobacz w Street View"}
                    </button>
                    <div
                      id={previewId}
                      hidden={!open}
                      className="street-view-preview"
                    >
                      {open && (
                        <>
                          {!online ? (
                            <p role="status">
                              Street View wymaga internetu. Instrukcja trasy
                              pozostaje dostępna.
                            </p>
                          ) : browserKey === undefined ? (
                            <p role="status">Otwieramy podgląd Street View…</p>
                          ) : urls.embed && !frameFailed ? (
                            <iframe
                              src={urls.embed}
                              title={`Street View, krok ${index + 1}: ${step.instruction}`}
                              width="400"
                              height="240"
                              loading="lazy"
                              allowFullScreen
                              referrerPolicy="strict-origin-when-cross-origin"
                              onError={() => setFrameFailed(true)}
                            />
                          ) : (
                            <p role="status">
                              Podgląd w aplikacji jest chwilowo niedostępny.
                              Możesz sprawdzić ten punkt w Google Maps.
                            </p>
                          )}
                          <p className="street-view-note">
                            Trasę wyznacza openrouteservice. Zdjęcia: Google
                            Street View. Datę zdjęć sprawdź w panoramie. Widok
                            może przedstawiać sąsiedni punkt lub wnętrze i nie
                            potwierdza aktualnej przejezdności.
                          </p>
                          <a
                            href={urls.external}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="street-view-link"
                          >
                            Otwórz Street View w Google Maps{" "}
                            <ExternalLink size={14} aria-hidden="true" />
                            <span className="sr-only"> (nowa karta)</span>
                          </a>
                          {online && (browserKey === null || frameFailed) && (
                            <button
                              type="button"
                              className="text-button"
                              onClick={() => {
                                setBrowserKey(undefined);
                                setFrameFailed(false);
                              }}
                            >
                              Spróbuj ponownie
                            </button>
                          )}
                          <p className="street-view-help">
                            Jeśli nie ma zdjęć lub podgląd nie działa,
                            skorzystaj z linku powyżej.
                          </p>
                          <p className="street-view-help">
                            Podgląd podlega{" "}
                            <a
                              href="https://www.google.com/help/terms_maps/"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              warunkom Google Maps
                            </a>{" "}
                            i{" "}
                            <a
                              href="https://policies.google.com/privacy"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              polityce prywatności Google
                            </a>
                            .
                          </p>
                        </>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="street-view-help">
                    Brak współrzędnych tego kroku do podglądu Street View.
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}
