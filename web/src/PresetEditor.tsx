import { useEffect, useRef, useState } from "react";
import { Accessibility, Armchair, Baby, Camera, Check, Footprints, Ruler, Search, ArrowLeft } from "lucide-react";
import type { EquipmentJob, EquipmentKind, MobilityPreset, Wheelchair } from "./types";
import type { ResearchController } from "./useEquipmentResearch";
import { readLocal, writeLocal } from "./api";
import EquipmentChat from "./EquipmentChat";

const WIDTH_ERROR = "Podaj szerokość od 30 do 200 cm lub pozostaw puste pole.";

export const mobilityChoices = [
  { id: "manual", label: "Wózek manualny", Icon: Accessibility },
  { id: "power", label: "Wózek elektryczny", Icon: Armchair },
  { id: "walker", label: "Balkonik", Icon: Accessibility },
  { id: "stroller", label: "Wózek dziecięcy", Icon: Baby },
  { id: "walking", label: "Pieszo", Icon: Footprints },
] as const;
export const neutralProfile = { mobility: "walking" as const, widthCm: "", maxIncline: "6", maxKerbCm: "2", avoidUnpaved: false };
export function newPreset(): MobilityPreset {
  return { id: crypto.randomUUID(), name: "Mój zestaw", kind: "walking", profile: { ...neutralProfile }, equipment: null };
}
export default function PresetEditor({ initial, usesCar: initialCar, ownerId, onboarding, models, research, onSave, onClose }: {
  initial: MobilityPreset; usesCar: boolean; ownerId: string | null; onboarding?: boolean; models: Wheelchair[]; research: ResearchController;
  onSave: (preset: MobilityPreset, car: boolean) => Promise<void>; onClose: () => void;
}) {
  const key = `przejscie-preset-draft-${ownerId || "guest"}-${initial.id}`;
  const [draft, setDraft] = useState(() => readLocal<MobilityPreset>(key, initial));
  const [step, setStep] = useState(onboarding ? 0 : 1);
  const [chosen, setChosen] = useState(!onboarding);
  const [car, setCar] = useState(initialCar);
  const [method, setMethod] = useState<"name" | "photo" | "manual">("name");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const widthError = error === WIDTH_ERROR;
  const heading = useRef<HTMLHeadingElement>(null);
  const widthInput = useRef<HTMLInputElement>(null);
  const widthField = useRef<HTMLDivElement>(null);
  const documentationWidth = useRef<string | null>(null);
  const job = research.presetId === draft.id ? research.job : null;
  useEffect(() => { writeLocal(key, draft); }, [key, draft]);
  useEffect(() => { heading.current?.focus(); }, [step]);
  function choose(kind: EquipmentKind) {
    documentationWidth.current = null;
    setError(current => current === WIDTH_ERROR ? "" : current);
    if (kind !== draft.kind && research.presetId === draft.id) research.dismiss();
    setChosen(true); setSuccess(""); setMethod("name"); setDraft(d => ({ ...d, kind, name: mobilityChoices.find(m => m.id === kind)!.label,
      profile: { ...neutralProfile, mobility: kind === "walker" ? "walking" : kind }, equipment: null }));
  }
  function width(value: string) {
    documentationWidth.current = null;
    setError(current => current === WIDTH_ERROR ? "" : current);
    setDraft(d => ({ ...d, profile: { ...d.profile, widthCm: value }, equipment: { ...(d.equipment || {name: "Własne pomiary", manufacturer: ""}),
      parameters: [...(d.equipment?.parameters || []).filter(p => p.label !== "Mój pomiar szerokości"),
        ...(value ? [{ label: "Mój pomiar szerokości", value: `${value} cm`, sourceUrl: "", quote: "", origin: "measurement" as const, checkedAt: new Date().toISOString() }] : [])] } }));
  }
  function applyEquipment(result: NonNullable<EquipmentJob["equipment"]>, kind: EquipmentKind) {
    const keepWidth = Boolean(draft.profile.widthCm && draft.profile.widthCm !== documentationWidth.current);
    const nextWidth = keepWidth ? draft.profile.widthCm : result.widthCm ? String(result.widthCm) : "";
    if (nextWidth !== draft.profile.widthCm) setError(current => current === WIDTH_ERROR ? "" : current);
    documentationWidth.current = keepWidth ? null : nextWidth;
    setDraft(d => ({ ...d, kind,
      name: d.name === mobilityChoices.find(m => m.id === d.kind)?.label ? mobilityChoices.find(m => m.id === kind)!.label : d.name,
      equipment: { ...result, parameters: [...result.parameters.map(p => ({ ...p, origin: "documentation" as const, checkedAt: result.checkedAt })), ...(d.equipment?.parameters.filter(p => p.origin === "measurement") || [])] },
      profile: { ...d.profile, mobility: kind === "walker" ? "walking" : kind, widthCm: nextWidth },
    }));
    setSuccess(keepWidth ? "Dodano dokumentację. Zachowano Twoją szerokość." : "Dodano znalezione dane. Możesz teraz zapisać zestaw.");
  }
  async function save() {
    if (busy) return; setBusy(true); setError("");
    try {
      const p = draft.profile;
      if (p.widthCm && (!Number.isFinite(Number(p.widthCm)) || Number(p.widthCm) < 30 || Number(p.widthCm) > 200)) throw new Error(WIDTH_ERROR);
      if (!p.maxIncline || !Number.isInteger(Number(p.maxIncline)) || Number(p.maxIncline) < 0 || Number(p.maxIncline) > 15) throw new Error("Podaj podjazd od 0 do 15 w całych procentach.");
      if (!p.maxKerbCm || !Number.isFinite(Number(p.maxKerbCm)) || Number(p.maxKerbCm) < 0 || Number(p.maxKerbCm) > 20) throw new Error("Podaj krawężnik od 0 do 20 cm.");
      await onSave(draft, car); localStorage.removeItem(key);
      if (research.presetId === draft.id && job?.status !== "searching") research.dismiss();
      onClose();
    } catch (e) {
      const message = (e as Error).message;
      setError(message); setSuccess("");
      if (message === WIDTH_ERROR) requestAnimationFrame(() => {
        widthInput.current?.focus({ preventScroll: true });
        widthField.current?.scrollIntoView({ block: "center", behavior: "instant" });
      });
    }
    finally { setBusy(false); }
  }
  return <section className={`preset-editor ${onboarding ? "onboarding-editor" : ""}`} aria-label="Konfiguracja potrzeb">
    <div className="editor-top"><span className="eyebrow">ZESTAW POTRZEB · {step + 1}/2</span>
      <button className="text-button" disabled={busy} onClick={() => { if (onboarding && step === 1) void save(); else onClose(); }}>{onboarding ? step === 1 ? "Zapisz i otwórz mapę" : "Pomiń na razie" : "Zamknij"}</button></div>
    <h1 ref={heading} tabIndex={-1}>{step === 0 ? "Jak się poruszasz?" : draft.kind === "walking" ? "Twoje warunki podróży" : "Dodaj swój sprzęt"}</h1>
    <p className="muted">{step === 0 ? "Dopasuj miejsca i trasę do siebie. Wszystko możesz później zmienić." : onboarding ? "Zapisz wybrany sposób poruszania się i wpisane dane. Brakujące parametry możesz uzupełnić później w profilu." : "Podaj tylko to, co wiesz. Pozostałe informacje uzupełnisz później."}</p>
    {step === 0 ? <>
      <div className="mobility-grid" role="radiogroup" aria-label="Sposób poruszania się">
        {mobilityChoices.map(({ id, label, Icon }) => <label className={`mobility-option ${chosen && draft.kind === id ? "chosen" : ""}`} key={id}>
          <input type="radio" name="mobility-kind" checked={chosen && draft.kind === id} onChange={() => choose(id)} />
          <Icon aria-hidden="true" size={28} /><span>{label}</span>{chosen && draft.kind === id && <Check className="step-success" aria-hidden="true" />}
        </label>)}
      </div>
      <label className="check-row"><input type="checkbox" checked={car} onChange={e => setCar(e.target.checked)} />Korzystam też z samochodu</label>
      <button className="button primary full" disabled={!chosen} onClick={() => { setStep(1); setSuccess("Wybrano sposób poruszania się."); }}>Dalej</button>
    </> : <>
      <button className="text-button" onClick={() => setStep(0)}><ArrowLeft size={16} /> Zmień sposób poruszania się</button>
      {draft.kind !== "walking" && <>
        <div className="equipment-methods">
          {([['photo', 'Zrób zdjęcie', Camera], ['name', 'Wpisz model', Search], ['manual', 'Wpisz parametry', Ruler]] as const).map(([id, label, Icon]) =>
            <button key={id} className={method === id ? "chosen" : ""} aria-pressed={method === id} onClick={() => setMethod(id)}><Icon aria-hidden="true" /><span>{label}</span></button>)}
        </div>
        {method !== "manual" && <EquipmentChat key={`${draft.id}-${ownerId || "guest"}`} kind={draft.kind} presetId={draft.id} mode={method} models={models} research={research}
          onApply={applyEquipment} onManual={() => { setMethod("manual"); document.getElementById("preset-width")?.focus(); }} />}
      </>}
      <div className="preset-summary">
        <h2>Twój zestaw</h2>
        <label className="field-label" htmlFor="preset-name">Nazwa zestawu</label>
        <input id="preset-name" value={draft.name} maxLength={80} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
        {draft.kind !== "walking" && <div ref={widthField}>
          <label className="field-label" htmlFor="preset-width">Szerokość całkowita z wyposażeniem <small>opcjonalnie</small></label>
          <div className="input-unit"><input ref={widthInput} id="preset-width" inputMode="decimal" type="number" min={30} max={200} step="0.1" placeholder="Nie wiem" value={draft.profile.widthCm} onChange={e => width(e.target.value)} aria-describedby={`preset-width-help${widthError ? " preset-save-error" : ""}`} aria-invalid={widthError || undefined} /><span>cm</span></div>
          {widthError && <p id="preset-save-error" role="alert" className="error-box">{error}</p>}
          <p id="preset-width-help" className="field-help">Zmierz najszersze miejsce, z wystającymi elementami i miejscem na dłonie. Szerokość siedziska nie wystarcza.</p>
        </div>}
        {draft.equipment && <details><summary>Model i źródła parametrów</summary><h3>{draft.equipment.name}</h3>
          {draft.equipment.parameters.map((p, i) => <div className="equipment-fact" key={i}><strong>{p.label}: {p.value}</strong><small>{p.origin === "measurement" ? "Twój pomiar" : "Dokumentacja producenta"}{p.checkedAt ? ` · ${p.checkedAt.slice(0, 10)}` : ""}</small>
            {p.sourceUrl && <a href={p.sourceUrl} target="_blank" rel="noreferrer">Źródło</a>}{p.quote && <p>{p.quote}</p>}</div>)}
          <p className="field-help">Parametry maksymalne sprzętu nie określają tempa ani komfortu Twojej podróży.</p>
        </details>}
        <details><summary>Dostosuj warunki przejazdu</summary>
          <p className="field-help">6% podjazdu i 2 cm krawężnika to propozycje do zmiany. Brak informacji na mapie nadal wymaga sprawdzenia.</p>
          <label className="field-label" htmlFor="preset-incline">Maksymalny wygodny podjazd (%)</label><input id="preset-incline" type="number" min={0} max={15} step={1} value={draft.profile.maxIncline} onChange={e => setDraft(d => ({ ...d, profile: { ...d.profile, maxIncline: e.target.value } }))} />
          <label className="field-label" htmlFor="preset-kerb">Maksymalny krawężnik (cm)</label><input id="preset-kerb" type="number" min={0} max={20} step="0.5" value={draft.profile.maxKerbCm} onChange={e => setDraft(d => ({ ...d, profile: { ...d.profile, maxKerbCm: e.target.value } }))} />
          <label className="check-row"><input type="checkbox" checked={draft.profile.avoidUnpaved} onChange={e => setDraft(d => ({ ...d, profile: { ...d.profile, avoidUnpaved: e.target.checked } }))} />Unikaj nieutwardzonej nawierzchni</label>
        </details>
      </div>
      <button className="button primary full" disabled={busy || !draft.name.trim()} onClick={() => void save()}>{busy ? "Chwilę…" : "Zastosuj i pokaż mapę"}</button>
    </>}
    {success && <p className="success-note" role="status"><Check className="step-success" aria-hidden="true" />{success}</p>}
    {error && !widthError && <p id="preset-save-error" role="alert" className="error-box">{error}</p>}
  </section>;
}
