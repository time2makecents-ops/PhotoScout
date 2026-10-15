"use client";

import { useEffect, useState } from "react";

import { getSavedLocationState, removeSavedLocation, saveLocation } from "@/lib/api";
import { ensureLocalSession } from "@/lib/auth";

export function SaveLocationButton({ locationId }: { locationId: number }) {
  const [saved, setSaved] = useState(false);
  const [ready, setReady] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    void ensureLocalSession()
      .then(async (token) => ({ token, saved: await getSavedLocationState(locationId, token) }))
      .then((result) => {
        if (!cancelled) setSaved(result.saved);
      })
      .catch(() => {
        if (!cancelled) setMessage("Saved places are temporarily unavailable.");
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => { cancelled = true; };
  }, [locationId]);

  async function toggleSaved() {
    if (!ready || working) return;
    const previous = saved;
    setSaved(!previous);
    setWorking(true);
    setMessage(!previous ? "Saved to your places." : "Removed from saved places.");
    try {
      const token = await ensureLocalSession();
      if (previous) await removeSavedLocation(locationId, token);
      else await saveLocation(locationId, token);
    } catch {
      setSaved(previous);
      setMessage("Could not update saved places. Try again.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="save-location-control">
      <button
        type="button"
        className={`save-location-button ${saved ? "is-saved" : ""}`}
        aria-pressed={saved}
        disabled={!ready || working}
        onClick={toggleSaved}
      >
        <span aria-hidden="true">{saved ? "★" : "☆"}</span>
        {working ? "Updating…" : saved ? "Saved" : "Save place"}
      </button>
      <span className="sr-only" role="status">{message}</span>
    </div>
  );
}
