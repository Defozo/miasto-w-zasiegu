// The object is injected by Android only into the app's exact origin.
type NativePort = { postMessage: (message: string) => void; onmessage: ((event: { data: string }) => void) | null };
declare global { interface Window { MiastoNative?: NativePort } }

export function isNativeApp() { return typeof window.MiastoNative?.postMessage === 'function'; }
const pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
let connected: NativePort | undefined;
let sequence = 0;

export function nativeRequest<T = unknown>(method: string, params: unknown = {}, timeoutMs = 25_000): Promise<T> {
  const port = window.MiastoNative;
  if (!port) return Promise.reject(new Error('Ta funkcja wymaga aplikacji Android.'));
  if (connected !== port) {
    connected = port;
    port.onmessage = event => {
      try {
        const reply = JSON.parse(event.data);
        const request = pending.get(reply.id);
        if (!request) return;
        clearTimeout(request.timer); pending.delete(reply.id);
        if (reply.error) request.reject(new Error(reply.error));
        else request.resolve(reply.result);
      } catch { /* Ignore malformed or unrelated messages. */ }
    };
  }
  const id = `web-${++sequence}`;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('Telefon nie odpowiedział. Spróbuj ponownie.'));
    }, timeoutMs);
    pending.set(id, { resolve: value => resolve(value as T), reject, timer });
    try { port.postMessage(JSON.stringify({ version: 1, id, method, params })); }
    catch { clearTimeout(timer); pending.delete(id); reject(new Error('Nie udało się połączyć z telefonem.')); }
  });
}

export function invalidateNativeRoute() {
  if (isNativeApp()) void nativeRequest('guidance.invalidate').catch(() => {});
}

export async function importNativeGuestData() {
  const marker = 'przejscie-native-import-v1';
  if (localStorage.getItem(marker)) return;
  const values = await nativeRequest<Record<string, unknown>>('local.import');
  for (const key of ['przejscie-guest-presets-v1', 'przejscie-guest-favorites', 'przejscie-onboarding']) {
    if (values[key] !== undefined && localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify(values[key]));
  }
  localStorage.setItem(marker, 'done');
}
