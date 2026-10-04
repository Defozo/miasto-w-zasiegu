import { useCallback, useEffect, useState } from "react";
import type { PlacePassport } from "../../../shared/place-passports.mjs";
import { passportRequest } from "./passport-api";

export function usePassport(placeId: string) {
  const [reload, setReload] = useState(0);
  const [state, setState] = useState<{
    placeId: string;
    passport: PlacePassport | null;
    loading: boolean;
    error: string;
    receivedAt: string | null;
  }>({ placeId, passport: null, loading: true, error: "", receivedAt: null });
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    async function refresh() {
      if (pending || controller.signal.aborted) return;
      pending = true;
      setState((old) =>
        old.placeId === placeId
          ? { ...old, loading: true }
          : {
              placeId,
              passport: null,
              loading: true,
              error: "",
              receivedAt: null,
            },
      );
      try {
        const passport = await passportRequest<PlacePassport>(
          `/place-passports/${encodeURIComponent(placeId)}`,
          { public: true, signal: controller.signal },
        );
        if (!controller.signal.aborted) {
          setState({
            placeId,
            passport,
            loading: false,
            error: "",
            receivedAt: new Date().toISOString(),
          });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setState((old) => ({
            ...old,
            placeId,
            loading: false,
            error: (error as Error).message,
          }));
        }
      } finally {
        pending = false;
      }
    }
    const visible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    void refresh();
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [placeId, reload]);
  const refresh = useCallback(() => setReload((value) => value + 1), []);
  return {
    ...(state.placeId === placeId
      ? state
      : {
          placeId,
          passport: null,
          loading: true,
          error: "",
          receivedAt: null,
        }),
    refresh,
  };
}
