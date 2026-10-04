export class PassportApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "PassportApiError";
  }
}

export async function passportRequest<T>(
  path: string,
  options: {
    body?: unknown;
    method?: "GET" | "POST" | "PUT";
    public?: boolean;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timeout = window.setTimeout(abort, 20000);
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  try {
    let token: string | null = null;
    if (!options.public) {
      const { accessToken } = await import("../auth/session");
      token = await accessToken(controller.signal);
    }
    const response = await fetch(`/api${path}`, {
      method: options.method ?? (options.body === undefined ? "GET" : "POST"),
      credentials: options.public ? "omit" : "same-origin",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        ...(options.body === undefined
          ? {}
          : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new PassportApiError(
        data?.error?.message ??
          "Nie udało się pobrać danych obiektu. Spróbuj ponownie.",
        data?.error?.code ?? "REQUEST_FAILED",
        response.status,
      );
    }
    if (!data)
      throw new Error("Odpowiedź usługi jest niepełna. Spróbuj ponownie.");
    return data as T;
  } catch (error) {
    if (options.signal?.aborted) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Odpowiedź trwa zbyt długo. Spróbuj ponownie.");
    }
    if (error instanceof TypeError) {
      throw new Error("Brak połączenia. Sprawdź internet i spróbuj ponownie.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abort);
  }
}

export function passportDate(value: string | null | undefined) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Nie podano";
  return new Date(value).toLocaleString("pl-PL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Warsaw",
  });
}

export function safeSourceUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export function planningUrl(placeId: string, entranceId?: string) {
  const params = new URLSearchParams({ place: placeId });
  if (entranceId) params.set("entrance", entranceId);
  return `/app?${params}`;
}
