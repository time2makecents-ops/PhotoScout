"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

import { getChallenges, getLocations, getProfiles } from "@/lib/api";
import type { SearchItem } from "@/lib/types";

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function queryTerms(value: string) {
  return normalize(value)
    .split(/\s+/)
    .filter(Boolean);
}

function matchesAll(haystack: string, terms: string[]) {
  if (!terms.length) {
    return true;
  }
  const text = haystack.toLowerCase();
  return terms.every((term) => text.includes(term));
}

function tagMatches(tags: { name: string; slug: string }[], term: string) {
  const value = normalize(term);
  return tags.some((tag) => normalize(tag.name).includes(value) || normalize(tag.slug).includes(value));
}

export default function SearchPage() {
  const [results, setResults] = useState<SearchItem[]>([]);
  const [status, setStatus] = useState("Search by location name, ZIP code, tag, profile, image caption, or challenge title.");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const query = String(form.get("q") || "");
    const tag = String(form.get("tag") || "");
    const zipCode = String(form.get("zip_code") || "");
    const visibility = String(form.get("visibility") || "");
    const scoutForHire = form.get("scout_for_hire") === "on";
    const licensingAvailable = form.get("licensing_available") === "on";
    const hasCriteria = Boolean(query.trim() || tag.trim() || zipCode.trim() || scoutForHire || licensingAvailable || visibility);

    if (!hasCriteria) {
      setStatus("Enter a query or select a filter.");
      setResults([]);
      return;
    }

    setLoading(true);
    setStatus("Searching live data...");

    try {
      const [locations, profiles, challenges] = await Promise.all([getLocations(), getProfiles(), getChallenges()]);
      const terms = queryTerms(query);
      const normalizedTag = normalize(tag);
      const normalizedZip = normalize(zipCode);
      const nextResults: SearchItem[] = [];

      for (const location of locations) {
        const locationText = [
          location.name,
          location.street_address || "",
          location.description,
          location.city,
          location.region,
          location.country,
          location.zip_code,
          location.tags.map((item) => item.name).join(" "),
          location.tags.map((item) => item.slug).join(" "),
          location.images.map((image) => `${image.title} ${image.caption}`).join(" ")
        ].join(" ");
        const tagMatch = !normalizedTag || tagMatches(location.tags, normalizedTag);
        const zipMatch = !normalizedZip || normalize(location.zip_code).includes(normalizedZip);
        const visibilityMatch = !visibility || location.visibility === visibility;
        const textMatch = !terms.length || matchesAll(locationText, terms);
        if (tagMatch && zipMatch && visibilityMatch && textMatch) {
          nextResults.push({
            id: location.id,
            type: "location",
            title: location.name,
            subtitle: location.street_address || `${location.city}, ${location.region} ${location.zip_code}`.trim(),
            href: `/locations/${location.slug}`
          });
        }

        for (const image of location.images) {
          const imageText = `${image.title} ${image.caption}`;
          const imageMatch = !terms.length || matchesAll(imageText, terms);
          if (!imageMatch) {
            continue;
          }
          if (licensingAvailable && !image.licensing_available) {
            continue;
          }
          nextResults.push({
            id: image.id,
            type: "image",
            title: image.title,
            subtitle: image.caption || location.name,
            href: `/images/${image.id}`
          });
        }
      }

      for (const profile of profiles) {
        const profileText = [
          profile.handle,
          profile.display_name,
          profile.bio,
          profile.base_city,
          profile.specialties,
          profile.hourly_rate_note || ""
        ].join(" ");
        const scoutMatch = !scoutForHire || profile.scout_for_hire;
        const licensingMatch = !licensingAvailable || profile.licensing_available;
        const textMatch = !terms.length || matchesAll(profileText, terms);
        if (scoutMatch && licensingMatch && textMatch) {
          nextResults.push({
            id: profile.id,
            type: "profile",
            title: profile.display_name,
            subtitle: profile.specialties || profile.base_city,
            href: `/profile?handle=${profile.handle}`
          });
        }
      }

      for (const challenge of challenges) {
        const challengeText = `${challenge.title} ${challenge.prompt}`;
        const textMatch = !terms.length || matchesAll(challengeText, terms);
        if (textMatch) {
          nextResults.push({
            id: challenge.id,
            type: "challenge",
            title: challenge.title,
            subtitle: challenge.prompt,
            href: `/challenges/${challenge.slug}`
          });
        }
      }

      const unique = new Map<string, SearchItem>();
      for (const item of nextResults) {
        unique.set(`${item.type}:${item.id}:${item.href}`, item);
      }
      const finalResults = Array.from(unique.values());
      setResults(finalResults);
      setStatus(finalResults.length ? `${finalResults.length} results found.` : "No matches found.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Search failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="section">
      <div className="panel">
        <span className="eyebrow">Basic search foundation</span>
        <h2>Find locations, images, profiles, and weekly challenges</h2>
        <form className="form" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="q">Search query</label>
            <input id="q" name="q" placeholder="golden hour, modernist, maya, geometry" />
          </div>
          <div className="field">
            <label htmlFor="tag">Tag or category</label>
            <input id="tag" name="tag" placeholder="garage, coastal, modernist" />
          </div>
          <div className="field">
            <label htmlFor="zip_code">ZIP code</label>
            <input id="zip_code" name="zip_code" inputMode="numeric" placeholder="90265" />
          </div>
          <div className="field">
            <label htmlFor="visibility">Visibility filter</label>
            <select id="visibility" name="visibility" defaultValue="">
              <option value="">Any</option>
              <option value="public">Public</option>
              <option value="private">Private</option>
            </select>
          </div>
          <label>
            <input type="checkbox" name="licensing_available" /> Licensing available
          </label>
          <label>
            <input type="checkbox" name="scout_for_hire" /> Scout for hire
          </label>
          <button type="submit" disabled={loading}>
            {loading ? "Searching..." : "Run search"}
          </button>
        </form>
      </div>
      <p className="status">{status}</p>
      <div className="cards-2 section">
        {results.map((item) => (
          <Link key={`${item.type}-${item.id}-${item.href}`} href={item.href} className="card">
            <span className="eyebrow">{item.type}</span>
            <h3>{item.title}</h3>
            <p>{item.subtitle}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
