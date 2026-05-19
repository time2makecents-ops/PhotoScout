"use client";

import { useEffect, useMemo, useState } from "react";
import { Marker, MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { divIcon } from "leaflet";

type Position = {
  latitude: number;
  longitude: number;
};

type Props = {
  latitude: string;
  longitude: string;
  onChange: (nextLatitude: string, nextLongitude: string) => void;
  onPickLocation?: (nextLatitude: number, nextLongitude: number) => void;
  label?: string;
};

export type { Props };

function createPinIcon(label: string) {
  return divIcon({
    className: "photoscout-map-marker",
    html: `<span class="photoscout-map-marker-dot public"></span><span class="photoscout-map-marker-label">${label}</span>`,
    iconSize: [56, 44],
    iconAnchor: [28, 38]
  });
}

function MapInteraction({ onPick }: { onPick: (latitude: number, longitude: number) => void }) {
  useMapEvents({
    click(event) {
      onPick(event.latlng.lat, event.latlng.lng);
    }
  });
  return null;
}

function CenterSync({ latitude, longitude }: { latitude: number; longitude: number }) {
  const map = useMap();

  useEffect(() => {
    map.setView([latitude, longitude]);
  }, [latitude, longitude, map]);

  return null;
}

function ResizeMap() {
  const map = useMap();

  useEffect(() => {
    map.invalidateSize();
  }, [map]);

  return null;
}

export function LocationPickerMap({ latitude, longitude, onChange, onPickLocation, label = "Selected location" }: Props) {
  const [mounted, setMounted] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const position = useMemo<Position | null>(() => {
    const lat = Number(latitude);
    const lon = Number(longitude);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      return { latitude: lat, longitude: lon };
    }
    return null;
  }, [latitude, longitude]);

  useEffect(() => {
    if (position) {
      setSelectedPosition(position);
    }
  }, [position]);

  const centerPosition = selectedPosition ?? position ?? { latitude: 34.05, longitude: -118.25 };
  const center = [centerPosition.latitude, centerPosition.longitude] as [number, number];

  if (!mounted) {
    return <div className="map-shell" style={{ minHeight: "18rem" }} />;
  }

  return (
    <div className="map-shell">
      <MapContainer center={center} zoom={10} scrollWheelZoom className="leaflet-map">
        <ResizeMap />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapInteraction
          onPick={(nextLatitude, nextLongitude) => {
            setSelectedPosition({ latitude: nextLatitude, longitude: nextLongitude });
            onChange(nextLatitude.toFixed(6), nextLongitude.toFixed(6));
            onPickLocation?.(nextLatitude, nextLongitude);
          }}
        />
        {selectedPosition ? <CenterSync latitude={selectedPosition.latitude} longitude={selectedPosition.longitude} /> : null}
        <Marker
          draggable
          position={center}
          icon={createPinIcon(label)}
          eventHandlers={{
            dragend(event) {
              const marker = event.target;
              const next = marker.getLatLng();
              setSelectedPosition({ latitude: next.lat, longitude: next.lng });
              onChange(next.lat.toFixed(6), next.lng.toFixed(6));
              onPickLocation?.(next.lat, next.lng);
            }
          }}
        />
      </MapContainer>
    </div>
  );
}
