import { accessToken, endClerkSession } from "./auth/session";

export class ApiRequestError extends Error {
  constructor(message: string, public readonly code: string, public readonly details?: { suggestion?: string; checkedParkings?: number }) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export async function logoutAccount(expectedUserId: string | null) {
  await api("/auth/logout", { expectedUserId });
  await endClerkSession();
}

export async function api<T>(
  path: string,
  body?: unknown,
  method?: string,
  signal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) cancel();
  else signal?.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(() => controller.abort(), 35000);
  try {
    const token = await accessToken(controller.signal);
    const response = await fetch(`/api${path}`, {
      method: method || (body === undefined ? "GET" : "POST"),
      credentials: "same-origin",
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    let data;
    try {
      data = await response.json();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw error;
      throw new Error(
        response.ok
          ? "Usługa zwróciła niepoprawną odpowiedź. Spróbuj ponownie."
          : "Usługa jest chwilowo niedostępna. Spróbuj ponownie.",
      );
    }
    if (!response.ok)
      throw new ApiRequestError(
        typeof data?.error?.message === "string"
          ? data.error.message
          : "Nie udało się pobrać danych. Spróbuj ponownie.",
        typeof data?.error?.code === "string" ? data.error.code : "",
        data?.error?.details,
      );
    return data;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError")
      throw new Error("Odpowiedź trwa zbyt długo. Spróbuj ponownie.");
    if (e instanceof TypeError)
      throw new Error(
        "Brak połączenia z usługą. Sprawdź internet i spróbuj ponownie.",
      );
    throw e;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", cancel);
  }
}
export function readLocal<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}
export function writeLocal(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
export function metres(value: number) {
  return value >= 1000
    ? `${(value / 1000).toFixed(1).replace(".", ",")} km`
    : `${Math.round(value)} m`;
}
export function dateLabel(value: string) {
  return new Date(value).toLocaleString("pl-PL", {
    day: "numeric",
    month: "short",
    ...(new Date(value).getFullYear() !== new Date().getFullYear()
      ? { year: "numeric" as const }
      : {}),
    hour: "2-digit",
    minute: "2-digit",
  });
}
