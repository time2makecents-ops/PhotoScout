"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

import { searchAll } from "@/lib/api";
import type { SearchItem } from "@/lib/types";


export default function SearchPage() {
  const [results, setResults] = useState<SearchItem[]>([]);
  const [status, setStatus] = useState("Search by location name, profile, tag, image caption, or challenge title.");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const query = String(form.get("q") || "").trim();
    if (!query) {
      return;
    }
    const response = await searchAll(query, {
      visibility: String(form.get("visibility") || ""),
      scout_for_hire: form.get("scout_for_hire") === "on" ? true : undefined,
      licensing_available: form.get("licensing_available") === "on" ? true : undefined
    });
    setResults(response.results);
    setStatus(`${response.results.length} results for "${response.query}"`);
  }

  return (
    <section className="section">
      <div className="panel">
        <span className="eyebrow">Basic search foundation</span>
        <h2>Find locations, images, profiles, and weekly challenges</h2>
        <form className="form" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="q">Search query</label>
            <input id="q" name="q" placeholder="golden hour, modernist, maya, geometry" required />
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
          <button type="submit">Run search</button>
        </form>
      </div>
      <p className="status">{status}</p>
      <div className="cards-2 section">
        {results.map((item) => (
          <Link key={`${item.type}-${item.id}`} href={item.href} className="card">
            <span className="eyebrow">{item.type}</span>
            <h3>{item.title}</h3>
            <p>{item.subtitle}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}

