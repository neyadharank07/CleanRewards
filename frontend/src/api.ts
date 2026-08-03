/**
 * API client — talks to the FastAPI backend at EXPO_PUBLIC_BACKEND_URL.
 * All backend routes are prefixed with `/api`.
 */
import { storage } from "./utils/storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL as string;
const TOKEN_KEY = "cleanrewards.jwt";

export async function getToken(): Promise<string | null> {
  return (await storage.getItem(TOKEN_KEY, "")) || null;
}
export async function setToken(t: string): Promise<void> {
  await storage.setItem(TOKEN_KEY, t);
}
export async function clearToken(): Promise<void> {
  await storage.removeItem(TOKEN_KEY);
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  auth = true,
): Promise<T> {
  const headers = new Headers(init.headers as any);
  if (!headers.has("Content-Type") && init.body && typeof init.body === "string") {
    headers.set("Content-Type", "application/json");
  }
  if (auth) {
    const token = await getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  const res = await fetch(`${BASE}/api${path}`, { ...init, headers });
  const text = await res.text();
  const data = text ? JSON.parse(text) : ({} as any);
  if (!res.ok) {
    const message = (data && (data.detail || data.message)) || `HTTP ${res.status}`;
    throw new Error(typeof message === "string" ? message : JSON.stringify(message));
  }
  return data as T;
}

export type User = {
  id: string;
  name: string;
  username: string;
  email: string;
  bio: string;
  profile_picture: string;
  points: number;
  total_cleanups: number;
  volunteer_hours: number;
  current_streak: number;
  badges: string[];
  created_at: string;
};

export type Mission = {
  id: string;
  title: string;
  location: string;
  lat: number;
  lng: number;
  difficulty: "easy" | "medium" | "hard";
  est_minutes: number;
  points: number;
  image_url: string;
  status: "open" | "completed";
};

export type LeaderboardRow = {
  rank: number;
  id: string;
  name: string;
  username: string;
  profile_picture: string;
  points: number;
  total_cleanups: number;
  volunteer_hours: number;
};

export type Reward = { id: string; title: string; cost: number; image: string; description: string };
export type Badge = { id: string; name: string; description: string; icon: string };

export const api = {
  signup: (body: { name: string; username: string; email: string; password: string }) =>
    request<{ access_token: string; user: User }>("/auth/signup", { method: "POST", body: JSON.stringify(body) }, false),
  login: (body: { email: string; password: string }) =>
    request<{ access_token: string; user: User }>("/auth/login", { method: "POST", body: JSON.stringify(body) }, false),
  googleLogin: (body: { email: string; name?: string; picture?: string }) =>
    request<{ access_token: string; user: User }>("/auth/google", { method: "POST", body: JSON.stringify(body) }, false),
  resetPassword: (body: { email: string; new_password: string }) =>
    request<{ ok: boolean; message: string }>("/auth/reset-password", { method: "POST", body: JSON.stringify(body) }, false),
  me: () => request<User>("/me"),
  updateMe: (body: Partial<Pick<User, "name" | "username" | "bio" | "profile_picture">>) =>
    request<User>("/me", { method: "PATCH", body: JSON.stringify(body) }),
  listMissions: () => request<Mission[]>("/missions"),
  submitCleanup: (body: {
    mission_id?: string;
    lat: number;
    lng: number;
    before_photo: string;
    after_photo: string;
    difficulty: string;
  }) =>
    request<{
      cleanup_id: string;
      verified: boolean;
      ai_result: { verified: boolean; confidence: number; reason: string };
      points_awarded: number;
      new_badges: string[];
    }>("/cleanups/submit", { method: "POST", body: JSON.stringify(body) }),
  myCleanups: () => request<any[]>("/cleanups/mine"),
  allCleanups: () => request<any[]>("/cleanups/all"),
  createReport: (body: { description: string; lat: number; lng: number; photo_base64: string }) =>
    request<{ id: string; status: string }>("/reports", { method: "POST", body: JSON.stringify(body) }),
  listReports: () => request<any[]>("/reports"),
  leaderboard: (period: "weekly" | "monthly" | "all") =>
    request<LeaderboardRow[]>(`/leaderboard?period=${period}`),
  rewards: () => request<Reward[]>("/rewards"),
  badges: () => request<Badge[]>("/badges"),
  notifications: () => request<any[]>("/notifications"),
  savePushToken: (token: string) => request<{ ok: boolean }>("/push-token", { method: "POST", body: JSON.stringify({ token }) }),
};
