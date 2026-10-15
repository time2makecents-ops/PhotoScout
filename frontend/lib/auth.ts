export const AUTH_STORAGE_KEY = "photoscout_token";
export const AUTH_SESSION_STORAGE_KEY = "photoscout_session_token";

export function getStoredToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(AUTH_STORAGE_KEY) || window.sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY);
}

export function setStoredToken(token: string, remember = true): void {
  if (remember) {
    window.localStorage.setItem(AUTH_STORAGE_KEY, token);
    window.sessionStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
  } else {
    window.sessionStorage.setItem(AUTH_SESSION_STORAGE_KEY, token);
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  }
  window.dispatchEvent(new Event("photoscout-auth-changed"));
}

export function clearStoredToken(): void {
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
  window.sessionStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
  window.dispatchEvent(new Event("photoscout-auth-changed"));
}

export async function ensureLocalSession(): Promise<string> {
  const existingToken = getStoredToken();
  if (existingToken) {
    return existingToken;
  }

  const response = await fetch("/api/auth/guest", { method: "POST" });
  if (!response.ok) {
    throw new Error("Could not start a local test session.");
  }
  const data = await response.json() as { token: string };
  setStoredToken(data.token);
  return data.token;
}
