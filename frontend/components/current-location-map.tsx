"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { DivIcon, Map as LeafletMap } from "leaflet";
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
  flashMessage?: string | null;
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

function MapBehavior({
  pins,
  currentLocation,
  zoom,
  recenterToken,
  showAllToken,
  onReady,
  onUserInteract
}: {
  pins: Location[];
  currentLocation: Point | null;
  zoom: number;
  recenterToken: number;
  showAllToken: number;
  onReady: (map: LeafletMap | null) => void;
  onUserInteract: () => void;
}) {
  const map = useMap();

  useEffect(() => {
    onReady(map);
    return () => onReady(null);
  }, [map, onReady]);

  useMapEvents({
    dragstart: onUserInteract,
    movestart: onUserInteract,
    zoomstart: onUserInteract
  });

  useEffect(() => {
    map.setZoom(zoom);
  }, [map, zoom]);

  useEffect(() => {
    if (!currentLocation) {
      return;
    }
    map.setView([currentLocation.lat, currentLocation.lon], Math.max(map.getZoom(), 12));
  }, [currentLocation, map]);

  useEffect(() => {
    if (!recenterToken || !currentLocation) {
      return;
    }
    map.setView([currentLocation.lat, currentLocation.lon], Math.max(map.getZoom(), 13));
  }, [currentLocation, map, recenterToken]);

  useEffect(() => {
    if (!showAllToken) {
      return;
    }
    const points = pins
      .filter((location) => typeof location.latitude === "number" && typeof location.longitude === "number")
      .map((location) => [location.latitude as number, location.longitude as number] as [number, number]);

    if (points.length === 0) {
      return;
    }

    if (points.length === 1) {
      map.setView(points[0], Math.max(map.getZoom(), 12));
      return;
    }

    map.fitBounds(latLngBounds(points), { padding: [32, 32] });
  }, [map, pins, showAllToken]);

  return null;
}

export function CurrentLocationMap({ locations, flashMessage }: Props) {
  const [zoom, setZoom] = useState(12);
  const [currentLocation, setCurrentLocation] = useState<Point | null>(null);
  const [currentHandle, setCurrentHandle] = useState<string | null>(null);
  const [mapInstance, setMapInstance] = useState<LeafletMap | null>(null);
  const [recenterToken, setRecenterToken] = useState(0);
  const [showAllToken, setShowAllToken] = useState(0);
  const [mapMessage, setMapMessage] = useState<string | null>(null);
  const userInteractedRef = useRef(false);
  const requestedLocationRef = useRef(false);

  const firstPin = useMemo(() => {
    const first = locations.find((location) => typeof location.latitude === "number" && typeof location.longitude === "number");
    return first ? { lat: first.latitude as number, lon: first.longitude as number } : null;
  }, [locations]);

  const initialCenter = currentLocation ?? firstPin ?? { lat: 34.05, lon: -118.25 };

  useEffect(() => {
    if (!navigator.geolocation || requestedLocationRef.current) {
      return;
    }
    requestedLocationRef.current = true;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCurrentLocation({
          lat: position.coords.latitude,
          lon: position.coords.longitude
        });
        setMapMessage(null);
      },
      () => {
        setCurrentLocation(null);
        setMapMessage("GPS unavailable. Showing the first available pin.");
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

  useEffect(() => {
    if (!mapInstance || !currentLocation || userInteractedRef.current) {
      return;
    }
    mapInstance.setView([currentLocation.lat, currentLocation.lon], Math.max(mapInstance.getZoom(), 12));
  }, [currentLocation, mapInstance]);

  const pins = useMemo(
    () =>
      locations.filter((location) => typeof location.latitude === "number" && typeof location.longitude === "number"),
    [locations]
  );

  async function recenterToMyLocation() {
    if (!navigator.geolocation) {
      setMapMessage("This browser does not support GPS location.");
      return;
    }

    if (currentLocation && mapInstance) {
      mapInstance.setView([currentLocation.lat, currentLocation.lon], Math.max(mapInstance.getZoom(), 13));
      setMapMessage(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = {
          lat: position.coords.latitude,
          lon: position.coords.longitude
        };
        setCurrentLocation(next);
        setMapMessage(null);
        setRecenterToken((value) => value + 1);
      },
      () => {
        setMapMessage("GPS unavailable. Staying on the current map view.");
      },
      { enableHighAccuracy: true, timeout: 7000, maximumAge: 300000 }
    );
  }

  function showAllPins() {
    setShowAllToken((value) => value + 1);
  }

  return (
    <div className={`panel map-panel ${flashMessage ? "map-panel-flash" : ""}`}>
      <div className="map-toolbar">
        <div>
          <span className="eyebrow">Current location map</span>
          <h3>Pins from the live feed</h3>
          {flashMessage ? <p className="map-flash">{flashMessage}</p> : null}
          {mapMessage ? <p className="subtle">{mapMessage}</p> : null}
        </div>
        <div className="pill-row">
          <button type="button" className="secondary" onClick={recenterToMyLocation}>
            {currentLocation ? "Recenter to my location" : "Use my location"}
          </button>
          <button type="button" className="secondary" onClick={showAllPins} disabled={!pins.length}>
            Show all pins
          </button>
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
          center={[initialCenter.lat, initialCenter.lon]}
          zoom={zoom}
          scrollWheelZoom
          className="leaflet-map"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapBehavior
            pins={pins}
            currentLocation={currentLocation}
            zoom={zoom}
            recenterToken={recenterToken}
            showAllToken={showAllToken}
            onReady={setMapInstance}
            onUserInteract={() => {
              userInteractedRef.current = true;
            }}
          />
          {currentLocation ? (
            <CircleMarker
              center={[currentLocation.lat, currentLocation.lon]}
              radius={8}
              pathOptions={{
                color: "#4fd6c3",
                fillColor: "#4fd6c3",
                fillOpacity: 0.15,
                opacity: 0.6,
                weight: 2
              }}
            />
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
                {location.street_address ? <div>{location.street_address}</div> : null}
                <div>
                  {location.city}, {location.region}
                </div>
                <div>{location.zip_code || "No ZIP"}</div>
                <Link
                  href={`/locations/${location.slug}`}
                  className="button"
                  style={{ display: "inline-flex", marginTop: "0.75rem" }}
                >
                  View pin details
                </Link>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
      <p className="subtle">Drag the map, use zoom controls, or scroll to see a wider area.</p>
    </div>
  );
}
