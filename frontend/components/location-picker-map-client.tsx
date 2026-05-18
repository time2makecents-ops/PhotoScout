"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { Props as LocationPickerMapProps } from "@/components/location-picker-map";

const LocationPickerMap = dynamic(
  () => import("@/components/location-picker-map").then((module) => module.LocationPickerMap),
  { ssr: false }
);

export function LocationPickerMapClient(props: LocationPickerMapProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="map-shell" style={{ minHeight: "18rem" }} />;
  }

  return <LocationPickerMap {...props} />;
}
