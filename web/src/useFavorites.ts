import { useCallback, useEffect, useRef, useState } from "react";
import { api, readLocal, writeLocal } from "./api";
import type { FavoritePlace, LocationPoint } from "./types";

const KEY = "przejscie-guest-favorites";
function localFavorites(): FavoritePlace[] {
  const value = readLocal<unknown>(KEY, []);
  return Array.isArray(value)
    ? value
        .filter((f): f is FavoritePlace =>
          Boolean(
            f?.id &&
            f?.label &&
            f?.point?.id &&
            f?.point?.label &&
            Array.isArray(f.point.coordinates) &&
            f.point.coordinates.length === 2 &&
            f.point.coordinates.every(Number.isFinite),
          ),
        )
        .slice(0, 30)
    : [];
}
const same = (a: FavoritePlace, label: string, point: LocationPoint) =>
  a.label.trim().replace(/\s+/g, " ").toLocaleLowerCase("pl") ===
    label.trim().replace(/\s+/g, " ").toLocaleLowerCase("pl") &&
  a.point.coordinates.every(
    (v, i) => v.toFixed(6) === point.coordinates[i].toFixed(6),
  );

export function useFavorites(userId: string | null) {
  const owner = useRef(userId);
  owner.current = userId;
  const [state, setState] = useState<{
    owner: string | null;
    items: FavoritePlace[];
  }>({ owner: userId, items: userId ? [] : localFavorites() });
  const [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const version = ++generation.current;
    setError("");
    if (!userId) {
      setState({ owner: null, items: localFavorites() });
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await api<{ favorites: FavoritePlace[] }>("/favorites");
      if (version === generation.current && owner.current === userId)
        setState({ owner: userId, items: data.favorites });
    } catch (e) {
      if (version === generation.current && owner.current === userId)
        setError((e as Error).message);
    } finally {
      if (version === generation.current) setLoading(false);
    }
  }, [userId]);
  useEffect(() => {
    reload();
    const focus = () => reload();
    window.addEventListener("focus", focus);
    return () => {
      generation.current++;
      window.removeEventListener("focus", focus);
    };
  }, [reload]);
  const save = async (label: string, point: LocationPoint) => {
    const currentOwner = userId;
    let favorite: FavoritePlace;
    if (currentOwner) {
      favorite = await api<FavoritePlace>("/favorites", {
        label: label.trim(),
        point,
        expectedUserId: currentOwner,
      });
      if (owner.current !== currentOwner)
        throw new Error(
          "Konto zmieniło się. Otwórz zapisane miejsca ponownie.",
        );
      generation.current++;
      setLoading(false);
      setState((s) => ({
        owner: currentOwner,
        items: [
          ...(s.owner === currentOwner
            ? s.items.filter((f) => f.id !== favorite.id)
            : []),
          favorite,
        ],
      }));
    } else {
      const items = localFavorites(),
        duplicate = items.find((f) => same(f, label, point));
      if (duplicate) return duplicate;
      if (items.length >= 30)
        throw new Error(
          "Masz już 30 miejsc. Usuń niepotrzebny zapis, aby dodać następny.",
        );
      favorite = {
        id: crypto.randomUUID(),
        label: label.trim(),
        point,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (!writeLocal(KEY, [...items, favorite]))
        throw new Error(
          "Nie udało się zapisać miejsca na urządzeniu. Sprawdź wolne miejsce i ustawienia przeglądarki.",
        );
      setState({ owner: null, items: [...items, favorite] });
    }
    return favorite;
  };
  const remove = async (id: string) => {
    const currentOwner = userId;
    if (currentOwner) {
      await api(
        `/favorites/${encodeURIComponent(id)}`,
        { expectedUserId: currentOwner },
        "DELETE",
      );
      if (owner.current !== currentOwner) return;
      generation.current++;
      setLoading(false);
      setState((s) => ({
        owner: currentOwner,
        items:
          s.owner === currentOwner ? s.items.filter((f) => f.id !== id) : [],
      }));
    } else {
      const items = localFavorites().filter((f) => f.id !== id);
      if (!writeLocal(KEY, items))
        throw new Error("Nie udało się usunąć zapisu. Spróbuj ponownie.");
      setState({ owner: null, items });
    }
  };
  return {
    favorites: state.owner === userId ? state.items : [],
    loading,
    error,
    reload,
    save,
    remove,
  };
}
