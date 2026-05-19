import type { Challenge, ChallengeDetail, ImageAsset, Location, Profile, SearchResponse } from "./types";
import { normalizeErrorDetail } from "./errors";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
const BROWSER_API_BASE = "";

export function assetUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  if (typeof window !== "undefined") {
    return `${BROWSER_API_BASE}${path}`;
  }
  return `${API_BASE_URL}${path}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const baseUrl = typeof window !== "undefined" ? BROWSER_API_BASE : API_BASE_URL;
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {})
    }
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(normalizeErrorDetail(data.detail, `Request failed with status ${response.status}`));
  }

  return response.json() as Promise<T>;
}

export async function getLocations(): Promise<Location[]> {
  return request<Location[]>("/api/locations");
}

export async function getLocation(slug: string): Promise<Location> {
  return request<Location>(`/api/locations/${slug}`);
}

export async function getProfiles(): Promise<Profile[]> {
  return request<Profile[]>("/api/profiles");
}

export async function getProfile(handle: string): Promise<Profile> {
  return request<Profile>(`/api/profiles/${handle}`);
}

export async function getChallenges(): Promise<Challenge[]> {
  return request<Challenge[]>("/api/challenges");
}

export async function getChallenge(slug: string): Promise<ChallengeDetail> {
  return request<ChallengeDetail>(`/api/challenges/${slug}`);
}

export async function getImage(id: string): Promise<ImageAsset> {
  return request<ImageAsset>(`/api/images/${id}`);
}

export async function searchAll(query: string, filters?: Record<string, string | boolean | undefined>): Promise<SearchResponse> {
  const params = new URLSearchParams({ q: query });
  Object.entries(filters || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  });
  return request<SearchResponse>(`/api/search?${params.toString()}`);
}

export async function getCurrentUser(token: string): Promise<{ id: number; email: string; role: string; is_active: boolean; handle?: string | null }> {
  return request("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } });
}
