import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { setBaseUrl, setAuthTokenGetter as setGeneratedAuthTokenGetter } from "@workspace/api-client-react";

const TOKEN_KEY = "ubuntusafe.auth.token";

function readToken() {
  return Platform.OS === "web"
    ? AsyncStorage.getItem(TOKEN_KEY)
    : SecureStore.getItemAsync(TOKEN_KEY);
}

function writeToken(token: string) {
  return Platform.OS === "web"
    ? AsyncStorage.setItem(TOKEN_KEY, token)
    : SecureStore.setItemAsync(TOKEN_KEY, token);
}

function removeToken() {
  return Platform.OS === "web"
    ? AsyncStorage.removeItem(TOKEN_KEY)
    : SecureStore.deleteItemAsync(TOKEN_KEY);
}

function getLanApiUrl() {
  const hostUri = Constants.expoConfig?.hostUri;
  if (!hostUri) return "";
  try {
    const value = /^[a-z][a-z\d+.-]*:\/\//i.test(hostUri)
      ? hostUri
      : `http://${hostUri}`;
    const hostname = new URL(value).hostname;
    if (
      !hostname ||
      hostname === "localhost" ||
      hostname === "::1" ||
      hostname.startsWith("127.")
    )
      return "";
    return `http://${hostname}:8080`;
  } catch {
    return "";
  }
}

function resolveApiUrl() {
  const configuredUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (configuredUrl) return configuredUrl.replace(/\/$/, "");
  const workspaceDomain = process.env.EXPO_PUBLIC_DOMAIN?.trim();
  if (workspaceDomain) return `https://${workspaceDomain}`.replace(/\/$/, "");
  return getLanApiUrl();
}

const API_URL = resolveApiUrl();
setBaseUrl(API_URL || null);
setGeneratedAuthTokenGetter(() => tokenGetter());

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
        "UbuntuSafe could not find the API address automatically. Start Expo in LAN mode on the computer running the API, connect the phone to the same reachable network, or set EXPO_PUBLIC_API_URL manually.",
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

let tokenGetter: () => Promise<string | null> = readToken;

export function setAuthTokenGetter(getter: () => Promise<string | null>) {
  tokenGetter = getter;
}
export const getAuthToken = () => tokenGetter();
export const saveAuthToken = (token: string) => writeToken(token);
export const clearAuthToken = () => removeToken();

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await tokenGetter();
  const controller = new AbortController();
  const isAnalysis = ["/scan", "/audio/transcribe", "/screen/ocr"].includes(path);
  const isEmailRequest = path === "/auth/register" || path === "/auth/forgot-password";
  const timeout = setTimeout(() => controller.abort(), isAnalysis ? 60000 : isEmailRequest ? 30000 : 5000);
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
          `UbuntuSafe could not reach the API at "${displayUrl}". Check that the API is running on the computer, the phone and computer share a reachable network, and Windows Firewall allows port 8080. If automatic LAN detection is unavailable, configure EXPO_PUBLIC_API_URL and restart Expo.`,
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
    const body = await response.json().catch(() => null);
    const error = new Error(
      body?.message ??
        `Request failed (${response.status})`,
    ) as Error & { status: number; code?: string; fieldErrors?: Record<string, string> };
    error.status = response.status;
    error.code = body?.code;
    error.fieldErrors = body?.fieldErrors;
    throw error;
  }
  return response.status === 204
    ? (undefined as T)
    : (response.json() as Promise<T>);
}
