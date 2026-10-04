import { useEffect, useState } from "react";
import { Check, Contrast, Eye, Type, Waves } from "lucide-react";
import {
  displayDefaults,
  readDisplayPreferences,
  saveDisplayPreferences,
  type DisplayPreferences,
} from "./display-preferences";
export default function DisplaySettings() {
  const [settings, setSettings] = useState(readDisplayPreferences),
    [message, setMessage] = useState("");
  useEffect(() => {
    const update = (e: Event) =>
      setSettings(
        (e as CustomEvent<DisplayPreferences>).detail ||
          readDisplayPreferences(),
      );
    window.addEventListener("przejscie-display-change", update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener("przejscie-display-change", update);
      window.removeEventListener("storage", update);
    };
  }, []);
  function change(value: DisplayPreferences) {
    setSettings(value);
    setMessage(
      saveDisplayPreferences(value)
        ? "Widok dopasowany. Zapamiętamy go na tym urządzeniu."
        : "Widok dopasowany na tę sesję. Przeglądarka nie pozwala zapisać ustawień.",
    );
  }
  return (
    <details className="display-settings">
      <summary>
        <Eye size={19} />
        Wygląd i wygoda
      </summary>
      <p>
        Dostosuj widok do siebie. Zmiany działają od razu i nie wpływają na
        wybór trasy.
      </p>
      <div className="display-options">
        {(
          [
            {
              key: "largeText",
              label: "Większy tekst",
              description: "Czytelniejsze opisy, formularze i przyciski.",
              Icon: Type,
            },
            {
              key: "highContrast",
              label: "Mocniejszy kontrast",
              description: "Wyraźniejsze teksty i granice formularzy.",
              Icon: Contrast,
            },
            {
              key: "reduceMotion",
              label: "Mniej ruchu",
              description: "Spokojna mapa i gra bez animacji.",
              Icon: Waves,
            },
          ] as const
        ).map(({ key, label, description, Icon }) => (
          <button
            type="button"
            key={key}
            aria-pressed={settings[key]}
            className="display-option"
            onClick={() => change({ ...settings, [key]: !settings[key] })}
          >
            <Icon size={22} />
            <span>
              <strong>{label}</strong>
              <small>{description}</small>
            </span>
            <span className="display-toggle" aria-hidden="true">
              {settings[key] && <Check size={17} />}
            </span>
          </button>
        ))}
      </div>
      <p className="field-help">
        Ustawienia ograniczenia ruchu w telefonie lub komputerze również są
        respektowane.
      </p>
      {Object.values(settings).some(Boolean) && (
        <button
          type="button"
          className="text-button"
          onClick={() => change(displayDefaults)}
        >
          Przywróć standardowy widok
        </button>
      )}
      {message && (
        <p className="field-help" role="status">
          {message}
        </p>
      )}
    </details>
  );
}
