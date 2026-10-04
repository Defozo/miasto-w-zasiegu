import { useState } from "react";
import { LogIn, Smartphone, RefreshCw, LogOut } from "lucide-react";
import { api } from "./api";
import type { AccountState } from "./types";
import { useAuthStatus } from "./auth/AuthProvider";
import { AuthUnavailable } from "./auth/AuthPage";
export default function AccountPanel({
  session,
  onSession,
  onLogout,
  onUpload,
  syncMessage,
}: {
  session: AccountState;
  onSession: (s: AccountState) => void;
  onLogout: () => Promise<void>;
  onUpload: () => Promise<void>;
  syncMessage: string;
}) {
  const authStatus = useAuthStatus();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="panel-body account-panel">
      <p className="eyebrow">Z TOBĄ NA KAŻDYM EKRANIE</p>
      <h1>
        {session.user ? `Cześć, ${session.user.displayName}.` : "Twoje konto."}
      </h1>
      <p className="muted">
        Te same potrzeby na telefonie i komputerze. Jedno konto także do gry
        Iskry Miasta.
      </p>
      {session.user ? (
        <>
          <div className="account-card">
            <Smartphone size={30} />
            <strong>{session.user.email || session.user.displayName}</strong>
            <p>
              Wybierz to samo konto logowania w aplikacji Android. Zapisane
              potrzeby pobierzesz na obu urządzeniach.
            </p>
          </div>
          <button
            className="button secondary full"
            disabled={busy}
            onClick={() =>
              perform(async () =>
                onSession(await api<AccountState>("/auth/me")),
              )
            }
          >
            <RefreshCw size={18} /> Pobierz potrzeby z konta
          </button>
          <button
            className="button primary full"
            disabled={busy}
            onClick={() => perform(onUpload)}
          >
            Zapisz obecne potrzeby na koncie
          </button>
          <p className="field-help" role="status">
            {syncMessage}
          </p>
          <button
            className="text-button"
            disabled={busy}
            onClick={() => perform(onLogout)}
          >
            <LogOut size={18} /> Wyloguj się z tego urządzenia
          </button>
        </>
      ) : (
        <>
          <div className="notice">
            <Smartphone size={22} />
            <p>
              Mapy i tras użyjesz bez konta. Konto włączasz, gdy chcesz
              synchronizować ustawienia lub zachować postępy w grze.
            </p>
          </div>
          {authStatus === "ready" ? (
            <>
              <a className="button primary full" href="/sign-in"><LogIn size={18} /> Zaloguj się</a>
              <a className="button secondary full" href="/sign-up">Utwórz konto</a>
              <p className="field-help">Wybierz jedną z dostępnych metod logowania. Konto obsługuje Clerk.</p>
            </>
          ) : <AuthUnavailable />}
        </>
      )}
      <a className="button secondary full" href="/gra">
        Otwórz Iskry Miasta ↗
      </a>
      <a className="button secondary full" href="/cennik">Premium i zarządzanie płatnościami</a>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
