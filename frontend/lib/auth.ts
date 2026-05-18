export const AUTH_STORAGE_KEY = "photoscout_token";

export function getStoredToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(AUTH_STORAGE_KEY);
}

export function setStoredToken(token: string): void {
  window.localStorage.setItem(AUTH_STORAGE_KEY, token);
  window.dispatchEvent(new Event("photoscout-auth-changed"));
}

export function clearStoredToken(): void {
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
  window.dispatchEvent(new Event("photoscout-auth-changed"));
}
