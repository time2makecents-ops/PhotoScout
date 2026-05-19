"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { HOME_FLASH_KEY } from "@/components/home-refresh-listener";
import type { Location } from "@/lib/types";

const CurrentLocationMap = dynamic(
  () => import("@/components/current-location-map").then((module) => module.CurrentLocationMap),
  { ssr: false }
);

export function HomeLocationMap({ locations }: { locations: Location[] }) {
  const [mounted, setMounted] = useState(false);
  const [flashMessage, setFlashMessage] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const message = window.localStorage.getItem(HOME_FLASH_KEY);
    if (!message) {
      return;
    }
    window.localStorage.removeItem(HOME_FLASH_KEY);
    setFlashMessage(message);
    const timeout = window.setTimeout(() => setFlashMessage(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [mounted]);

  if (!mounted) {
    return (
      <div className="panel map-panel">
        <span className="eyebrow">Current location map</span>
        <h3>Pins from the live feed</h3>
        <div className="map-shell" />
      </div>
    );
  }

  return <CurrentLocationMap locations={locations} flashMessage={flashMessage} />;
}
