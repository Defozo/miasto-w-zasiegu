import { useState } from "react";
import { api, dateLabel } from "./api";
import type { BarrierReport } from "./types";
export default function ReportFeedback({ report, userId, onUpdate, onEdit }: { report: BarrierReport; userId: string | null; onUpdate: (r: BarrierReport) => void; onEdit: () => void }) {
  const [text, setText] = useState(""), [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [reward, setReward] = useState<BarrierReport['explorerReward']>();
  async function submit(action: "confirm" | "dispute") {
    setBusy(true); setError(""); try { const r = await api<BarrierReport>(`/reports/${report.id}/feedback`, { action, description: text, expectedUserId: userId }); onUpdate(r); setReward(r.explorerReward); setOpen(false); setText(""); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <div className="report-feedback">
    {report.inputMethod === 'photo-ai' && <p>Propozycja ze zdjęcia sprawdzona przez autora. Zdjęcie nie jest publiczne; wymiary wymagają osobnego pomiaru.</p>}
    <p>{report.duration === "permanent" ? "Stały element" : report.duration === "temporary" ? "Stan tymczasowy" : "Trwałość nieznana"} · {report.geometry?.type === "LineString" ? "odcinek" : report.geometry?.type === "Polygon" ? "obszar" : "punkt"}{report.side ? ` · ${report.side}` : ""}</p>
    {report.heightCm != null && <p>Wysokość: {report.heightCm} cm · {report.measurement === "measured" ? "pomiar" : report.measurement === "estimated" ? "szacunek" : "sposób ustalenia nieznany"}</p>}
    {report.validUntil && <p>Ważne do {dateLabel(report.validUntil)}</p>}
    {report.disputed && <p className="evidence-unknown">Zgłoszono sprzeczne informacje. Obserwacja wymaga wyjaśnienia i nie blokuje automatycznie trasy.</p>}
    <p className="muted">Potwierdzenia innych osób: {report.confirmations || 0}. {report.lastConfirmedAt ? `Ostatnia obserwacja: ${dateLabel(report.lastConfirmedAt)}.` : ""} Brak niezależnego audytu.</p>
    {report.status === "active" && <><div className="evidence-actions"><button className="text-button" disabled={!userId || busy} onClick={() => void submit("confirm")}>Nadal aktualne</button><button className="text-button" disabled={!userId || busy} onClick={() => setOpen(v => !v)}>Widzę zmianę</button>{report.isMine && <button className="text-button" onClick={onEdit}>Popraw opis lub zaznaczenie</button>}</div>{!userId && <p className="muted">Zaloguj się, aby potwierdzić obserwację lub zgłosić zmianę.</p>}</>}
    {open && <form onSubmit={e => { e.preventDefault(); void submit("dispute"); }}><label className="field-label" htmlFor={`change-${report.id}`}>Co wygląda inaczej?</label><textarea id={`change-${report.id}`} required minLength={5} maxLength={800} value={text} onChange={e => setText(e.target.value)} /><button className="button secondary" disabled={busy}>Zapisz informację o zmianie</button></form>}
    {error && <p role="alert">{error}</p>}
    {!!reward?.awarded && <p role="status">+{reward.awarded} XP za ponowne sprawdzenie. <a href="/gra">Zobacz swoje odznaki</a></p>}
    {!!report.history?.length && <details><summary>Historia obserwacji</summary>{report.history.map((h, i) => <p key={i}>{dateLabel(h.observedAt)} · {h.action === "confirm" ? "Potwierdzenie aktualności" : h.action === "edit" ? "Poprawka autora" : "Zgłoszona zmiana"}{h.description ? `: ${h.description}` : ""}</p>)}</details>}
  </div>;
}
