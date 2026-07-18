// ─── Auth helpers ─────────────────────────────────────────────────────────────

const TOKEN_KEY     = "ftm_token";
const USER_KEY      = "ftm_user";
const WORKSPACE_KEY = "ftm_workspace";

export interface AuthUser {
  id: number;
  email: string;
  username: string;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function getStoredWorkspace(): string {
  return localStorage.getItem(WORKSPACE_KEY) ?? "";
}

export function saveAuth(token: string, user: AuthUser, workspace?: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  if (workspace) localStorage.setItem(WORKSPACE_KEY, workspace);
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(WORKSPACE_KEY);
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

/** Headers to attach to every authenticated API call */
export function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

// ─── API calls ────────────────────────────────────────────────────────────────

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface AuthResponse {
  token: string;
  user: AuthUser;
  workspace: string;
}

export async function apiLogin(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = (await res.json()) as { error?: string } & Partial<AuthResponse>;
  if (!res.ok) throw new Error(data.error ?? "Login failed");
  return data as AuthResponse;
}

export async function apiSignup(
  email: string,
  username: string,
  password: string,
): Promise<AuthResponse> {
  const res = await fetch(`${BASE}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, username, password }),
  });
  const data = (await res.json()) as { error?: string } & Partial<AuthResponse>;
  if (!res.ok) throw new Error(data.error ?? "Signup failed");
  return data as AuthResponse;
}
