import type { Challenge, ChallengeDetail, ImageAsset, Location, Profile, SearchResponse } from "./types";
import { normalizeErrorDetail } from "./errors";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8010";
const BROWSER_API_BASE = "";

function getApiBaseUrl() {
  return typeof window !== "undefined" ? BROWSER_API_BASE : API_BASE_URL;
}

export function assetUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  if (path.startsWith("/")) {
    return path;
  }
  if (typeof window !== "undefined") {
    return `${BROWSER_API_BASE}/${path}`.replace(/([^:]\/)\/+/g, "$1");
  }
  return `/${path}`.replace(/([^:]\/)\/+/g, "$1");
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
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

export async function getLocation(slug: string, token?: string): Promise<Location> {
  return request<Location>(`/api/locations/${slug}`, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
}

export async function updateLocation(
  slug: string,
  payload: {
    name?: string;
    description?: string;
    street_address?: string;
    latitude?: number;
    longitude?: number;
    visibility?: string;
    city?: string;
    region?: string;
    country?: string;
    zip_code?: string;
    approximate_latitude?: number | null;
    approximate_longitude?: number | null;
    tags?: string[];
  },
  token: string
): Promise<Location> {
  return request<Location>(`/api/locations/${slug}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export async function addImageToLocation(slug: string, formData: FormData, token: string): Promise<Location> {
  const response = await fetch(`${getApiBaseUrl()}/api/locations/${slug}/images`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(normalizeErrorDetail(data.detail, `Request failed with status ${response.status}`));
  }
  return data as Location;
}

export async function deleteLocationImage(slug: string, imageId: number, token: string): Promise<Location> {
  const response = await fetch(`${getApiBaseUrl()}/api/locations/${slug}/images/${imageId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(normalizeErrorDetail(data.detail, `Request failed with status ${response.status}`));
  }
  return data as Location;
}

export async function deleteLocation(slug: string, token: string): Promise<void> {
  const response = await fetch(`${getApiBaseUrl()}/api/locations/${slug}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(normalizeErrorDetail(data.detail, `Request failed with status ${response.status}`));
  }
}

export async function getProfiles(): Promise<Profile[]> {
  return request<Profile[]>("/api/profiles");
}

export async function getProfile(handle: string): Promise<Profile> {
  return request<Profile>(`/api/profiles/${handle}`);
}

export async function getMyProfile(token: string): Promise<Profile> {
  return request<Profile>("/api/profiles/me", { headers: { Authorization: `Bearer ${token}` } });
}

export async function updateMyProfile(
  payload: {
    display_name?: string;
    email?: string;
    bio?: string;
    base_city?: string;
    specialties?: string;
    avatar_position_x?: number;
    avatar_position_y?: number;
    avatar_scale?: number;
    website_url?: string;
    instagram_url?: string;
    licensing_available?: boolean;
    scout_for_hire?: boolean;
    hourly_rate_note?: string;
  },
  token: string
): Promise<Profile> {
  return request<Profile>("/api/profiles/me", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export async function uploadProfileAvatar(formData: FormData, token: string): Promise<Profile> {
  const response = await fetch(`${getApiBaseUrl()}/api/profiles/me/avatar`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(normalizeErrorDetail(data.detail, `Request failed with status ${response.status}`));
  }
  return data as Profile;
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
