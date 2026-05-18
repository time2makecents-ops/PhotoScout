"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { setStoredToken } from "@/lib/auth";
import { normalizeErrorDetail } from "@/lib/errors";


export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(event.currentTarget);

    const response = await fetch(`/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        password: form.get("password"),
        role: form.get("role"),
        handle: form.get("handle"),
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
    setLoading(false);
    if (!response.ok) {
      setError(normalizeErrorDetail(data.detail, "Signup failed"));
      return;
    }

    setStoredToken(data.token);
    router.push("/home");
  }

  return (
    <section className="section">
      <div className="panel" style={{ maxWidth: 640, margin: "0 auto" }}>
        <span className="eyebrow">Create profile</span>
        <h2>Build your PhotoScout account</h2>
        <form className="form" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="display_name">Display name</label>
            <input id="display_name" name="display_name" required />
          </div>
          <div className="field">
            <label htmlFor="handle">Handle</label>
            <input id="handle" name="handle" required />
          </div>
          <div className="field">
            <label htmlFor="role">Role</label>
            <select id="role" name="role" defaultValue="photographer">
              <option value="photographer">Photographer</option>
              <option value="studio">Studio / production team</option>
              <option value="scout">Location scout</option>
              <option value="property_owner">Private property owner</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required />
          </div>
          <div className="field">
            <label htmlFor="bio">Bio</label>
            <textarea id="bio" name="bio" placeholder="Short intro for your profile" />
          </div>
          <div className="field">
            <label htmlFor="base_city">Base city</label>
            <input id="base_city" name="base_city" placeholder="Los Angeles" />
          </div>
          <div className="field">
            <label htmlFor="specialties">Specialties</label>
            <input id="specialties" name="specialties" placeholder="Landscape, travel, scouting" />
          </div>
          <div className="field">
            <label htmlFor="website_url">Website URL</label>
            <input id="website_url" name="website_url" placeholder="https://..." />
          </div>
          <div className="field">
            <label htmlFor="instagram_url">Instagram URL</label>
            <input id="instagram_url" name="instagram_url" placeholder="https://instagram.com/..." />
          </div>
          <div className="field">
            <label htmlFor="hourly_rate_note">Hourly or day rate note</label>
            <input id="hourly_rate_note" name="hourly_rate_note" placeholder="$750/day" />
          </div>
          <label>
            <input type="checkbox" name="licensing_available" /> Licensing available
          </label>
          <label>
            <input type="checkbox" name="scout_for_hire" /> Scout for hire
          </label>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" minLength={8} required />
          </div>
          {error ? <p className="status">{error}</p> : null}
          <button type="submit">{loading ? "Creating..." : "Create account"}</button>
        </form>
      </div>
    </section>
  );
}
