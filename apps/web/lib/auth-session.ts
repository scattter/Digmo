const ACCESS_TOKEN_KEY = "digmo_access_token";

export function getAccessToken(): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  const token = window.localStorage.getItem(ACCESS_TOKEN_KEY);
  return token?.trim() || undefined;
}

export function setAccessToken(token: string): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(ACCESS_TOKEN_KEY, token.trim());
}

export function clearAccessToken(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
}
