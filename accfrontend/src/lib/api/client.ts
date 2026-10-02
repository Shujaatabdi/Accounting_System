import { ApiError } from "./errors";

const TOKEN_KEY = "acc_token";

export function apiBase() {
  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
}

export function getToken() {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${apiBase()}${path}`, { ...options, headers });
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  const body = text ? JSON.parse(text) as { error?: { message?: string; code?: string } } : {};
  if (!response.ok) {
    throw new ApiError(body.error?.message || "Request failed.", response.status, body.error?.code);
  }
  return body as T;
}

export async function downloadCsv(path: string, filename: string) {
  const headers = new Headers();
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${apiBase()}${path}`, { headers });
  if (!response.ok) throw new ApiError("Export failed.", response.status);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export { ApiError };
