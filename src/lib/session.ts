import type { SessionData } from "./types";

const KEY = "matrix_session";

export function saveSession(data: SessionData): void {
  localStorage.setItem(KEY, JSON.stringify(data));
}

export function loadSession(): SessionData | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SessionData) : null;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(KEY);
}
