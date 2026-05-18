"use client";

import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import type { DivIcon } from "leaflet";
import { divIcon, latLngBounds } from "leaflet";

import { getStoredToken } from "@/lib/auth";
import { assetUrl, getCurrentUser } from "@/lib/api";
import type { Location } from "@/lib/types";

type Point = {
  lat: number;
  lon: number;
};

type Props = {
  locations: Location[];
};

function createPinIcon(kind: "own" | "other" | "current", label: string): DivIcon {

  return divIcon({
    className: "photoscout-map-marker",
    html: `<span class="photoscout-map-marker-dot ${kind}"></span><span class="photoscout-map-marker-label">${label}</span>`,
    iconSize: [56, 44],
    iconAnchor: [28, 38]
  });
}

function PinThumbnail({ location }: { location: Location }) {
  const image = location.images[0];
  if (!image) {
    return null;
  }
  return (
    <div className="map-thumbnail">
      <img src={assetUrl(image.source_url)} alt={image.title} />
      <strong>{image.title}</strong>
    </div>
  );
}

function FitBounds({ locations, currentLocation }: { locations: Location[]; currentLocation: Point | null }) {
  const map = useMap();

  useEffect(() => {
    const points = locations
      .filter((location) => typeof location.latitude === "number" && typeof location.longitude === "number")
      .map((location) => [location.latitude as number, location.longitude as number] as [number, number]);

    if (currentLocation) {
      points.push([currentLocation.lat, currentLocation.lon]);
    }

    if (points.length === 0) {
      return;
    }

    if (points.length === 1) {
      map.setView(points[0], 12);
      return;
    }

    map.fitBounds(latLngBounds(points), { padding: [32, 32] });
  }, [currentLocation, locations, map]);

  return null;
}

function ZoomSync({ zoom }: { zoom: number }) {
  const map = useMap();

  useEffect(() => {
    map.setZoom(zoom);
  }, [map, zoom]);

  return null;
}

export function CurrentLocationMap({ locations }: Props) {
  const [zoom, setZoom] = useState(12);
  const [currentLocation, setCurrentLocation] = useState<Point | null>(null);
  const [currentHandle, setCurrentHandle] = useState<string | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCurrentLocation({
          lat: position.coords.latitude,
          lon: position.coords.longitude
        });
      },
      () => {
        setCurrentLocation(null);
      },
      { enableHighAccuracy: true, timeout: 7000, maximumAge: 300000 }
    );
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadHandle() {
      const token = getStoredToken();
      if (!token) {
        if (!cancelled) {
          setCurrentHandle(null);
        }
        return;
      }
      try {
        const me = await getCurrentUser(token);
        if (!cancelled) {
          setCurrentHandle(me.handle || null);
        }
      } catch {
        if (!cancelled) {
          setCurrentHandle(null);
        }
      }
    }

    function syncHandle() {
      void loadHandle();
    }

    loadHandle();
    window.addEventListener("photoscout-auth-changed", syncHandle);
    window.addEventListener("storage", syncHandle);
    return () => {
      cancelled = true;
      window.removeEventListener("photoscout-auth-changed", syncHandle);
      window.removeEventListener("storage", syncHandle);
    };
  }, []);

  const mapCenter = useMemo(() => {
    const first = locations.find((location) => typeof location.latitude === "number" && typeof location.longitude === "number");
    return first ? [first.latitude as number, first.longitude as number] : currentLocation ? [currentLocation.lat, currentLocation.lon] : [34.05, -118.25];
  }, [currentLocation, locations]);

  const pins = useMemo(
    () =>
      locations.filter((location) => typeof location.latitude === "number" && typeof location.longitude === "number"),
    [locations]
  );

  return (
    <div className="panel map-panel">
      <div className="map-toolbar">
        <div>
          <span className="eyebrow">Current location map</span>
          <h3>Pins from the live feed</h3>
        </div>
        <div className="pill-row">
          <button type="button" className="secondary" onClick={() => setZoom((value) => Math.max(4, value - 1))}>
            Zoom out
          </button>
          <button type="button" className="secondary" onClick={() => setZoom((value) => Math.min(18, value + 1))}>
            Zoom in
          </button>
        </div>
      </div>
      <div className="map-shell">
        <MapContainer
          center={mapCenter as [number, number]}
          zoom={zoom}
          scrollWheelZoom
          className="leaflet-map"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ZoomSync zoom={zoom} />
          <FitBounds locations={pins} currentLocation={currentLocation} />
          {currentLocation ? (
            <>
              <CircleMarker center={[currentLocation.lat, currentLocation.lon]} radius={10} pathOptions={{ color: "#4fd6c3" }} />
              <Marker
                position={[currentLocation.lat, currentLocation.lon]}
                icon={createPinIcon("current", "You are here")}
                zIndexOffset={-1000}
              />
            </>
          ) : null}
          {pins.map((location) => (
            <Marker
              key={location.id}
              position={[location.latitude as number, location.longitude as number]}
              icon={createPinIcon(
                currentHandle && location.creator_handle === currentHandle ? "own" : "other",
                location.images[0]?.title || location.name
              )}
              zIndexOffset={currentHandle && location.creator_handle === currentHandle ? 2000 : 1000}
            >
              <Popup>
                <PinThumbnail location={location} />
                <strong>{location.name}</strong>
                <div>{location.city}, {location.region}</div>
                <div>{location.zip_code || "No ZIP"}</div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
      <p className="subtle">Drag the map, use zoom controls, or scroll to see a wider area.</p>
    </div>
  );
}
