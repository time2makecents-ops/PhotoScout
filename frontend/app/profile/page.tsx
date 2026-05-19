"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";

import { clearStoredToken, getStoredToken, setStoredToken } from "@/lib/auth";
import { assetUrl, getCurrentUser, getLocations, getMyProfile, getProfile } from "@/lib/api";
import { normalizeErrorDetail } from "@/lib/errors";
import type { Location, Profile } from "@/lib/types";

function LoginPanel({ onSignedIn }: { onSignedIn: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(event.currentTarget);

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        password: form.get("password")
      })
    });

    const data = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) {
      setError(normalizeErrorDetail(data.detail, "Login failed."));
      return;
    }

    setStoredToken(data.token);
    onSignedIn();
  }

  return (
    <div className="panel" style={{ maxWidth: 560, margin: "0 auto" }}>
      <span className="eyebrow">Sign in</span>
      <h2>Welcome back</h2>
      <p className="subtle">Sign in to edit your profile, upload locations, and manage your listings.</p>
      <form className="form" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        {error ? <p className="status">{error}</p> : null}
        <button type="submit">{loading ? "Signing in..." : "Sign in"}</button>
      </form>
      <p className="subtle" style={{ marginTop: "0.9rem" }}>
        Don&apos;t have a profile yet? <Link href="/signup">Create one</Link>
      </p>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense
      fallback={
        <section className="section">
          <div className="panel">
            <h2>Loading profile...</h2>
          </div>
        </section>
      }
    >
      <ProfileContent />
    </Suspense>
  );
}

function ProfileContent() {
  const params = useSearchParams();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState<string>("");
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [fallbackLocations, setFallbackLocations] = useState<Location[]>([]);
  const createdLocations = profile?.created_locations ?? [];

  async function loadCurrentProfile(token: string) {
    setLoadingProfile(true);
    try {
      const me = await getCurrentUser(token);
      if (!me.handle) {
        setProfile(null);
        setStatus("Sign in to edit your profile, then create one from the signup screen if needed.");
        setIsOwnProfile(false);
        return;
      }
      const nextProfile = await getMyProfile(token);
      setProfile(nextProfile);
      setStatus("");
      setIsOwnProfile(true);
    } catch (error) {
      setProfile(null);
      setStatus(error instanceof Error ? error.message : "Unable to load profile.");
      setIsOwnProfile(false);
    } finally {
      setLoadingProfile(false);
    }
  }

  useEffect(() => {
    function syncToken() {
      const token = getStoredToken();
      setHasToken(Boolean(token));
      if (token && !params.get("handle")) {
        void loadCurrentProfile(token);
      } else {
        setProfile(null);
        setIsOwnProfile(false);
        setStatus("");
      }
    }

    syncToken();
    window.addEventListener("photoscout-auth-changed", syncToken);
    window.addEventListener("storage", syncToken);

    return () => {
      window.removeEventListener("photoscout-auth-changed", syncToken);
      window.removeEventListener("storage", syncToken);
    };
  }, []);

  useEffect(() => {
    async function loadByHandle() {
      const handle = params.get("handle");
      if (!handle) {
        return;
      }
      setLoadingProfile(true);
      try {
        setProfile(await getProfile(handle));
        setStatus("");
        setIsOwnProfile(false);
      } catch (error) {
        setProfile(null);
        setStatus(error instanceof Error ? error.message : "Unable to load profile.");
        setIsOwnProfile(false);
      } finally {
        setLoadingProfile(false);
      }
    }

    void loadByHandle();
  }, [params]);

  useEffect(() => {
    async function loadFallbackLocations() {
      if (!profile?.handle) {
        return;
      }
      try {
        const allLocations = await getLocations();
        setFallbackLocations(allLocations.filter((location) => location.creator_handle === profile.handle));
      } catch {
        setFallbackLocations([]);
      }
    }

    void loadFallbackLocations();
  }, [createdLocations.length, profile?.handle]);

  const displayedCreatedLocations = [
    ...createdLocations,
    ...fallbackLocations.filter((location) => !createdLocations.some((createdLocation) => createdLocation.id === location.id))
  ];

  function logout() {
    clearStoredToken();
    setHasToken(false);
    setProfile(null);
    setIsOwnProfile(false);
    setStatus("");
    router.replace("/profile");
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = getStoredToken();
    if (!token || !profile) {
      return;
    }
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/profiles/me", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        display_name: form.get("display_name"),
        bio: form.get("bio"),
        base_city: form.get("base_city"),
        specialties: form.get("specialties"),
        website_url: form.get("website_url"),
        instagram_url: form.get("instagram_url"),
        licensing_available: form.get("licensing_available") === "on",
        scout_for_hire: form.get("scout_for_hire") === "on",
        hourly_rate_note: form.get("hourly_rate_note")
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus(normalizeErrorDetail(data.detail, "Unable to save profile."));
      return;
    }
    setProfile(data);
    setStatus("Profile updated.");
  }

  return (
    <section className="section">
      <div className="panel">
        <span className="eyebrow">Profile</span>
        <h2>{profile ? profile.display_name : "Your account"}</h2>

        {!profile ? (
          <>
            {hasToken ? (
              <p className="subtle">Loading your profile...</p>
            ) : (
              <LoginPanel onSignedIn={() => loadCurrentProfile(getStoredToken() || "")} />
            )}
            {loadingProfile ? <p className="status">Loading profile...</p> : null}
            {status ? <p className="status">{status}</p> : null}
          </>
        ) : (
          <>
            <p>{profile.bio || "No bio added yet."}</p>
            <div className="pill-row">
              <span className="pill">@{profile.handle}</span>
              <span className="pill">{profile.base_city || "Location not set"}</span>
              {profile.licensing_available ? <span className="pill">Licensing available</span> : null}
              {profile.scout_for_hire ? <span className="pill">Scout for hire</span> : null}
            </div>
            <div className="section">
              <h3>Specialties</h3>
              <p>{profile.specialties || "No specialties added yet."}</p>
            </div>
            <div className="pill-row" style={{ marginBottom: "1rem" }}>
              {isOwnProfile ? (
                <button type="button" className="secondary" onClick={logout}>
                  Log out
                </button>
              ) : null}
            </div>
            {isOwnProfile ? (
              <form className="form section" onSubmit={saveProfile}>
                <h3>Edit profile</h3>
                <div className="field">
                  <label htmlFor="display_name">Display name</label>
                  <input id="display_name" name="display_name" defaultValue={profile.display_name} />
                </div>
                <div className="field">
                  <label htmlFor="bio">Bio</label>
                  <textarea id="bio" name="bio" defaultValue={profile.bio} />
                </div>
                <div className="field">
                  <label htmlFor="base_city">Base city</label>
                  <input id="base_city" name="base_city" defaultValue={profile.base_city} />
                </div>
                <div className="field">
                  <label htmlFor="specialties">Specialties</label>
                  <input id="specialties" name="specialties" defaultValue={profile.specialties} />
                </div>
                <div className="field">
                  <label htmlFor="website_url">Website URL</label>
                  <input id="website_url" name="website_url" defaultValue={profile.website_url || ""} />
                </div>
                <div className="field">
                  <label htmlFor="instagram_url">Instagram URL</label>
                  <input id="instagram_url" name="instagram_url" defaultValue={profile.instagram_url || ""} />
                </div>
                <div className="field">
                  <label htmlFor="hourly_rate_note">Hourly or day rate note</label>
                  <input id="hourly_rate_note" name="hourly_rate_note" defaultValue={profile.hourly_rate_note || ""} />
                </div>
                <label>
                  <input type="checkbox" name="licensing_available" defaultChecked={profile.licensing_available} /> Licensing available
                </label>
                <label>
                  <input type="checkbox" name="scout_for_hire" defaultChecked={profile.scout_for_hire} /> Scout for hire
                </label>
                <button type="submit">Save profile</button>
                {status ? <p className="status">{status}</p> : null}
              </form>
            ) : null}
            {profile.scout_services.length ? (
              <div className="cards-2">
                {profile.scout_services.map((service) => (
                  <div key={service.id} className="card">
                    <h3>{service.title}</h3>
                    <p>{service.description}</p>
                    <div className="pill-row">
                      <span className="pill">{service.regions_served}</span>
                      {service.day_rate_note ? <span className="pill">{service.day_rate_note}</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="section">
              <h3>Created locations</h3>
              {displayedCreatedLocations.length ? (
                <div className="cards-3">
                  {displayedCreatedLocations.map((location) => (
                    <Link key={location.id} href={`/locations/${location.slug}`} className="card">
                      {location.images[0] ? (
                        <img className="cover" src={assetUrl(location.images[0].source_url)} alt={location.images[0].title} />
                      ) : null}
                      <h3>{location.name}</h3>
                      <p>{location.street_address || location.description}</p>
                      <div className="pill-row">
                        <span className="pill">{location.visibility}</span>
                        {location.zip_code ? <span className="pill">{location.zip_code}</span> : null}
                        {location.tags.slice(0, 2).map((tag) => (
                          <span key={tag.id} className="pill">
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="subtle">No created locations yet.</p>
              )}
            </div>
            <div className="section">
              <h3>Uploaded images</h3>
              {profile.uploaded_images.length ? (
                <div className="cards-3">
                  {profile.uploaded_images.map((image) => (
                    <Link key={image.id} href={`/images/${image.id}`} className="card">
                      <img className="cover" src={assetUrl(image.source_url)} alt={image.title} />
                      <h3>{image.title}</h3>
                      <p>{image.caption}</p>
                      <div className="pill-row">
                        {image.location_id ? <span className="pill">Attached to pin</span> : <span className="pill">Not tied to a location yet</span>}
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="subtle">No uploaded images yet.</p>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
