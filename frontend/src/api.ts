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
  is_admin: boolean;
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
  source?: "seeded" | "admin" | "robot";
  robot_id?: string;
  detection_id?: string;
  confidence?: number;
  size?: "small" | "medium" | "large" | "multi";
  expires_at?: string;
  claimed_by?: string;
  claimed_until?: string;
};

export type Robot = {
  id: string; name: string; city: string;
  notify_radius_miles: number;
  battery: number; connected: boolean; online?: boolean;
  lat: number | null; lng: number | null;
  last_seen: string;
  total_detections: number; missions_generated: number;
  created_at: string;
  api_key?: string; // returned only on registration
};

export type RobotDetection = {
  id: string; robot_id: string; lat: number; lng: number;
  confidence: number; size: string; object_count: number;
  ai_objects: { label: string; confidence: number }[];
  ai_size: string; created_at: string;
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
  sessionExchange: (session_id: string) =>
    request<{ session_token: string; user: User }>("/auth/session", { method: "POST", body: JSON.stringify({ session_id }) }, false),
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
  registerPush: (body: { user_id: string; platform: string; device_token: string }) =>
    request<{ status: string }>("/register-push", { method: "POST", body: JSON.stringify(body) }, false),

  // Redemptions (user)
  createRedemption: (reward_id: string) =>
    request<{ id: string; status: string; cost: number }>("/redemptions", { method: "POST", body: JSON.stringify({ reward_id }) }),
  myRedemptions: () => request<Redemption[]>("/redemptions/mine"),

  // Admin
  adminStats: () => request<AdminStats>("/admin/stats"),
  adminListCleanups: (status?: string) =>
    request<any[]>(`/admin/cleanups${status ? `?status=${status}` : ""}`),
  adminReviewCleanup: (id: string, approved: boolean, note = "") =>
    request<{ ok: boolean }>(`/admin/cleanups/${id}/review`, { method: "POST", body: JSON.stringify({ approved, note }) }),
  adminCreateMission: (body: {
    title: string; location: string; lat: number; lng: number;
    difficulty: string; est_minutes: number; points: number; image_url?: string;
  }) => request<Mission>("/admin/missions", { method: "POST", body: JSON.stringify(body) }),
  adminDeleteMission: (id: string) => request<{ ok: boolean }>(`/admin/missions/${id}`, { method: "DELETE" }),
  adminCreateReward: (body: { title: string; cost: number; image: string; description: string }) =>
    request<Reward>("/admin/rewards", { method: "POST", body: JSON.stringify(body) }),
  adminDeleteReward: (id: string) => request<{ ok: boolean }>(`/admin/rewards/${id}`, { method: "DELETE" }),
  adminListRedemptions: (status?: string) =>
    request<any[]>(`/admin/redemptions${status ? `?status=${status}` : ""}`),
  adminFulfillRedemption: (id: string, code?: string) =>
    request<{ ok: boolean; code?: string }>(`/admin/redemptions/${id}/fulfill${code ? `?code=${encodeURIComponent(code)}` : ""}`, { method: "POST" }),
  adminRejectRedemption: (id: string, note = "") =>
    request<{ ok: boolean }>(`/admin/redemptions/${id}/reject?note=${encodeURIComponent(note)}`, { method: "POST" }),
  adminListUsers: () => request<any[]>("/admin/users"),
  adminToggleAdmin: (id: string) => request<{ ok: boolean; is_admin: boolean }>(`/admin/users/${id}/toggle-admin`, { method: "POST" }),

  // Robots — admin
  adminRegisterRobot: (body: { name: string; city: string; notify_radius_miles: number }) =>
    request<Robot>("/admin/robots", { method: "POST", body: JSON.stringify(body) }),
  adminListRobots: () => request<Robot[]>("/admin/robots"),
  adminGetRobot: (id: string) =>
    request<Robot & { detections: RobotDetection[]; patrols: any[] }>(`/admin/robots/${id}`),
  adminDeleteRobot: (id: string) => request<{ ok: boolean }>(`/admin/robots/${id}`, { method: "DELETE" }),
  adminSimulateDetection: (id: string) =>
    request<{ ok: boolean; detection_id: string; mission_id: string; size: string; points: number }>(
      `/admin/robots/${id}/simulate-detection`,
      { method: "POST" },
    ),

  // Mission claims — user
  claimMission: (id: string) => request<{ ok: boolean; reserved_until: string }>(`/missions/${id}/claim`, { method: "POST" }),
  releaseMission: (id: string) => request<{ ok: boolean }>(`/missions/${id}/release`, { method: "POST" }),
  myClaimedMissions: () => request<Mission[]>("/missions/mine-claimed"),
};

export type Redemption = {
  id: string; reward_id: string; reward_title: string; cost: number;
  status: "pending" | "fulfilled" | "rejected"; code: string; note: string;
  created_at: string; fulfilled_at?: string; rejected_at?: string;
};

export type AdminStats = {
  users: number; missions: number; cleanups: number;
  verified_cleanups: number; pending_review: number;
  reports: number; pending_redemptions: number;
  total_points_awarded: number;
  robots?: number;
  robot_detections?: number;
};
