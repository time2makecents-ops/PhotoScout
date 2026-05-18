"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { getStoredToken, setStoredToken } from "@/lib/auth";
import { normalizeErrorDetail } from "@/lib/errors";

export function LoginScreen() {
  const router = useRouter();
  const [hasToken, setHasToken] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = getStoredToken();
    setHasToken(Boolean(token));
    if (token) {
      router.replace("/home");
    }

    function syncToken() {
      const nextToken = getStoredToken();
      setHasToken(Boolean(nextToken));
      if (nextToken) {
        router.replace("/home");
      }
    }

    window.addEventListener("photoscout-auth-changed", syncToken);
    window.addEventListener("storage", syncToken);
    return () => {
      window.removeEventListener("photoscout-auth-changed", syncToken);
      window.removeEventListener("storage", syncToken);
    };
  }, [router]);

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
    router.push("/home");
  }

  return (
    <section className="section">
      <div className="panel" style={{ maxWidth: 640, margin: "0 auto" }}>
        <span className="eyebrow">PhotoScout</span>
        <h2>Sign in to start</h2>
        <p className="subtle">Use PhotoScout to discover locations, upload images, and manage your profile.</p>
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
          No profile yet? <Link href="/signup">Create one</Link>
        </p>
      </div>
    </section>
  );
}
