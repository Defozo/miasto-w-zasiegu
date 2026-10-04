import { useEffect, useState } from "react";
import { api } from "./api";
interface Learning {
  sampleCount: number;
  ready: boolean;
  secondsPerMeter: number | null;
  durationModel?: string;
}
export default function LearningPanel({
  userId,
  onAccount,
}: {
  userId: string | null;
  onAccount: () => void;
}) {
  const [data, setData] = useState<Learning | null>(null),
    [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    setData(null);
    setMessage("");
    if (userId)
      api<Learning>("/learning/me")
        .then((value) => {
          if (active) setData(value);
        })
        .catch((e) => {
          if (active) setMessage(e.message);
        });
    return () => {
      active = false;
    };
  }, [userId]);
  return (
    <section className="learning-panel">
      <h2>Czas dopasowany do Ciebie</h2>
      <p>
        Po zakończonym przejeździe w aplikacji Android możesz zapisać czas i
        ocenę drogi. Po co najmniej 3 przejazdach zaczniemy dopasowywać
        szacowany czas do Twojego tempa.
      </p>
      <p className="field-help">
        To dobrowolne. Sam fakt wcześniejszego przejazdu nie potwierdza
        aktualnego stanu krawężników czy wind.
      </p>
      {userId ? (
        <>
          <p role="status">
            {data
              ? data.ready
                ? `Szacunek korzysta z Twoich przejazdów. Próby: ${data.sampleCount}.`
                : `Zapisane próby: ${data.sampleCount}. Potrzebujemy co najmniej 3 odpowiednich przejazdów.`
              : message || "Sprawdzamy historię…"}
          </p>
          {(data?.sampleCount || 0) > 0 && (
            <button
              className="text-button"
              type="button"
              onClick={async () => {
                if (!confirm("Usunąć historię przejazdów i wyuczone tempo?"))
                  return;
                try {
                  await api("/trips/me", { expectedUserId: userId }, "DELETE");
                  setData(await api("/learning/me"));
                  setMessage("Usunięto historię i wyuczone tempo.");
                } catch (e) {
                  setMessage((e as Error).message);
                }
              }}
            >
              Usuń przejazdy i wyuczone tempo
            </button>
          )}
        </>
      ) : (
        <button type="button" className="text-button" onClick={onAccount}>
          Połącz przejazdy z kontem →
        </button>
      )}
      {message && data && <p role="status">{message}</p>}
    </section>
  );
}
