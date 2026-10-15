"use client";

import { useEffect, useMemo, useState } from "react";
import { Marker, MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { divIcon, type Map as LeafletMap } from "leaflet";

type Position = { latitude: number; longitude: number };

type Props = {
  latitude: string;
  longitude: string;
  onChange: (nextLatitude: string, nextLongitude: string) => void;
  onPickLocation: (nextLatitude: number, nextLongitude: number) => void;
  onCancel?: () => void;
  label?: string;
};

export type { Props };

const EUGENE = { latitude: 44.0521, longitude: -123.0868 };

const pinIcon = divIcon({
  className: "photoscout-map-marker",
  html: '<span class="photoscout-map-marker-pin" aria-hidden="true"><span></span></span>',
  iconSize: [44, 52],
  iconAnchor: [22, 48]
});

function MapReady({ onReady }: { onReady: (map: LeafletMap) => void }) {
  const map = useMap();

  useEffect(() => {
    onReady(map);
    const container = map.getContainer();
    const observer = new ResizeObserver(() => map.invalidateSize({ animate: false }));
    observer.observe(container);
    const frame = window.requestAnimationFrame(() => map.invalidateSize({ animate: false }));
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [map, onReady]);

  return null;
}

function MapTapHandler({ onTap }: { onTap: (latitude: number, longitude: number) => void }) {
  useMapEvents({
    click(event) {
      onTap(event.latlng.lat, event.latlng.lng);
    }
  });
  return null;
}

export function LocationPickerMap({ latitude, longitude, onChange, onPickLocation, onCancel }: Props) {
  const [map, setMap] = useState<LeafletMap | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");
  const position = useMemo<Position | null>(() => {
    if (!latitude.trim() || !longitude.trim()) return null;
    const nextLatitude = Number(latitude);
    const nextLongitude = Number(longitude);
    return Number.isFinite(nextLatitude) && Number.isFinite(nextLongitude)
      ? { latitude: nextLatitude, longitude: nextLongitude }
      : null;
  }, [latitude, longitude]);

  function setPin(nextLatitude: number, nextLongitude: number) {
    setLocationError("");
    onChange(nextLatitude.toFixed(6), nextLongitude.toFixed(6));
  }

  function centerOnMyLocation() {
    if (!navigator.geolocation) {
      setLocationError("Location is not available on this device.");
      return;
    }
    setLocating(true);
    setLocationError("");
    navigator.geolocation.getCurrentPosition(
      (nextPosition) => {
        const nextLatitude = nextPosition.coords.latitude;
        const nextLongitude = nextPosition.coords.longitude;
        setLocating(false);
        setPin(nextLatitude, nextLongitude);
        map?.flyTo([nextLatitude, nextLongitude], Math.max(map.getZoom(), 16), { duration: 0.45 });
      },
      () => {
        setLocating(false);
        setLocationError("Allow location access, or tap the map to place the pin.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  return (
    <div className="map-shell add-pin-map">
      <MapContainer center={[EUGENE.latitude, EUGENE.longitude]} zoom={13} scrollWheelZoom className="leaflet-map">
        <MapReady onReady={setMap} />
        <MapTapHandler onTap={setPin} />
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="/api/map-tiles/{z}/{x}/{y}.png" />
        {position ? (
          <Marker
            draggable
            position={[position.latitude, position.longitude]}
            icon={pinIcon}
            eventHandlers={{ dragend(event) { const next = event.target.getLatLng(); setPin(next.lat, next.lng); } }}
          />
        ) : null}
      </MapContainer>

      <div className="map-step-label"><strong>1</strong><span>{position ? "Adjust the pin" : "Tap to place a pin"}</span></div>
      <button type="button" className="map-center-control" onClick={centerOnMyLocation} disabled={locating} aria-label="Use my current location">
        <span aria-hidden="true">◎</span><span>{locating ? "Locating…" : "My location"}</span>
      </button>

      <div className="map-stage-actions">
        {onCancel ? <button type="button" className="secondary map-cancel-button" onClick={onCancel}>Cancel</button> : null}
        <p role="status">{locationError || (position ? "Pin placed. Tap elsewhere or drag it to adjust." : "Choose the exact spot for this location.")}</p>
        <button type="button" disabled={!position} onClick={() => position && onPickLocation(position.latitude, position.longitude)}>Continue</button>
      </div>
    </div>
  );
}
