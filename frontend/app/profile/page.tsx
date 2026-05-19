"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, TouchEvent, useEffect, useMemo, useRef, useState } from "react";

import { PhotoFileInputs } from "@/components/photo-file-inputs";
import { clearStoredToken, getStoredToken, setStoredToken } from "@/lib/auth";
import { assetUrl, getCurrentUser, getLocations, getMyProfile, getProfile, updateMyProfile, uploadProfileAvatar } from "@/lib/api";
import { normalizeErrorDetail } from "@/lib/errors";
import type { Location, Profile } from "@/lib/types";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function touchDistance(
  first: { clientX: number; clientY: number },
  second: { clientX: number; clientY: number }
) {
  return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
}

function avatarDisplayUrl(profile: Profile | null, previewUrl: string | null) {
  if (previewUrl) {
    return previewUrl;
  }
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

function splitBaseLocation(value: string) {
  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return {
      city: parts.slice(0, -1).join(", "),
      state: parts[parts.length - 1]
    };
  }
  return {
    city: value.trim(),
    state: ""
  };
}

function tileParts(latitude: number, longitude: number, zoom = 15) {
  const scale = 2 ** zoom;
  const latRadians = (latitude * Math.PI) / 180;
  const x = ((longitude + 180) / 360) * scale;
  const y =
    ((1 - Math.log(Math.tan(latRadians) + 1 / Math.cos(latRadians)) / Math.PI) / 2) * scale;

  const tileX = Math.floor(x);
  const tileY = Math.floor(y);
  return {
    zoom,
    tileX,
    tileY,
    leftPercent: (x - tileX) * 100,
    topPercent: (y - tileY) * 100
  };
}

function LocationMapPreview({ location }: { location: Location }) {
  if (typeof location.latitude !== "number" || typeof location.longitude !== "number") {
    return (
      <div className="profile-location-map-fallback">
        <span className="pill">Map preview unavailable</span>
      </div>
    );
  }

  const tile = tileParts(location.latitude, location.longitude);
  const mapUrl = `https://tile.openstreetmap.org/${tile.zoom}/${tile.tileX}/${tile.tileY}.png`;

  return (
    <div className="profile-location-map-preview">
      <img className="profile-location-map-image" src={mapUrl} alt={`Map preview for ${location.name}`} />
      <span className="profile-location-map-pin" />
      <span className="profile-location-map-badge">Pin preview</span>
    </div>
  );
}

function CreatedLocationCard({ location }: { location: Location }) {
  const [imageIndex, setImageIndex] = useState(0);
  const image = location.images[imageIndex] ?? location.images[0] ?? null;
  const imageTitle = image?.title || image?.caption || "Location image";

  useEffect(() => {
    setImageIndex(0);
  }, [location.id]);

  return (
    <div className="card">
      <h3>{location.name}</h3>
      {image ? (
        <div className="map-thumbnail map-thumbnail-carousel profile-location-carousel">
          <img className="cover" src={assetUrl(image.source_url)} alt={imageTitle} />
          {location.images.length > 1 ? (
            <>
              <button
                type="button"
                className="map-image-arrow map-image-arrow-left"
                onClick={() => setImageIndex((current) => (current - 1 + location.images.length) % location.images.length)}
                aria-label="Previous location image"
              >
                ‹
              </button>
              <button
                type="button"
                className="map-image-arrow map-image-arrow-right"
                onClick={() => setImageIndex((current) => (current + 1) % location.images.length)}
                aria-label="Next location image"
              >
                ›
              </button>
            </>
          ) : null}
        </div>
      ) : null}
      {image ? <strong>{imageTitle}</strong> : null}
      {location.images.length > 1 ? (
        <p className="subtle" style={{ marginTop: "-0.15rem", marginBottom: "0.35rem" }}>
          {imageIndex + 1} of {location.images.length}
        </p>
      ) : null}
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
      <LocationMapPreview location={location} />
      <Link href={`/locations/${location.slug}`} className="button" style={{ display: "inline-flex", marginTop: "0.85rem" }}>
        View location
      </Link>
    </div>
  );
}

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
  const [currentEmail, setCurrentEmail] = useState("");
  const [fallbackLocations, setFallbackLocations] = useState<Location[]>([]);
  const [editingAvatar, setEditingAvatar] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [avatarPositionX, setAvatarPositionX] = useState(50);
  const [avatarPositionY, setAvatarPositionY] = useState(50);
  const [avatarScale, setAvatarScale] = useState(1);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const gestureRef = useRef<{
    mode: "drag" | "pinch" | null;
    startX: number;
    startY: number;
    startDistance: number;
    originPositionX: number;
    originPositionY: number;
    originScale: number;
  }>({
    mode: null,
    startX: 0,
    startY: 0,
    startDistance: 0,
    originPositionX: 50,
    originPositionY: 50,
    originScale: 1
  });
  const createdLocations = profile?.created_locations ?? [];
  const heroAvatarUrl = useMemo(() => avatarDisplayUrl(profile, avatarPreviewUrl), [avatarPreviewUrl, profile]);

  async function loadCurrentProfile(token: string) {
    setLoadingProfile(true);
    try {
      const me = await getCurrentUser(token);
      setCurrentEmail(me.email || "");
      if (!me.handle) {
        setProfile(null);
        setStatus("Sign in to edit your profile, then create one from the signup screen if needed.");
        setIsOwnProfile(false);
        return;
      }
      const nextProfile = await getMyProfile(token);
      setProfile(nextProfile);
      setAvatarPositionX(nextProfile.avatar_position_x ?? 50);
      setAvatarPositionY(nextProfile.avatar_position_y ?? 50);
      setAvatarScale(nextProfile.avatar_scale ?? 1);
      setStatus("");
      setIsOwnProfile(true);
    } catch (error) {
      setProfile(null);
      setCurrentEmail("");
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
        setCurrentEmail("");
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
        setAvatarPreviewUrl(null);
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

  useEffect(() => {
    if (!profile) {
      return;
    }
    setAvatarPositionX(profile.avatar_position_x ?? 50);
    setAvatarPositionY(profile.avatar_position_y ?? 50);
    setAvatarScale(profile.avatar_scale ?? 1);
  }, [profile]);

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) {
        URL.revokeObjectURL(avatarPreviewUrl);
      }
    };
  }, [avatarPreviewUrl]);

  useEffect(() => {
    setAvatarPreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return avatarFile ? URL.createObjectURL(avatarFile) : null;
    });
    if (avatarFile) {
      setAvatarPositionX(50);
      setAvatarPositionY(50);
      setAvatarScale(1.15);
      setStatus("");
    }
  }, [avatarFile]);

  function avatarImageStyle() {
    return {
      transform: `translate(${avatarPositionX - 50}%, ${avatarPositionY - 50}%) scale(${avatarScale})`
    };
  }

  function onAvatarTouchStart(event: TouchEvent<HTMLDivElement>) {
    if (!heroAvatarUrl) {
      return;
    }
    if (event.touches.length >= 2) {
      gestureRef.current = {
        mode: "pinch",
        startX: 0,
        startY: 0,
        startDistance: touchDistance(event.touches[0], event.touches[1]),
        originPositionX: avatarPositionX,
        originPositionY: avatarPositionY,
        originScale: avatarScale
      };
      return;
    }
    const touch = event.touches[0];
    gestureRef.current = {
      mode: "drag",
      startX: touch.clientX,
      startY: touch.clientY,
      startDistance: 0,
      originPositionX: avatarPositionX,
      originPositionY: avatarPositionY,
      originScale: avatarScale
    };
  }

  function onAvatarTouchMove(event: TouchEvent<HTMLDivElement>) {
    if (!heroAvatarUrl) {
      return;
    }
    const frame = event.currentTarget.getBoundingClientRect();
    const gesture = gestureRef.current;
    if (event.touches.length >= 2) {
      event.preventDefault();
      const nextDistance = touchDistance(event.touches[0], event.touches[1]);
      const scaleRatio = gesture.startDistance ? nextDistance / gesture.startDistance : 1;
      const nextScale = clamp(gesture.originScale * scaleRatio, 1, 3);
      setAvatarScale(nextScale);
      return;
    }
    if (gesture.mode !== "drag") {
      return;
    }
    event.preventDefault();
    const touch = event.touches[0];
    const deltaX = touch.clientX - gesture.startX;
    const deltaY = touch.clientY - gesture.startY;
    const nextX = clamp(gesture.originPositionX + (deltaX / frame.width) * 100, 0, 100);
    const nextY = clamp(gesture.originPositionY + (deltaY / frame.height) * 100, 0, 100);
    setAvatarPositionX(nextX);
    setAvatarPositionY(nextY);
  }

  function onAvatarTouchEnd() {
    gestureRef.current.mode = null;
  }

  async function saveAvatar() {
    const token = getStoredToken();
    if (!token || !profile) {
      return;
    }
    if (!avatarFile && !profile.avatar_url) {
      setStatus("Choose an avatar image first.");
      return;
    }

    setSavingAvatar(true);
    try {
      let nextProfile = profile;
      if (avatarFile) {
        const formData = new FormData();
        formData.set("file", avatarFile);
        formData.set("avatar_position_x", String(avatarPositionX));
        formData.set("avatar_position_y", String(avatarPositionY));
        formData.set("avatar_scale", String(avatarScale));
        nextProfile = await uploadProfileAvatar(formData, token);
      } else {
        nextProfile = await updateMyProfile(
          {
            avatar_position_x: avatarPositionX,
            avatar_position_y: avatarPositionY,
            avatar_scale: avatarScale
          },
          token
        );
      }
      setProfile(nextProfile);
      setEditingAvatar(false);
      setAvatarFile(null);
      setAvatarPreviewUrl((current) => {
        if (current) {
          URL.revokeObjectURL(current);
        }
        return null;
      });
      setStatus("Profile photo updated.");
      window.dispatchEvent(new Event("photoscout-auth-changed"));
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to save profile photo.");
    } finally {
      setSavingAvatar(false);
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = getStoredToken();
    if (!token || !profile) {
      return;
    }
    const form = new FormData(event.currentTarget);
    const fieldValue = (name: string) => String(form.get(name) ?? "");
    const baseLocationCity = fieldValue("base_city_part");
    const baseLocationState = fieldValue("base_state_part");
    const baseLocation = [baseLocationCity.trim(), baseLocationState.trim()].filter(Boolean).join(", ");
    const nextEmail = fieldValue("email");
    const emailChanged = nextEmail.trim().toLowerCase() !== currentEmail.trim().toLowerCase();
    try {
      const nextProfile = await updateMyProfile(
        {
        email: nextEmail,
        display_name: fieldValue("display_name"),
        bio: fieldValue("bio"),
        base_city: baseLocation,
        specialties: fieldValue("specialties"),
        website_url: fieldValue("website_url"),
        instagram_url: fieldValue("instagram_url"),
        licensing_available: form.get("licensing_available") === "on",
        scout_for_hire: form.get("scout_for_hire") === "on",
        hourly_rate_note: fieldValue("hourly_rate_note")
        },
        token
      );
      setProfile(nextProfile);
      setCurrentEmail(nextEmail);
      if (emailChanged) {
        const shouldRelog = window.confirm("Email updated. You need to log in again with the new email. Log out now?");
        if (shouldRelog) {
          logout();
          router.replace("/login");
          return;
        }
        setStatus("Profile updated. Re-log in with the new email before continuing later.");
        return;
      }
      setStatus("Profile updated.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : normalizeErrorDetail(undefined, "Unable to save profile."));
    }
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
            {(() => {
              const baseLocationParts = splitBaseLocation(profile.base_city || "");
              return (
                <>
            <div className="profile-hero-card">
              <div className="profile-hero-avatar-wrap">
                {heroAvatarUrl ? (
                  <div className="profile-hero-avatar-frame">
                    <img
                      className="profile-hero-avatar-image"
                      src={heroAvatarUrl}
                      alt={profile.display_name}
                      style={avatarImageStyle()}
                    />
                  </div>
                ) : (
                  <div className="profile-hero-avatar-frame profile-hero-avatar-fallback">
                    {profile.display_name.trim().slice(0, 1).toUpperCase()}
                  </div>
                )}
                {isOwnProfile ? (
                  <button type="button" className="secondary profile-avatar-edit-button" onClick={() => setEditingAvatar((current) => !current)}>
                    {editingAvatar ? "Close photo editor" : "Edit profile photo"}
                  </button>
                ) : null}
              </div>
              <div className="profile-hero-copy">
                <span className="eyebrow">Profile</span>
                <h2>{profile.display_name}</h2>
                <p>{profile.bio || "No bio added yet."}</p>
                <div className="pill-row">
                  <span className="pill">@{profile.handle}</span>
                  <span className="pill">{profile.base_city || "Base location not set"}</span>
                  {profile.licensing_available ? <span className="pill">Licensing available</span> : null}
                  {profile.scout_for_hire ? <span className="pill">Scout for hire</span> : null}
                </div>
              </div>
            </div>
            {isOwnProfile && editingAvatar ? (
              <div className="panel section">
                <h3>Profile photo editor</h3>
                <PhotoFileInputs idPrefix="profile-avatar" selectedFile={avatarFile} onSelect={setAvatarFile} />
                <div
                  className="profile-avatar-editor-preview"
                  onTouchStart={onAvatarTouchStart}
                  onTouchMove={onAvatarTouchMove}
                  onTouchEnd={onAvatarTouchEnd}
                >
                  {heroAvatarUrl ? (
                    <img
                      className="profile-avatar-editor-image"
                      src={heroAvatarUrl}
                      alt={profile.display_name}
                      style={avatarImageStyle()}
                    />
                  ) : (
                    <div className="profile-hero-avatar-fallback">Choose a photo to preview it here.</div>
                  )}
                </div>
                <div className="pill-row">
                  <span className="pill">Drag with one finger</span>
                  <span className="pill">Pinch to zoom</span>
                  <span className="pill">Zoom {avatarScale.toFixed(2)}x</span>
                </div>
                <div className="pill-row" style={{ marginTop: "0.8rem" }}>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setAvatarPositionX(50);
                      setAvatarPositionY(50);
                      setAvatarScale(1);
                    }}
                  >
                    Reset framing
                  </button>
                  <button type="button" onClick={() => void saveAvatar()} disabled={savingAvatar}>
                    {savingAvatar ? "Saving..." : "Save profile photo"}
                  </button>
                </div>
              </div>
            ) : null}
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
                  <label htmlFor="profile_email">Email</label>
                  <input id="profile_email" name="email" type="email" autoComplete="email" defaultValue={currentEmail} />
                  <p className="subtle">This is your sign-in email.</p>
                </div>
                <div className="field">
                  <label htmlFor="display_name">Display name</label>
                  <input id="display_name" name="display_name" defaultValue={profile.display_name} />
                </div>
                <div className="field">
                  <label htmlFor="bio">Bio</label>
                  <textarea id="bio" name="bio" defaultValue={profile.bio} />
                </div>
                <div className="field">
                  <label>Base location</label>
                  <div className="panel-grid">
                    <div className="field">
                      <label htmlFor="base_city_part">City</label>
                      <input id="base_city_part" name="base_city_part" defaultValue={baseLocationParts.city} placeholder="Eugene" />
                    </div>
                    <div className="field">
                      <label htmlFor="base_state_part">State</label>
                      <input id="base_state_part" name="base_state_part" defaultValue={baseLocationParts.state} placeholder="OR" />
                    </div>
                  </div>
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
                    <CreatedLocationCard key={location.id} location={location} />
                  ))}
                </div>
              ) : (
                <p className="subtle">No created locations yet.</p>
              )}
            </div>
                </>
              );
            })()}
          </>
        )}
      </div>
    </section>
  );
}
