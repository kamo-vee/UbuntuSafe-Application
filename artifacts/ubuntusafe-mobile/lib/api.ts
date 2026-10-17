import * as SecureStore from "expo-secure-store";

const API_URL = (
  process.env.EXPO_PUBLIC_API_URL ??
  `https://${process.env.EXPO_PUBLIC_DOMAIN ?? ""}`
).replace(/\/$/, "");
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
        const connectionError = new Error(
          `UbuntuSafe could not complete the request to "${API_URL}". Check that the API is running and that this device can open "${API_URL}/api/healthz". On a physical Android phone, use your computer's Wi-Fi IPv4 address in EXPO_PUBLIC_API_URL, not localhost, then restart Expo.`,
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
