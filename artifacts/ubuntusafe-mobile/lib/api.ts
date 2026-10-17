import * as SecureStore from "expo-secure-store";

const API_URL = (
  process.env.EXPO_PUBLIC_API_URL ??
  `https://${process.env.EXPO_PUBLIC_DOMAIN ?? ""}`
).replace(/\/$/, "");

export type ApiHealthResult = {
  apiUrl: string;
  status:
    | "healthy"
    | "database_unavailable"
    | "unreachable"
    | "api_error"
    | "not_configured";
  message: string;
};

function getSafeApiUrl(): string | null {
  if (!API_URL) return null;
  try {
    const url = new URL(API_URL);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname) {
      return null;
    }
    return `${url.protocol}//${url.host}${url.pathname}`.replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function getApiUrlForDisplay(): string {
  return getSafeApiUrl() ?? (API_URL ? "Invalid API URL" : "Not configured");
}

export async function checkApiHealth(): Promise<ApiHealthResult> {
  const apiUrl = getSafeApiUrl();
  if (!apiUrl) {
    return {
      apiUrl: getApiUrlForDisplay(),
      status: "not_configured",
      message:
        "No valid API URL is configured. Set EXPO_PUBLIC_API_URL and restart the app.",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${apiUrl}/api/healthz`, {
      method: "GET",
      signal: controller.signal,
    });
    const body = (await response.json().catch(() => null)) as {
      status?: unknown;
      database?: unknown;
    } | null;

    if (body?.database === "unavailable") {
      return {
        apiUrl,
        status: "database_unavailable",
        message:
          "The API is running, but it cannot reach PostgreSQL. Start or check the database, then restart the API.",
      };
    }
    if (response.ok && body?.status === "ok" && body?.database === "ok") {
      return {
        apiUrl,
        status: "healthy",
        message: "The API and database are responding.",
      };
    }
    return {
      apiUrl,
      status: "api_error",
      message:
        response.status === 404
          ? "The server responded, but /api/healthz was not found. Check that this URL points to the UbuntuSafe API."
          : `The API responded with HTTP ${response.status}, but did not report a healthy connection.`,
    };
  } catch {
    let isLoopback = false;
    try {
      const hostname = new URL(apiUrl).hostname.toLowerCase();
      isLoopback =
        hostname === "localhost" ||
        hostname === "::1" ||
        hostname.startsWith("127.");
    } catch {
      // The URL was already validated above; keep failures non-sensitive.
    }

    return {
      apiUrl,
      status: "unreachable",
      message: isLoopback
        ? "This address points to the phone itself, not your laptop. Use the laptop's Wi-Fi IPv4 address. If the API is not running on the laptop, start it first."
        : "No response from the API. It may be stopped; if it is running, the phone cannot reach the laptop at this address. Check that both are on the same Wi-Fi and that Windows Firewall allows the API.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

const TOKEN_KEY = "ubuntusafe.auth.token";
let tokenGetter: () => Promise<string | null> = () =>
  SecureStore.getItemAsync(TOKEN_KEY);

export function setAuthTokenGetter(getter: () => Promise<string | null>) {
  tokenGetter = getter;
}
export const getAuthToken = () => tokenGetter();
export const saveAuthToken = (token: string) =>
  SecureStore.setItemAsync(TOKEN_KEY, token);
export const clearAuthToken = () => SecureStore.deleteItemAsync(TOKEN_KEY);

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await tokenGetter();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  let response: Response;
  try {
    try {
      response = await fetch(`${API_URL}/api${path}`, {
        ...init,
        signal: init.signal ?? controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(init.headers ?? {}),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        error instanceof TypeError ||
        (error instanceof Error && error.name === "AbortError") ||
        /fetch failed|network request failed|request.{0,20}cancel(?:led|ed)/i.test(
          message,
        )
      ) {
        const displayUrl = getApiUrlForDisplay();
        const connectionError = new Error(
          `UbuntuSafe could not complete the request to "${displayUrl}". Check that the API is running and that this device can open "${displayUrl}/api/healthz". On a physical Android phone, use your computer's Wi-Fi IPv4 address in EXPO_PUBLIC_API_URL, not localhost, then restart Expo.`,
        );
        connectionError.name = "NetworkError";
        throw connectionError;
      }
      throw error;
    }
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    const error = new Error(
      (await response.json().catch(() => null))?.message ??
        `Request failed (${response.status})`,
    ) as Error & { status: number };
    error.status = response.status;
    throw error;
  }
  return response.status === 204
    ? (undefined as T)
    : (response.json() as Promise<T>);
}
