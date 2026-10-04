import { useId, useState } from "react";
import {
  PASSPORT_CHOICE_OPTIONS,
  PASSPORT_FIELD_DEFINITIONS,
  type PassportCoordinates,
  type PassportFieldInput,
  type PassportInputFields,
} from "../../../shared/place-passports.mjs";

export function CoordinatesEditor({
  value,
  onChange,
  label,
}: {
  value: PassportCoordinates | null;
  onChange: (coordinates: PassportCoordinates | null) => void;
  label: string;
}) {
  const prefix = useId();
  const [longitude, setLongitude] = useState(value ? String(value[0]) : "");
  const [latitude, setLatitude] = useState(value ? String(value[1]) : "");
  function update(lon: string, lat: string) {
    setLongitude(lon);
    setLatitude(lat);
    onChange(
      lon.trim() &&
        lat.trim() &&
        Number.isFinite(Number(lon)) &&
        Number.isFinite(Number(lat))
        ? [Number(lon), Number(lat)]
        : null,
    );
  }
  return (
    <fieldset className="passport-coordinate-fields">
      <legend>{label}</legend>
      <div className="passport-two-columns">
        <label htmlFor={`${prefix}-lat`}>
          Szerokość geograficzna
          <input
            id={`${prefix}-lat`}
            type="number"
            inputMode="decimal"
            min="-90"
            max="90"
            step="any"
            placeholder="np. 50.061"
            value={latitude}
            required={Boolean(longitude)}
            onChange={(event) => update(longitude, event.target.value)}
          />
        </label>
        <label htmlFor={`${prefix}-lon`}>
          Długość geograficzna
          <input
            id={`${prefix}-lon`}
            type="number"
            inputMode="decimal"
            min="-180"
            max="180"
            step="any"
            placeholder="np. 19.938"
            value={longitude}
            required={Boolean(latitude)}
            onChange={(event) => update(event.target.value, latitude)}
          />
        </label>
      </div>
      <p className="passport-caption">
        Współrzędne można odczytać z mapy. Podaj rzeczywisty punkt; położenie
        wejścia może różnić się od środka budynku.
      </p>
    </fieldset>
  );
}

export default function PassportFields({
  fields,
  onChange,
}: {
  fields: PassportInputFields;
  onChange: (fields: PassportInputFields) => void;
}) {
  const prefix = useId();
  function update(
    key: keyof PassportInputFields,
    patch: Partial<PassportFieldInput>,
  ) {
    onChange({ ...fields, [key]: { ...fields[key], ...patch } });
  }
  return (
    <div className="passport-edit-facts">
      {PASSPORT_FIELD_DEFINITIONS.map((definition) => {
        const { key, label, type, unit, min, max } = definition;
        const field = fields[key] ?? { value: null };
        const id = `${prefix}-${key}`;
        return (
          <div className="passport-edit-fact" key={key}>
            <label className="field-label" htmlFor={id}>
              {label}
              {unit ? ` (${unit})` : ""}
            </label>
            {type === "choice" ? (
              <select
                id={id}
                value={field.value ?? ""}
                onChange={(event) =>
                  update(key, { value: event.target.value || null })
                }
              >
                {PASSPORT_CHOICE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : type === "number" ? (
              <input
                id={id}
                type="number"
                inputMode="decimal"
                min={min}
                max={max}
                step="0.1"
                placeholder="Nie wiem"
                value={field.value ?? ""}
                onChange={(event) =>
                  update(key, {
                    value:
                      event.target.value === ""
                        ? null
                        : Number(event.target.value),
                  })
                }
              />
            ) : (
              <textarea
                id={id}
                rows={key === "entranceNotes" ? 3 : 2}
                maxLength={1000}
                placeholder="Nie wiem"
                value={field.value ?? ""}
                onChange={(event) =>
                  update(key, { value: event.target.value || null })
                }
              />
            )}
            <details className="passport-source-inputs">
              <summary>Źródło i data: {label.toLocaleLowerCase("pl")}</summary>
              <label htmlFor={`${id}-source`}>
                Źródło tej informacji
                <input
                  id={`${id}-source`}
                  maxLength={200}
                  placeholder="np. własny pomiar, informacja recepcji"
                  value={field.sourceLabel ?? ""}
                  onChange={(event) =>
                    update(key, { sourceLabel: event.target.value || null })
                  }
                />
              </label>
              <label htmlFor={`${id}-url`}>
                Adres źródła (opcjonalny)
                <input
                  id={`${id}-url`}
                  type="url"
                  maxLength={2000}
                  placeholder="https://…"
                  value={field.sourceUrl ?? ""}
                  onChange={(event) =>
                    update(key, { sourceUrl: event.target.value || null })
                  }
                />
              </label>
              <label htmlFor={`${id}-observed`}>
                Data obserwacji lub pomiaru (opcjonalna)
                <input
                  id={`${id}-observed`}
                  type="date"
                  value={field.observedAt?.slice(0, 10) ?? ""}
                  onChange={(event) =>
                    update(key, { observedAt: event.target.value || null })
                  }
                />
              </label>
              <p className="passport-caption">
                Pozostaw pustą, jeżeli nie znasz daty sprawdzenia. Datę dodania
                wpisu zapisujemy osobno.
              </p>
            </details>
          </div>
        );
      })}
    </div>
  );
}
