import { useEffect, useRef, useState } from "react";
import { Check, MessageCircle, Send } from "lucide-react";
import type { EquipmentJob, EquipmentKind, Wheelchair } from "./types";
import type { ResearchController } from "./useEquipmentResearch";
import "./equipment-chat.css";

const kindNames: Record<EquipmentKind, string> = {
  manual: "wózek manualny", power: "wózek elektryczny", walker: "balkonik", stroller: "wózek dziecięcy", walking: "pieszo",
};
type Finding = NonNullable<EquipmentJob["equipment"]>;

export default function EquipmentChat({ kind, presetId, mode, models, research, onApply, onManual }: {
  kind: EquipmentKind; presetId: string; mode: "name" | "photo"; models: Wheelchair[]; research: ResearchController;
  onApply: (equipment: Finding, kind: EquipmentKind) => void; onManual: () => void;
}) {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [appliedRevision, setAppliedRevision] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const composer = useRef<HTMLTextAreaElement>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const uploadVersion = useRef(0);
  const job = research.presetId === presetId && (research.job?.kind === kind || research.job?.identifiedKind === kind) ? research.job : null;
  const working = research.sending || uploading || job?.status === "searching";
  const ready = job?.status === "complete" && (job.conversational ? job.canApply : true);
  const result = job?.equipment;
  const resultKind = job?.identifiedKind || kind;
  const messages = job?.messages || [];
  const revision = messages.at(-1)?.id || job?.id;
  const applied = Boolean(revision && appliedRevision === revision);
  const suggestions = job?.suggestions || job?.candidates?.map(candidate => `${candidate.manufacturer} ${candidate.name}`) || [];

  useEffect(() => {
    const log = transcript.current;
    if (log && !log.contains(document.activeElement)) log.scrollTop = log.scrollHeight;
  }, [messages.length, job?.status]);
  useEffect(() => () => { uploadVersion.current++; }, []);

  async function send(text: string) {
    const reply = text.trim();
    if (!reply || working) return;
    setError(""); setAppliedRevision(null);
    try {
      if (job?.conversational) await research.reply(reply);
      else await research.start(kind, presetId, { query: reply });
      setInput(""); composer.current?.focus();
    } catch (e) { setError((e as Error).message); }
  }
  async function retry() {
    setError("");
    try { await research.reply(); } catch (e) { setError((e as Error).message); }
  }
  async function photo(file?: File) {
    if (!file || working) return;
    if (file.size > 6_000_000) { setError("Wybierz zdjęcie do 6 MB."); return; }
    const version = ++uploadVersion.current;
    setUploading(true); setError(""); setAppliedRevision(null);
    try {
      const image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Nie udało się odczytać zdjęcia. Spróbuj ponownie."));
        reader.readAsDataURL(file);
      });
      if (version !== uploadVersion.current) return;
      await research.start(kind, presetId, { image });
    } catch (e) { if (version === uploadVersion.current) setError((e as Error).message); }
    finally { if (version === uploadVersion.current) setUploading(false); }
  }
  function reset() {
    uploadVersion.current++; research.dismiss(); setInput(""); setError(""); setAppliedRevision(null);
    composer.current?.focus();
  }

  return <section className="equipment-chat" aria-label="Asystent sprzętu">
    <header className="equipment-chat-header">
      <div><MessageCircle size={22} aria-hidden="true" /><h2>Ustalmy Twój model</h2></div>
      {job && <button type="button" className="text-button" onClick={reset} disabled={research.sending || uploading}>Nowa rozmowa</button>}
    </header>
    <p className="field-help equipment-chat-privacy">Asystent AI sprawdzi dokumentację i dopyta o szczegóły. Treść rozmowy trafia do dostawcy AI. Podawaj tylko informacje o sprzęcie.</p>
    {mode === "photo" && <div className="equipment-chat-photo">
      <label className="field-label" htmlFor="equipment-photo">Zdjęcie sprzętu lub oznaczenia modelu</label>
      <p className="field-help">Zdjęcie rozpocznie nową rozmowę. Wyślemy je do analizy AI bez zapisywania w katalogu. Najlepiej pokaż etykietę modelu bez osób w kadrze.</p>
      <input id="equipment-photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={working}
        onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; void photo(file); }} />
    </div>}
    <div className="equipment-chat-log" role="log" aria-label="Rozmowa o sprzęcie" aria-live="polite" aria-relevant="additions" tabIndex={0} ref={transcript}>
      <div className="equipment-message assistant"><span className="equipment-message-author">Asystent</span>
        <p>Jaki sprzęt masz? Podaj nazwę producenta i model albo napisz to, co wiesz. Jeśli jest kilka wersji, ustalimy, która jest Twoja.</p>
      </div>
      {messages.map(message => <div className={`equipment-message ${message.role}`} key={message.id}>
        <span className="equipment-message-author">{message.role === "user" ? "Ty" : "Asystent"}</span><p>{message.text}</p>
      </div>)}
      {!messages.length && job && job.status !== "searching" && <div className="equipment-message assistant"><span className="equipment-message-author">Asystent</span><p>{job.message}</p></div>}
    </div>
    {working && <p className="equipment-chat-status" role="status"><span className="loader" aria-hidden="true" />{job?.status === "searching" ? job.message : "Wysyłamy wiadomość…"}</p>}
    {!working && suggestions.length > 0 && <div className="equipment-chat-suggestions" role="group" aria-label="Proponowane odpowiedzi">
      {suggestions.map(suggestion => <button type="button" key={suggestion} onClick={() => void send(suggestion)}>{suggestion}</button>)}
    </div>}
    {job?.status === "failed" && <div className="equipment-chat-failure" role="alert"><p>{job.message}</p>
      {job.conversational && job.phase !== "identifying" && <button className="text-button" type="button" disabled={working} onClick={() => void retry()}>Spróbuj ponownie</button>}
    </div>}
    {(error || research.error) && <div role="alert" className="equipment-chat-failure"><p>{error || research.error}</p>
      {research.error && <button className="text-button" type="button" onClick={research.refresh}>Sprawdź odpowiedź ponownie</button>}
    </div>}
    {result && !working && <details className="equipment-chat-evidence" open={ready || undefined} key={`${revision}-evidence`}>
      <summary>{ready ? "Parametry do zatwierdzenia" : "Dotychczasowe ustalenia i źródła"}</summary>
      <h3>{result.name}</h3><p>{result.variant}</p>
      <dl><div><dt>Rodzaj sprzętu</dt><dd>{job?.conversational && !job.identifiedKind ? "Do ustalenia" : kindNames[resultKind]}</dd></div><div><dt>Szerokość całkowita</dt><dd>{result.widthLabel}</dd></div></dl>
      {result.widthCm === null && <p className="field-help">Nie wpiszemy jednej szerokości. Możesz podać własny pomiar poniżej.</p>}
      <p className="field-help">{result.notes}</p>
      <p className="equipment-source-status">Odczyt AI z dokumentacji, bez sprawdzenia egzemplarza{result.checkedAt ? ` · ${new Date(result.checkedAt).toLocaleDateString("pl-PL")}` : ""}</p>
      <ul className="equipment-chat-sources">{(result.sources || result.parameters.filter(p => p.sourceUrl).map(p => ({ title: p.label, url: p.sourceUrl })))
        .filter((source, i, all) => all.findIndex(item => item.url === source.url) === i)
        .map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></li>)}</ul>
    </details>}
    {ready && result && <div className="equipment-chat-apply">
      {resultKind !== kind && <p>Po zatwierdzeniu zmienimy rodzaj zestawu na: <strong>{kindNames[resultKind]}</strong>.</p>}
      <button type="button" className="button secondary full" disabled={applied} onClick={() => { onApply(result, resultKind); setAppliedRevision(revision || null); }}>
        {applied ? <><Check size={18} aria-hidden="true" />Dodano do zestawu</> : "Użyj tych parametrów"}
      </button>
      <p className="field-help">Sprawdź, czy opis pasuje do Twojego sprzętu. Twój własny pomiar ma pierwszeństwo.</p>
    </div>}
    <form className="equipment-chat-composer" onSubmit={e => { e.preventDefault(); void send(input); }}>
      <label className="field-label" htmlFor="equipment-chat-input">{job ? "Twoja odpowiedź" : "Producent i model"}</label>
      <div className="equipment-chat-input-row"><textarea ref={composer} id="equipment-chat-input" rows={2} maxLength={800} value={input}
        readOnly={research.sending || uploading}
        placeholder={job ? "Wybierz podpowiedź lub napisz własną odpowiedź…" : "Np. Vitea Care Cameleon, rozmiaru nie znam"}
        aria-describedby="equipment-chat-keyboard" onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(input); } }} />
        <button type="submit" className="button primary" disabled={working || !input.trim()} aria-label={job ? "Wyślij odpowiedź" : "Znajdź parametry"}><Send size={20} aria-hidden="true" /></button>
      </div>
      <p className="field-help" id="equipment-chat-keyboard">Enter wysyła, Shift+Enter dodaje nowy wiersz. Możesz odpowiedzieć własnymi słowami.</p>
      {!job && input.trim().length >= 2 && <div className="equipment-chat-suggestions" role="group" aria-label="Podpowiedzi modeli">{models
        .filter(model => `${model.manufacturer} ${model.name}`.toLocaleLowerCase("pl").includes(input.trim().toLocaleLowerCase("pl"))).slice(0, 3)
        .map(model => <button type="button" key={model.id} disabled={working} onClick={() => void send(`${model.manufacturer} ${model.name}`)}>{model.name}</button>)}</div>}
    </form>
    <button type="button" className="text-button equipment-chat-manual" onClick={onManual}>Wolę wpisać parametry samodzielnie</button>
  </section>;
}
