import { useEffect, useRef } from "react";
import { Accessibility, Armchair, SlidersHorizontal, X } from "lucide-react";
import {
  DEFAULT_PLACE_FILTERS,
  type PlaceFilters,
} from "../../shared/place-filters.mjs";
import type { Category, CommunityObservation } from "./types";
import "./map-filters.css";

export interface MapLayers {
  places: boolean;
  reports: boolean;
  rest_place: boolean;
  step_free_entrance: boolean;
  lift_working: boolean;
}

export const DEFAULT_MAP_LAYERS: MapLayers = {
  places: true,
  reports: true,
  rest_place: true,
  step_free_entrance: true,
  lift_working: true,
};

const observationLayers: {
  key: CommunityObservation["type"];
  label: string;
}[] = [
  { key: "rest_place", label: "Miejsca odpoczynku" },
  { key: "step_free_entrance", label: "Wejścia bez schodów" },
  { key: "lift_working", label: "Działające windy" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  category: Category;
  onCategory: (category: Category) => void;
  filters: PlaceFilters;
  onFilters: (filters: PlaceFilters) => void;
  layers: MapLayers;
  onLayers: (layers: MapLayers) => void;
  onReset: () => void;
  onPreset: (category: Category, filters: PlaceFilters) => void;
  total: number;
  loading: boolean;
  loadError: boolean;
}

export default function MapFilters({
  open,
  onClose,
  category,
  onCategory,
  filters,
  onFilters,
  layers,
  onLayers,
  onReset,
  onPreset,
  total,
  loading,
  loadError,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  function toggle(
    key:
        | "accessibleToilet"
        | "hideUnknown"
        | "stepFree"
      | "freeOnly"
      | "publicOnly"
      | "open247"
      | "backrest"
      | "armrest",
    checked: boolean,
  ) {
    onFilters({ ...filters, [key]: checked });
  }
  return (
    <dialog
      ref={dialog}
      className="map-filters-dialog"
      aria-labelledby="map-filters-title"
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]',
          ),
        ).filter((element) => element.getClientRects().length > 0);
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="map-filters-header">
        <div>
          <p className="eyebrow">DOPASUJ WIDOK</p>
          <h2 id="map-filters-title">
            <SlidersHorizontal size={22} /> Filtry mapy
          </h2>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Zamknij filtry"
          onClick={onClose}
        >
          <X />
        </button>
      </div>
      <div className="map-filters-body">
        <div className="map-filter-presets" aria-label="Szybkie filtry">
          <button
            type="button"
            onClick={() =>
              onPreset("toilet", {
                ...DEFAULT_PLACE_FILTERS,
                accessibleToilet: true,
              })
            }
          >
            <Accessibility size={20} /> Dostępne toalety
          </button>
          <button
            type="button"
            onClick={() =>
              onPreset("outdoors", {
                ...DEFAULT_PLACE_FILTERS,
                placeType: "bench",
                backrest: true,
              })
            }
          >
            <Armchair size={20} /> Ławki z oparciem
          </button>
        </div>
        <fieldset>
          <legend>Miejsca</legend>
          <label className="map-filter-field">
            Rodzaj miejsca
            <select
              value={category}
              onChange={(event) => onCategory(event.target.value as Category)}
            >
              <option value="all">Wszystkie miejsca</option>
              <option value="culture">Kultura</option>
              <option value="food">Jedzenie</option>
              <option value="toilet">Toalety</option>
              <option value="outdoors">Na zewnątrz</option>
              <option value="accommodation">Noclegi</option>
              <option value="services">Usługi</option>
              <option value="transport">Transport</option>
            </select>
          </label>
          <label className="map-filter-field">
            Dostępność dla wózka
            <select
              value={filters.wheelchair}
              onChange={(event) =>
                onFilters({
                  ...filters,
                  wheelchair: event.target.value as PlaceFilters["wheelchair"],
                })
              }
            >
              <option value="all">Dowolna, także bez danych</option>
              <option value="yes">Dostępne według źródła</option>
              <option value="limited">Częściowo dostępne</option>
              <option value="no">Niedostępne według źródła</option>
              <option value="unknown">Brak danych o dostępności</option>
            </select>
          </label>
          <div className="map-filter-checks">
            <label><input type="checkbox" checked={filters.hideUnknown} onChange={event => toggle("hideUnknown", event.target.checked)} />Ukryj miejsca bez informacji o dostępności</label>
            <label><input type="checkbox" checked={filters.stepFree} onChange={event => toggle("stepFree", event.target.checked)} />Wejście bez stopni według źródła</label>
            <label>
              <input
                type="checkbox"
                checked={filters.accessibleToilet}
                onChange={(event) =>
                  toggle("accessibleToilet", event.target.checked)
                }
              />
              Toaleta dostępna dla wózka
            </label>
            <label>
              <input
                type="checkbox"
                checked={filters.freeOnly}
                onChange={(event) => toggle("freeOnly", event.target.checked)}
              />
              Bezpłatne
            </label>
            <label>
              <input
                type="checkbox"
                checked={filters.publicOnly}
                onChange={(event) => toggle("publicOnly", event.target.checked)}
              />
              Dostęp ogólny
            </label>
            <label>
              <input
                type="checkbox"
                checked={filters.open247}
                onChange={(event) => toggle("open247", event.target.checked)}
              />
              Całodobowe
            </label>
          </div>
          <p className="map-filter-help">
            Łączymy zaznaczone warunki. Brak informacji nie spełnia filtra.
            „Całodobowe” oznacza godziny 24/7 w źródle, bez potwierdzenia
            bieżącego otwarcia.
          </p>
          <details
            className="map-filter-benches"
            open={
              filters.placeType === "bench" ||
              filters.backrest ||
              filters.armrest
            }
          >
            <summary>Ławki i odpoczynek</summary>
            <div className="map-filter-checks">
              <label>
                <input
                  type="checkbox"
                  checked={filters.placeType === "bench"}
                  onChange={(event) =>
                    onFilters({
                      ...filters,
                      placeType: event.target.checked ? "bench" : "all",
                    })
                  }
                />
                Tylko ławki
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={filters.backrest}
                  onChange={(event) => toggle("backrest", event.target.checked)}
                />
                Z oparciem
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={filters.armrest}
                  onChange={(event) => toggle("armrest", event.target.checked)}
                />
                Z podłokietnikami
              </label>
            </div>
          </details>
        </fieldset>
        <fieldset>
          <legend>Warstwy na mapie</legend>
          <div className="map-filter-checks">
            <label>
              <input
                type="checkbox"
                checked={layers.places}
                onChange={(event) =>
                  onLayers({ ...layers, places: event.target.checked })
                }
              />
              Miejsca na mapie
            </label>
            <label>
              <input
                type="checkbox"
                checked={layers.reports}
                onChange={(event) =>
                  onLayers({ ...layers, reports: event.target.checked })
                }
              />
              Bariery i utrudnienia
            </label>
            {observationLayers.map(({ key, label }) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={layers[key]}
                  onChange={(event) =>
                    onLayers({ ...layers, [key]: event.target.checked })
                  }
                />
                {label}
              </label>
            ))}
          </div>
          <p className="map-filter-help">
            Zgłoszenia użytkowników są osobną warstwą. Pokazujemy aktywne,
            niewygasłe obserwacje. Ukrycie bariery na mapie nie wyłącza jej
            uwzględniania przy wyznaczaniu trasy.
          </p>
        </fieldset>
        <p className="map-filter-help">
          Dostępność według OpenStreetMap jest deklaracją, a nie audytem
          wejścia. Winda lub platforma mogą wymagać pomocy. Sprawdź szczegóły
          miejsca przed wyjściem.
        </p>
      </div>
      <div className="map-filters-footer">
        <p role="status">
          {loading
            ? "Sprawdzamy miejsca…"
            : `${total} miejsc${loadError ? " w zapisanej części katalogu" : " spełnia filtry"}`}
        </p>
        <div>
          <button type="button" className="text-button" onClick={onReset}>
            Wyczyść filtry
          </button>
          <button type="button" className="button primary" onClick={onClose}>
            Pokaż wyniki
          </button>
        </div>
      </div>
    </dialog>
  );
}
