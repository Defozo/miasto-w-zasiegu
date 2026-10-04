import { useId, useState } from "react";
import { Copy, ExternalLink } from "lucide-react";

const escapeAttribute = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

export default function EmbedCode({
  placeId,
  name,
}: {
  placeId: string;
  name: string;
}) {
  const id = useId();
  const [message, setMessage] = useState("");
  const url = `${window.location.origin}/embed/places/${encodeURIComponent(placeId)}`;
  const code = `<iframe src="${escapeAttribute(url)}" title="${escapeAttribute(`Warunki dostępności: ${name}`)}" width="100%" height="720" style="border:0;" loading="lazy" referrerpolicy="no-referrer"></iframe>`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setMessage("Kod widgetu skopiowany.");
    } catch {
      const input = document.getElementById(id) as HTMLTextAreaElement | null;
      input?.focus();
      input?.select();
      setMessage(
        "Zaznaczyliśmy kod. Skopiuj go skrótem Ctrl+C lub poleceniem Kopiuj.",
      );
    }
  }
  return (
    <section
      className="passport-embed-code"
      aria-label="Widget na stronę obiektu"
    >
      <h2>Widget na Twoją stronę</h2>
      <p>
        Wklej kod w miejscu, w którym chcesz pokazać warunki dostępności. Widget
        pokaże najnowsze opublikowane informacje o obiekcie.
      </p>
      <label htmlFor={id}>Kod do osadzenia</label>
      <textarea
        id={id}
        readOnly
        rows={5}
        value={code}
        spellCheck={false}
        onFocus={(event) => event.target.select()}
      />
      <div className="passport-actions">
        <button type="button" className="button secondary" onClick={copy}>
          <Copy size={17} aria-hidden="true" /> Kopiuj kod
        </button>
        <a
          className="button secondary"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Podgląd widgetu
          <ExternalLink size={17} aria-hidden="true" />
          <span className="sr-only"> w nowej karcie</span>
        </a>
      </div>
      <p className="passport-caption">
        Widget nie wymaga logowania odwiedzających. Strona obiektu musi
        dopuszczać osadzenie tej ramki.
      </p>
      {window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ? (
        <p className="passport-warning">
          To adres lokalnego prototypu. Będzie dostępny na publicznej stronie
          dopiero po uruchomieniu aplikacji Miasto w zasięgu pod publicznym adresem HTTPS i
          skopiowaniu nowego kodu.
        </p>
      ) : null}
      <p role="status">{message}</p>
    </section>
  );
}
