import { createContext, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { ClerkProvider, useAuth, useClerk } from '@clerk/react';
import { plPL } from '@clerk/localizations';
import { connectAuth } from './session';
import { isNativeApp, nativeRequest, importNativeGuestData } from '../native';

type AuthStatus = 'loading' | 'ready' | 'unavailable';
const AuthStatusContext = createContext<AuthStatus>('unavailable');
export const useAuthStatus = () => useContext(AuthStatusContext);
const DevelopmentAuthContext = createContext(false);
export const useDevelopmentAuth = () => useContext(DevelopmentAuthContext);
const polishLocalization = {
  ...plPL,
  formFieldInput__emailAddress_format: 'Przykładowy adres: nazwa@przyklad.pl',
};
type Config = { provider: string; configured: boolean; publishableKey: string | null };

function Loading() {
  return <div className="boot-screen" role="status"><span className="brand-mark">↗</span><p>Otwieramy Miasto w zasięgu…</p></div>;
}

function SessionBridge({ children }: { children: ReactNode }) {
  const { isLoaded, userId, getToken } = useAuth();
  const clerk = useClerk();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timeout = window.setTimeout(() => setSlow(true), 8000);
    return () => window.clearTimeout(timeout);
  }, []);
  useLayoutEffect(() => connectAuth(
    async () => {
      if (!isLoaded) return null;
      try {
        const token = await getToken();
        if (userId && !token) throw new Error('Missing session token');
        return token;
      } catch { throw new Error('Nie udało się potwierdzić sesji. Sprawdź połączenie i spróbuj ponownie.'); }
    },
    async () => { await clerk.signOut(); },
  ), [clerk, getToken, isLoaded, userId]);
  if (!isLoaded && !slow) return <Loading />;
  // A new identity remounts private views so previous-account data never flashes.
  return <AuthStatusContext.Provider value={isLoaded ? 'ready' : 'unavailable'} key={userId ?? 'guest'}>
    {children}
  </AuthStatusContext.Provider>;
}

function NativeAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<{ ready: boolean; userId: string | null } | null>(null);
  useEffect(() => {
    let active = true;
    const refresh = () => importNativeGuestData().catch(() => { /* Retry local migration on next launch. */ })
      .then(() => nativeRequest<{ ready: boolean; userId: string | null }>('auth.status'))
      .then(value => { if (active) setSession(value); })
      .catch(() => { if (active) setSession({ ready: false, userId: null }); });
    void refresh();
    window.addEventListener('miasto-auth-changed', refresh);
    return () => { active = false; window.removeEventListener('miasto-auth-changed', refresh); };
  }, []);
  useLayoutEffect(() => connectAuth(
    () => nativeRequest<string | null>('auth.token', { userId: session?.userId ?? null }),
    async () => { await nativeRequest('auth.signOut'); window.dispatchEvent(new Event('miasto-auth-changed')); },
  ), [session?.userId]);
  if (!session) return <Loading />;
  return <AuthStatusContext.Provider key={session.userId ?? 'guest'} value={session.ready ? 'ready' : 'unavailable'}>{children}</AuthStatusContext.Provider>;
}

export default function AuthProvider({ children }: { children: ReactNode }) {
  return isNativeApp() ? <NativeAuthProvider>{children}</NativeAuthProvider> : <BrowserAuthProvider>{children}</BrowserAuthProvider>;
}

function BrowserAuthProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    fetch('/api/auth/config', { signal: controller.signal, cache: 'no-store', credentials: 'same-origin' })
      .then(async response => { if (!response.ok) throw new Error(); return response.json() as Promise<Config>; })
      .then(value => { if (active) setConfig(value); })
      .catch(() => { /* Public map and local preferences remain available. */ })
      .finally(() => { if (active) setLoading(false); window.clearTimeout(timeout); });
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); };
  }, []);
  if (loading) return <Loading />;
  if (!config?.configured || config.provider !== 'clerk' || !config.publishableKey)
    return <AuthStatusContext.Provider value="unavailable">{children}</AuthStatusContext.Provider>;
  return <ClerkProvider publishableKey={config.publishableKey} localization={polishLocalization}
    signInUrl="/sign-in" signUpUrl="/sign-up" signInFallbackRedirectUrl="/app?konto=1" signUpFallbackRedirectUrl="/app?konto=1"
    appearance={{ variables: { colorPrimary: '#173c32', colorForeground: '#173c32', colorMutedForeground: '#4d655e', colorBackground: '#ffffff', borderRadius: '0.75rem' } }}>
    <DevelopmentAuthContext.Provider value={config.publishableKey.startsWith('pk_test_')}>
      <SessionBridge>{children}</SessionBridge>
    </DevelopmentAuthContext.Provider>
  </ClerkProvider>;
}
