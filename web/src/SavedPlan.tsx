import { useState } from "react";
import { Bookmark, Clock3, Trash2 } from "lucide-react";
import { dateLabel, metres } from "./api";
import type { SavedRoute } from "./types";
import "./saved-plan.css";

export function planAge(saved: SavedRoute) {
  const computed = saved.route.source.computedAt;
  return typeof computed === "string" && Number.isFinite(Date.parse(computed))
    ? `Trasa obliczona: ${dateLabel(computed)}.`
    : `Plan zapisany: ${dateLabel(saved.savedAt)}. Data obliczenia jest nieznana.`;
}

export default function SavedPlan({
  saved,
  viewing,
  onOpen,
  onDelete,
}: {
  saved: SavedRoute;
  viewing: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  return (
    <section className="saved-plan" aria-label="Plan na później">
      <div className="saved-plan-heading">
        <Bookmark size={19} aria-hidden="true" />
        <h2>Plan na później</h2>
      </div>
      <p className="saved-plan-destination">
        {saved.startLabel} <span aria-label="do">→</span> {saved.place.name}
      </p>
      <p>
        {metres(saved.route.distanceM)}
        {saved.waypoints?.length
          ? ` · Przystanki: ${saved.waypoints.length}`
          : ""}
      </p>
      <p className="saved-plan-age">
        <Clock3 size={16} aria-hidden="true" />
        {planAge(saved)}
      </p>
      <p className="field-help">
        {saved.scope === "account"
          ? "Zapis dla Twojego konta na tym urządzeniu. Ponowne otwarcie wymaga sprawdzenia logowania przez internet."
          : "Plan i instrukcje dostępne bez logowania, także bez sieci, dla osób korzystających z tego urządzenia."}{" "}
        Mapa wymaga internetu, a warunki na drodze mogły się zmienić.
      </p>
      {!viewing && (
        <button
          type="button"
          className="button secondary full"
          onClick={onOpen}
        >
          Otwórz zapisaną trasę
        </button>
      )}
      {confirm ? (
        <div className="saved-plan-confirm">
          <p>
            Usunąć zapis z tego urządzenia? Trasę możesz później wyznaczyć
            ponownie.
          </p>
          <div>
            <button type="button" className="text-button" onClick={onDelete}>
              Tak, usuń zapis
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => setConfirm(false)}
            >
              Zachowaj plan
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="text-button"
          onClick={() => setConfirm(true)}
        >
          <Trash2 size={16} aria-hidden="true" />
          Usuń zapisany plan
        </button>
      )}
    </section>
  );
}
