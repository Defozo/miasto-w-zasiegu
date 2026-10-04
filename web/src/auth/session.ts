type TokenProvider = () => Promise<string | null>;
let tokenProvider: TokenProvider | null = null;
let signOutProvider: (() => Promise<void>) | null = null;

// Tokens are obtained from the SDK for each request, never copied to localStorage.
export function connectAuth(getToken: TokenProvider, signOut: () => Promise<void>) {
  tokenProvider = getToken;
  signOutProvider = signOut;
  return () => {
    if (tokenProvider === getToken) {
      tokenProvider = null;
      signOutProvider = null;
    }
  };
}

export async function accessToken(signal: AbortSignal): Promise<string | null> {
  if (!tokenProvider) return null;
  let abort: () => void = () => {};
  const cancelled = new Promise<never>((_, reject) => {
    abort = () => reject(new DOMException('Aborted', 'AbortError'));
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
  try { return await Promise.race([tokenProvider(), cancelled]); }
  finally { signal.removeEventListener('abort', abort); }
}

export async function endClerkSession() { await signOutProvider?.(); }
