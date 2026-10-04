import PassportCard from "./PassportCard";
import { passportDate } from "./passport-api";
import { usePassport } from "./usePassport";

export default function PassportPlaceSection({
  placeId,
  onPlan,
}: {
  placeId: string;
  onPlan?: (placeId: string, entranceId?: string) => void;
}) {
  const { passport, loading, error, receivedAt, refresh } =
    usePassport(placeId);
  return (
    <section
      className="passport-public"
      aria-label="Paszport dostępności obiektu"
    >
      {loading && !passport ? (
        <p role="status">Pobieramy informacje o obiekcie…</p>
      ) : null}
      {error ? (
        <div className="passport-warning" role="status">
          <p>
            {error}{" "}
            {passport
              ? `Pokazujemy ostatnio pobrane dane z ${passportDate(receivedAt)}. Mogą być nieaktualne.`
              : "Nie możemy teraz pokazać paszportu."}
          </p>
          <button
            className="button secondary"
            type="button"
            disabled={loading}
            onClick={refresh}
          >
            Spróbuj ponownie
          </button>
        </div>
      ) : null}
      {passport ? <PassportCard passport={passport} onPlan={onPlan} /> : null}
    </section>
  );
}
