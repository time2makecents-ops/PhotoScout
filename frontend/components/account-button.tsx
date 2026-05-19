"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { assetUrl, getCurrentUser, getProfile } from "@/lib/api";
import { getStoredToken } from "@/lib/auth";
import type { Profile } from "@/lib/types";

function getFallbackLabel(profile: Profile | null, email?: string | null) {
  const source = profile?.display_name || profile?.handle || email || "Profile";
  return source.trim().slice(0, 1).toUpperCase();
}

function avatarDisplayUrl(profile: Profile | null) {
  const avatarImage = profile?.avatar_url || profile?.uploaded_images?.[0]?.source_url;
  if (!avatarImage) {
    return null;
  }
  const base = assetUrl(avatarImage);
  if (!profile?.updated_at) {
    return base;
  }
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}v=${encodeURIComponent(profile.updated_at)}`;
}

export function AccountButton() {
  const [mounted, setMounted] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    setMounted(true);
    setToken(getStoredToken());
  }, []);

  useEffect(() => {
    function syncToken() {
      setToken(getStoredToken());
      setRefreshTick((current) => current + 1);
    }

    window.addEventListener("photoscout-auth-changed", syncToken);
    window.addEventListener("storage", syncToken);
    return () => {
      window.removeEventListener("photoscout-auth-changed", syncToken);
      window.removeEventListener("storage", syncToken);
    };
  }, []);

  useEffect(() => {
    if (!mounted || !token) {
      setProfile(null);
      setEmail(null);
      return;
    }

    let cancelled = false;
    const currentToken = token;

    async function loadProfile() {
      try {
        const me = await getCurrentUser(currentToken);
        if (!me.handle || cancelled) {
          return;
        }
        setEmail(me.email);
        const current = await getProfile(me.handle);
        if (!cancelled) {
          setProfile(current);
        }
      } catch {
        if (!cancelled) {
          setProfile(null);
          setEmail(null);
        }
      }
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [mounted, token, refreshTick]);

  if (!mounted || !token) {
    return (
      <Link href="/login" className="account-button account-button-link">
        Log in
      </Link>
    );
  }

  const avatarImage = avatarDisplayUrl(profile);
  const label = getFallbackLabel(profile, email);

  return (
    <Link href="/profile" className="account-button account-button-avatar" aria-label="Open profile settings">
      {avatarImage ? (
        <img
          className="account-avatar-image"
          src={assetUrl(avatarImage)}
          alt={profile?.display_name || "Profile avatar"}
          style={{
            transform: `translate(${(profile?.avatar_position_x ?? 50) - 50}%, ${(profile?.avatar_position_y ?? 50) - 50}%) scale(${profile?.avatar_scale ?? 1})`
          }}
        />
      ) : (
        <span className="account-avatar-fallback">{label}</span>
      )}
    </Link>
  );
}
