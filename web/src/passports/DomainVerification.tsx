import { useEffect, useId, useRef, useState } from "react";
import { passportDate, passportRequest } from "./passport-api";

interface Verification {
  id: string;
  host: string;
  verificationUrl: string;
  status: "pending" | "verified" | "expired";
  challengeExpiresAt: string;
  verifiedAt: string | null;
  expiresAt: string | null;
  lastCheckedAt: string | null;
  lastErrorCode: string | null;
}

export default function DomainVerification({
  userId,
  websiteUrl,
}: {
  userId: string;
  websiteUrl: string | null;
}) {
  const prefix = useId();
  const controller = useRef<AbortController | null>(null);
  const [url, setUrl] = useState(websiteUrl ?? "");
  const [records, setRecords] = useState<Verification[]>([]);
  const [challenge, setChallenge] = useState<{
    verification: Verification;
    metaTag: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    const current = new AbortController();
    controller.current = current;
    passportRequest<{ verifications: Verification[] }>(
      `/site-verifications?expectedUserId=${encodeURIComponent(userId)}`,
      { signal: current.signal },
    )
      .then((data) => {
        if (!current.signal.aborted) setRecords(data.verifications);
      })
      .catch((failure) => {
        if (!current.signal.aborted) setError(failure.message);
      });
    return () => current.abort();
  }, [userId]);
  useEffect(() => {
    if (websiteUrl && !url) setUrl(websiteUrl);
  }, [websiteUrl, url]);
  function updateRecord(record: Verification) {
    setRecords((current) => [
      record,
      ...current.filter((item) => item.host !== record.host),
    ]);
  }
  async function create() {
    setBusy(true);
    setError("");
    setMessage("");
    const signal = controller.current?.signal;
    try {
      const result = await passportRequest<{
        verification: Verification;
        metaTag: string;
      }>("/site-verifications", {
        body: { websiteUrl: url, expectedUserId: userId },
        signal,
      });
      if (signal?.aborted) return;
      setChallenge(result);
      updateRecord(result.verification);
      setMessage(
        "Znacznik jest gotowy. Umieść go w sekcji head strony głównej, a następnie wybierz Sprawdź znacznik.",
      );
    } catch (failure) {
      if (!signal?.aborted) setError((failure as Error).message);
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  }
  async function check(record: Verification) {
    setBusy(true);
    setError("");
    setMessage("");
    const signal = controller.current?.signal;
    try {
      const result = await passportRequest<{
        verification: Verification;
        verified: boolean;
      }>(`/site-verifications/${encodeURIComponent(record.id)}/check`, {
        body: { expectedUserId: userId },
        signal,
      });
      if (signal?.aborted) return;
      updateRecord(result.verification);
      setMessage(
        `Potwierdzono kontrolę nad stroną ${result.verification.host}. To oznaczenie dotyczy Twoich informacji, nie audytu dostępności.`,
      );
    } catch (failure) {
      if (!signal?.aborted) setError((failure as Error).message);
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  }
  return (
    <section
      className="passport-domain"
      aria-label="Opcjonalne potwierdzenie strony"
    >
      <h2>Potwierdzenie strony obiektu</h2>
      <p>
        Jeżeli zarządzasz stroną, możesz to potwierdzić znacznikiem.
        Potwierdzenie nie jest wymagane do publikacji i nie daje wyłączności na
        edycję obiektu.
      </p>
      <label htmlFor={`${prefix}-url`}>
        Adres strony HTTPS
        <input
          id={`${prefix}-url`}
          type="url"
          placeholder="https://twoj-obiekt.pl"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          disabled={busy}
        />
      </label>
      <button
        className="button secondary"
        type="button"
        disabled={busy || !url.trim()}
        onClick={create}
      >
        Wygeneruj nowy znacznik
      </button>
      <p className="passport-caption">
        Nowy znacznik zastępuje wcześniejszy dla tej strony. Umieść go w sekcji{" "}
        <code>head</code> strony głównej. Potwierdzenie jest ważne przez 30 dni.
      </p>
      {challenge ? (
        <div className="passport-domain-challenge">
          <label htmlFor={`${prefix}-meta`}>
            Znacznik dla {challenge.verification.host}
          </label>
          <textarea
            id={`${prefix}-meta`}
            readOnly
            rows={3}
            value={challenge.metaTag}
            onFocus={(event) => event.target.select()}
            spellCheck={false}
          />
          <p className="passport-caption">
            Wyzwanie ważne do{" "}
            {passportDate(challenge.verification.challengeExpiresAt)}. Skopiuj
            znacznik przed zamknięciem widoku.
          </p>
        </div>
      ) : null}
      {error ? (
        <p className="passport-warning" role="alert">
          {error}
        </p>
      ) : null}
      <p role="status">{message}</p>
      {records.length > 0 ? (
        <ul className="passport-verifications">
          {records.map((record) => (
            <li key={record.id}>
              <strong>{record.host}</strong>
              <p>
                {record.status === "verified"
                  ? `Potwierdzono ${passportDate(record.verifiedAt)}. Ważne do ${passportDate(record.expiresAt)}.`
                  : record.status === "expired"
                    ? "Potwierdzenie wygasło. Sprawdź stronę ponownie."
                    : "Oczekuje na sprawdzenie znacznika."}
              </p>
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => check(record)}
              >
                {record.status === "verified"
                  ? "Sprawdź ponownie"
                  : "Sprawdź znacznik"}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
