import { Check, ChevronRight, Plus, Pencil, Trash2, UserRound, HeartHandshake, Building2, Sparkles } from "lucide-react";
import { useState } from "react";
import DisplaySettings from "./DisplaySettings";
import type { PresetController } from "./useMobilityPresets";
import type { MobilityPreset } from "./types";
import { mobilityChoices, newPreset } from "./PresetEditor";
export default function ProfileHub({ presets, onEdit, onSection }: {
  presets: PresetController; onEdit: (p: MobilityPreset) => void; onSection: (name: "account" | "community" | "objects") => void;
}) {
  const [message, setMessage] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);
  async function act(action: () => Promise<void>) { try { await action(); setMessage("Zapisano zmianę."); } catch (e) { setMessage((e as Error).message); } }
  return <div className="panel-body profile-hub">
    <h1>Twój profil</h1><p className="muted">Wybierz zapisany zestaw potrzeb lub dodaj nowy.</p>
    {presets.error && <div role="alert" className="error-box">{presets.error}<button className="text-button" onClick={presets.reload}>Wczytaj aktualne dane</button></div>}
    {presets.loading && <p role="status">Wczytujemy zestawy…</p>}
    <div className="preset-list">{presets.presets.map(p => <article className={presets.activePresetId === p.id ? "preset-card active" : "preset-card"} key={p.id}>
      <button className="preset-select" onClick={() => void act(() => presets.select(p.id))} aria-pressed={presets.activePresetId === p.id}>
        <span><strong>{p.name}</strong><small>{mobilityChoices.find(m => m.id === p.kind)?.label}{p.profile.widthCm ? ` · ${p.profile.widthCm} cm` : " · szerokość niepodana"}</small></span>
        {presets.activePresetId === p.id && <Check aria-label="Aktywny zestaw" />}
      </button>
      <div className="preset-actions"><button className="text-button" onClick={() => onEdit(p)}><Pencil size={16} />Edytuj</button>
        <button className="text-button" onClick={() => setRemoving(p.id)}><Trash2 size={16} />Usuń</button></div>
      {removing === p.id && <div><p>Usunąć zestaw „{p.name}”?</p><button className="text-button" onClick={() => { void act(() => presets.remove(p.id)); setRemoving(null); }}>Usuń zestaw</button><button className="text-button" onClick={() => setRemoving(null)}>Anuluj</button></div>}
    </article>)}</div>
    <button className="button secondary full" disabled={presets.presets.length >= 12} onClick={() => onEdit(newPreset())}><Plus size={19} />Dodaj zestaw</button>
    {message && <p role="status">{message}</p>}
    <DisplaySettings />
    <div className="profile-links">{([{ id: 'account', label: 'Konto i synchronizacja', Icon: UserRound }, { id: 'community', label: 'Wspólnie: obserwacje', Icon: HeartHandshake }, { id: 'objects', label: 'Moje obiekty', Icon: Building2 }] as const).map(({ id, label, Icon }) => <button key={id} onClick={() => onSection(id)}><Icon size={20} /><span>{label}</span><ChevronRight size={18} /></button>)}
      <a href="/gra"><Sparkles size={20} /><span>Iskry Miasta</span><ChevronRight size={18} /></a>
      <a href="/cennik"><HeartHandshake size={20} /><span>Premium, wsparcie i reklama</span><ChevronRight size={18} /></a>
    </div>
  </div>;
}
