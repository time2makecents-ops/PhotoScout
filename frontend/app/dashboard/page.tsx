"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { clearStoredToken, getStoredToken } from "@/lib/auth";
import { getChallenges, getCurrentUser, getLocations, getProfile } from "@/lib/api";
import type { Challenge, Location, Profile } from "@/lib/types";


export default function DashboardPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const token = getStoredToken();
      if (!token) {
        setError("Sign in to view your dashboard.");
        return;
      }

      try {
        const me = await getCurrentUser(token);
        if (!me.handle) {
          setError("Current account is missing a profile handle.");
          return;
        }
        const [currentProfile, allLocations, allChallenges] = await Promise.all([getProfile(me.handle), getLocations(), getChallenges()]);
        setProfile(currentProfile);
        setLocations(allLocations.filter((item) => item.creator_handle === currentProfile.handle));
        setChallenges(allChallenges);
      } catch (err) {
        clearStoredToken();
        setError(err instanceof Error ? err.message : "Unable to load dashboard");
      }
    }

    load();
  }, []);

  return (
    <section className="section">
      <div className="panel-grid">
        <div className="panel">
          <span className="eyebrow">Dashboard</span>
          <h2>{profile ? profile.display_name : "Account overview"}</h2>
          <p>{profile ? profile.bio || "Complete your profile and start pinning locations." : error || "Loading..."}</p>
          <div className="pill-row">
            <Link href="/profile" className="button secondary">
              Edit profile
            </Link>
            <Link href="/locations/new" className="button">
              Add location
            </Link>
          </div>
        </div>
        <div className="panel">
          <span className="eyebrow">Activity</span>
          <h2>{locations.length} location pins</h2>
          <p>{challenges.length} seeded weekly challenges are available right now.</p>
        </div>
      </div>

      <div className="section">
        <h2>Your locations</h2>
        <div className="cards-2">
          {locations.map((location) => (
            <Link key={location.id} href={`/locations/${location.slug}`} className="card">
              <h3>{location.name}</h3>
              <p>{location.description}</p>
              <span className="pill">{location.visibility}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
