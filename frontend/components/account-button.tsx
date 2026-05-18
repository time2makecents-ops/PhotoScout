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

export function AccountButton() {
  const [mounted, setMounted] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    setToken(getStoredToken());
  }, []);

  useEffect(() => {
    function syncToken() {
      setToken(getStoredToken());
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
  }, [mounted, token]);

  if (!mounted || !token) {
    return (
      <Link href="/login" className="account-button account-button-link">
        Log in
      </Link>
    );
  }

  const avatarImage = profile?.uploaded_images?.[0]?.source_url;
  const label = getFallbackLabel(profile, email);

  return (
    <Link href="/profile" className="account-button account-button-avatar" aria-label="Open profile settings">
      {avatarImage ? (
        <img className="account-avatar-image" src={assetUrl(avatarImage)} alt={profile?.display_name || "Profile avatar"} />
      ) : (
        <span className="account-avatar-fallback">{label}</span>
      )}
    </Link>
  );
}
