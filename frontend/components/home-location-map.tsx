"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import type { Location } from "@/lib/types";

const CurrentLocationMap = dynamic(
  () => import("@/components/current-location-map").then((module) => module.CurrentLocationMap),
  { ssr: false }
);

export function HomeLocationMap({ locations }: { locations: Location[] }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="panel map-panel">
        <span className="eyebrow">Current location map</span>
        <h3>Pins from the live feed</h3>
        <div className="map-shell" />
      </div>
    );
  }

  return <CurrentLocationMap locations={locations} />;
}
