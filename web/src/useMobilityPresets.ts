import { useEffect, useRef, useState } from "react";
import { api, readLocal, writeLocal } from "./api";
import type { MobilityPreset, PresetDocument, Profile } from "./types";

const KEY = "przejscie-guest-presets-v1";
const EMPTY: PresetDocument = { presets: [], activePresetId: null, usesCar: false, version: 0 };
function localDocument(): PresetDocument {
  const stored = readLocal<PresetDocument | null>(KEY, null);
  if (stored && Array.isArray(stored.presets)) return stored;
  const legacy = readLocal<Profile | null>("przejscie-profile", null);
  return legacy ? { ...EMPTY, presets: [{ id: "legacy", name: "Mój zestaw", kind: legacy.mobility, profile: legacy, equipment: null }], activePresetId: "legacy" } : EMPTY;
}
export function useMobilityPresets(userId: string | null, ready: boolean, profileVersion: number,
  onApply: (preset: MobilityPreset | null, version: number) => void) {
  const [state, setState] = useState<{ owner: string | null; doc: PresetDocument }>({ owner: userId, doc: EMPTY });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const owner = useRef(userId); owner.current = userId;
  const apply = useRef(onApply); apply.current = onApply;
  const generation = useRef(0);
  useEffect(() => {
    function changed(event: StorageEvent) { if (!userId && event.key === KEY) setReload(n => n + 1); }
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, [userId]);
  useEffect(() => {
    if (!ready) return;
    let alive = true; const request = ++generation.current;
    setLoading(true); setError("");
    (userId ? api<PresetDocument>("/mobility-presets") : Promise.resolve(localDocument()))
      .then(doc => {
        if (!alive || request !== generation.current) return;
        setState({ owner: userId, doc });
        apply.current(doc.presets.find(p => p.id === doc.activePresetId) || null, doc.version);
      }).catch(e => { if (alive) setError(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [userId, ready, profileVersion, reload]);
  const doc = state.owner === userId ? state.doc : EMPTY;
  async function commit(next: PresetDocument) {
    const currentOwner = userId;
    setError("");
    let result: PresetDocument;
    try {
      if (userId) result = await api<PresetDocument>("/mobility-presets", { ...next, expectedVersion: doc.version, expectedUserId: userId }, "PUT");
      else {
        if (localDocument().version !== doc.version) throw new Error("Zestawy zmieniły się w innej karcie. Wczytaj aktualne dane przed zapisaniem.");
        result = { ...next, version: doc.version + 1 };
        if (!writeLocal(KEY, result)) throw new Error("Nie udało się zapisać zestawu na urządzeniu.");
      }
      if (owner.current !== currentOwner) throw new Error("Konto zmieniło się podczas zapisu.");
      generation.current++;
      setState({ owner: userId, doc: result });
      apply.current(result.presets.find(p => p.id === result.activePresetId) || null, result.version);
    } catch (e) { if (owner.current === currentOwner) setError((e as Error).message); throw e; }
  }
  return { ...doc, loading, error, reload: () => setReload(n => n + 1),
    active: doc.presets.find(p => p.id === doc.activePresetId) || null,
    select: (id: string) => commit({ ...doc, activePresetId: id }),
    save: (preset: MobilityPreset, usesCar: boolean) => commit({ ...doc, usesCar,
      presets: [...doc.presets.filter(p => p.id !== preset.id), preset], activePresetId: preset.id }),
    remove: (id: string) => commit({ ...doc, presets: doc.presets.filter(p => p.id !== id),
      activePresetId: doc.activePresetId === id ? doc.presets.find(p => p.id !== id)?.id || null : doc.activePresetId }),
  };
}
export type PresetController = ReturnType<typeof useMobilityPresets>;
