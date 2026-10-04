import { useEffect, useRef, useState } from "react";
import { api, readLocal, writeLocal } from "./api";
import type { EquipmentJob, EquipmentKind } from "./types";
type Pending = { id: string; presetId: string; clientId: string; owner: string | null };
export function useEquipmentResearch(ownerId: string | null) {
  const key = `przejscie-research-${ownerId || "guest"}`;
  const owner = useRef(ownerId); owner.current = ownerId;
  const [pending, setPending] = useState<Pending | null>(null);
  const [job, setJob] = useState<EquipmentJob | null>(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const request = useRef(0);
  useEffect(() => { request.current++; setPending(readLocal<Pending | null>(key, null)); setJob(null); setError(""); setSending(false); }, [key]);
  useEffect(() => {
    if (!pending || pending.owner !== ownerId) return;
    let alive = true, timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const next = await api<EquipmentJob>(`/equipment/research/${pending!.id}?clientId=${encodeURIComponent(pending!.clientId)}`);
        if (!alive) return;
        setJob(next); setError("");
        if (next.status === "searching") timer = setTimeout(poll, 2500);
      } catch (e) { if (alive) setError((e as Error).message); }
    }
    void poll();
    return () => { alive = false; clearTimeout(timer); };
  }, [pending, ownerId]);
  async function start(kind: EquipmentKind, presetId: string, input: { query?: string; image?: string }) {
    const version = ++request.current, originalOwner = ownerId;
    const clientId = crypto.randomUUID();
    setError(""); setJob(null); setPending(null); setSending(true); localStorage.removeItem(key);
    try {
      const next = await api<EquipmentJob>("/equipment/research", { kind, clientId, ...input, conversational: true, expectedUserId: ownerId });
      if (version !== request.current || originalOwner !== owner.current) return;
      const nextPending = { id: next.id, presetId, clientId, owner: ownerId };
      writeLocal(key, nextPending); setPending(nextPending); setJob(next);
    } finally { if (version === request.current) setSending(false); }
  }
  async function reply(text?: string) {
    if (!pending || pending.owner !== ownerId || sending || job?.status === "searching") return;
    const version = ++request.current, originalOwner = ownerId;
    setSending(true); setError("");
    try {
      const next = await api<EquipmentJob>(`/equipment/research/${pending.id}/messages`, {
        clientId: pending.clientId, ...(text === undefined ? { retry: true } : { text }), expectedUserId: ownerId,
      });
      if (version !== request.current || originalOwner !== owner.current) return;
      setJob(next); setPending({ ...pending });
    } finally { if (version === request.current) setSending(false); }
  }
  function dismiss() { request.current++; setPending(null); setJob(null); setError(""); setSending(false); localStorage.removeItem(key); }
  function refresh() { if (pending?.owner === ownerId) { setError(""); setPending({ ...pending }); } }
  return { job: pending?.owner === ownerId ? job : null, presetId: pending?.owner === ownerId ? pending.presetId : null, error, sending, start, reply, dismiss, refresh };
}
export type ResearchController = ReturnType<typeof useEquipmentResearch>;
