import {
  Accessibility,
  Armchair,
  Baby,
  Footprints,
  Ruler,
  Check,
  Info,
} from "lucide-react";
import ModelSearch from "./ModelSearch";
import DisplaySettings from "./DisplaySettings";
import { useState } from "react";
import type { Profile, Wheelchair } from "./types";
import { profileHasChanges } from "./profile-draft";
import "./profile-workflow.css";

export const defaultProfile: Profile = {
  mobility: "manual",
  widthCm: "",
  maxIncline: "6",
  maxKerbCm: "2",
  avoidUnpaved: false,
};
const modes = [
  { id: "manual", label: "Wózek ręczny", Icon: Accessibility },
  { id: "power", label: "Wózek elektryczny", Icon: Armchair },
  { id: "stroller", label: "Wózek dziecięcy", Icon: Baby },
  { id: "walking", label: "Pieszo / balkonik", Icon: Footprints },
] as const;
export default function ProfilePanel({
  profile,
  draft,
  onDraftChange,
  ownerKey,
  onSave,
  wheelchairs,
  storageMessage,
}: {
  profile: Profile;
  draft: Profile;
  onDraftChange: (value: Profile) => void;
  ownerKey: string | null;
  onSave: (p: Profile) => Promise<void>;
  storageMessage: string;
  wheelchairs: Wheelchair[];
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const dirty = profileHasChanges(draft, profile);

  function edit(p: Partial<Profile>) {
    if (saving) return;
    onDraftChange({ ...draft, ...p });
    setSaved(false);
    setError("");
  }
  return (
    <div className="profile-panel panel-body">
      <p className="eyebrow">POTRZEBY W PODRÓŻY</p>
      <h1>Ustawienia trasy</h1>
      <p className="muted">
        Podaj szerokość sprzętu i wysokość krawężników, które możesz pokonać.
        Te ustawienia możesz później zmienić.
      </p>
      <DisplaySettings />
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (saving) return;
          setSaving(true);
          setError("");
          try {
            await onSave(draft);
            setSaved(true);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setSaving(false);
          }
        }}
      >
        <p
          className={`profile-draft-status ${dirty || error ? "is-dirty" : ""}`}
          role="status"
        >
          {saving
            ? "Zapisujemy preferencje…"
            : dirty || error
              ? "Masz niezapisane zmiany. Przejście do innej zakładki ich nie usunie. Zapisz preferencje, aby użyć ich do planowania."
              : saved
                ? "Zapisano preferencje. Zmiana potrzeb wymaga ponownego wyznaczenia trasy."
                : storageMessage}
        </p>
        <fieldset className="plain-fieldset">
          <legend>Jak się poruszasz?</legend>
          <div className="mobility-grid">
            {modes.map(({ id, label, Icon }) => (
              <label
                key={id}
                className={`mobility-option ${draft.mobility === id ? "chosen" : ""}`}
              >
                <input
                  type="radio"
                  name="mobility"
                  value={id}
                  checked={draft.mobility === id}
                  disabled={saving}
                  onChange={() => edit({ mobility: id })}
                />
                <Icon size={25} aria-hidden="true" />
                <span>{label}</span>
                {draft.mobility === id && (
                  <Check size={15} className="option-check" />
                )}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="field-label" htmlFor="width">
          Szerokość z wystającymi elementami <span>opcjonalnie</span>
        </label>
        <div className="input-unit">
          <Ruler size={19} />
          <input
            id="width"
            type="number"
            min="35"
            max="150"
            step="0.1"
            inputMode="decimal"
            placeholder="np. 68"
            value={draft.widthCm}
            disabled={saving}
            onChange={(e) => edit({ widthCm: e.target.value })}
          />
          <span>cm</span>
        </div>
        <p className="field-help">
          Zmierz najszersze miejsce swojego wózka. Uwzględnij dłonie i wystające
          elementy.
        </p>
        <ModelSearch
          key={ownerKey ?? "guest"}
          models={wheelchairs}
          currentWidth={draft.widthCm}
          hasUnsavedChanges={dirty || !!error}
          disabled={saving}
          onWidth={(widthCm) => edit({ widthCm })}
        />
        <div className="two-fields">
          <div>
            <label className="field-label" htmlFor="incline">
              Maks. podjazd
            </label>
            <div className="input-unit">
              <input
                id="incline"
                type="number"
                min="0"
                max="15"
                step="1"
                required
                value={draft.maxIncline}
                disabled={saving}
                onChange={(e) => edit({ maxIncline: e.target.value })}
              />
              <span>%</span>
            </div>
          </div>
          <div>
            <label className="field-label" htmlFor="kerb">
              Maks. krawężnik
            </label>
            <div className="input-unit">
              <input
                id="kerb"
                type="number"
                min="0"
                max="15"
                step="0.5"
                required
                value={draft.maxKerbCm}
                disabled={saving}
                onChange={(e) => edit({ maxKerbCm: e.target.value })}
              />
              <span>cm</span>
            </div>
          </div>
        </div>
        <label className="check-row">
          <input
            type="checkbox"
            checked={draft.avoidUnpaved}
            disabled={saving}
            onChange={(e) => edit({ avoidUnpaved: e.target.checked })}
          />
          <span>
            <strong>Preferuję utwardzoną nawierzchnię</strong>
            <small>Filtr działa tam, gdzie mapa zawiera tę informację.</small>
          </span>
        </label>
        <div className="notice">
          <Info size={19} />
          <p>
            To Twoje preferencje, a nie potwierdzenie przejezdności. Wybór
            rodzaju wózka sam nie określa Twoich możliwości.
          </p>
        </div>
        {error && (
          <p className="error-box" role="alert">
            {error}
          </p>
        )}
        <button className="button primary full" type="submit" disabled={saving}>
          {saved && !dirty ? (
            <>
              <Check size={19} /> Zapisano preferencje
            </>
          ) : (
            "Zapisz preferencje"
          )}
        </button>
        <p className="privacy-note">
          Szkic pozostaje w tej karcie do zapisania lub zmiany konta.
          Odświeżenie strony usuwa niezapisane zmiany.
        </p>
      </form>
    </div>
  );
}
