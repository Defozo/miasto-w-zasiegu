import { SignIn, SignUp, useAuth } from '@clerk/react';
import { useEffect, useState } from 'react';
import { isNativeApp, nativeRequest } from '../native';
import { useAuthStatus, useDevelopmentAuth } from './AuthProvider';
import './auth.css';

export function AuthUnavailable() {
  return <div className="auth-unavailable">
    <p role="status">Logowanie jest obecnie niedostępne. Nadal możesz korzystać z mapy, planować trasy i zapisywać potrzeby na tym urządzeniu.</p>
    <button className="button secondary full" onClick={() => window.location.reload()}>Spróbuj ponownie</button>
  </div>;
}

function ClerkForm({ signUp }: { signUp: boolean }) {
  const { isSignedIn } = useAuth();
  const returnTo = new URLSearchParams(window.location.search).get('return_to') === '/cennik' ? '/cennik' : '/app?konto=1';
  useEffect(() => { if (isSignedIn) window.location.replace(returnTo); }, [isSignedIn, returnTo]);
  if (isSignedIn) return <p role="status">Otwieramy Twoje konto…</p>;
  return signUp
    ? <SignUp routing="path" path="/sign-up" signInUrl={`/sign-in?return_to=${encodeURIComponent(returnTo)}`} forceRedirectUrl={returnTo} />
    : <SignIn routing="path" path="/sign-in" signUpUrl={`/sign-up?return_to=${encodeURIComponent(returnTo)}`} forceRedirectUrl={returnTo} />;
}

export default function AuthPage() {
  const ready = useAuthStatus() === 'ready';
  const development = useDevelopmentAuth();
  const signUp = window.location.pathname.startsWith('/sign-up');
  return <main className="auth-page">
    <a className="auth-back" href="/app?konto=1">← Wróć do Miasta w zasięgu</a>
    <h1>{signUp ? 'Utwórz konto' : 'Zaloguj się'}</h1>
    <p className="muted">Jedno konto do Twoich potrzeb, zapisanych miejsc i Iskier Miasta.</p>
    {ready && development && <p className="field-help">To wersja demonstracyjna. Konto tworzysz na potrzeby tej wersji aplikacji Miasto w zasięgu.</p>}
    {ready ? (isNativeApp() ? <NativeSignIn signUp={signUp} /> : <ClerkForm signUp={signUp} />) : <AuthUnavailable />}
    <a className="auth-back" href="/app">Korzystaj bez konta</a>
  </main>;
}

function NativeSignIn({ signUp }: { signUp: boolean }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function signIn() {
    setBusy(true); setError('');
    try {
      await nativeRequest('auth.signIn', { register: signUp }, 180_000);
      const returnTo = new URLSearchParams(window.location.search).get('return_to') === '/cennik' ? '/cennik' : '/app?konto=1';
      window.location.replace(returnTo);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <div>
    <p>Kontynuuj w przeglądarce systemowej. Po zalogowaniu wrócisz do aplikacji.</p>
    <button className="button primary full" disabled={busy} onClick={signIn}>{busy ? 'Oczekujemy na logowanie…' : signUp ? 'Utwórz konto' : 'Zaloguj się'}</button>
    {error && <p className="error-box" role="alert">{error}</p>}
  </div>;
}
