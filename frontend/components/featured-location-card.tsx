"use client";

import Link from "next/link";
import { useState } from "react";

import { assetUrl } from "@/lib/api";
import type { Location } from "@/lib/types";

function tileParts(latitude: number, longitude: number, zoom = 15) {
  const scale = 2 ** zoom;
  const latRadians = (latitude * Math.PI) / 180;
  const x = ((longitude + 180) / 360) * scale;
  const y =
    ((1 - Math.log(Math.tan(latRadians) + 1 / Math.cos(latRadians)) / Math.PI) / 2) * scale;

  return {
    zoom,
    tileX: Math.floor(x),
    tileY: Math.floor(y)
  };
}

function FeaturedLocationMapPreview({ location }: { location: Location }) {
  if (typeof location.latitude !== "number" || typeof location.longitude !== "number") {
    return (
      <div className="profile-location-map-fallback">
        <span className="pill">Map preview unavailable</span>
      </div>
    );
  }

  const tile = tileParts(location.latitude, location.longitude);
  const mapUrl = `https://tile.openstreetmap.org/${tile.zoom}/${tile.tileX}/${tile.tileY}.png`;

  return (
    <div className="profile-location-map-preview">
      <img className="profile-location-map-image" src={mapUrl} alt={`Map preview for ${location.name}`} />
      <span className="profile-location-map-pin" />
      <span className="profile-location-map-badge">Pin preview</span>
    </div>
  );
}

export function FeaturedLocationCard({ location }: { location: Location }) {
  const [imageIndex, setImageIndex] = useState(0);
  const image = location.images[imageIndex] ?? location.images[0] ?? null;
  const imageTitle = image?.title || image?.caption || "Location image";

  return (
    <div className="card">
      <Link href={`/locations/${location.slug}`}>
        <h3>{location.name}</h3>
        <FeaturedLocationMapPreview location={location} />
        {image ? (
          <div className="map-thumbnail map-thumbnail-carousel profile-location-carousel">
            <img className="cover" src={assetUrl(image.source_url)} alt={imageTitle} />
            {location.images.length > 1 ? (
              <>
                <button
                  type="button"
                  className="map-image-arrow map-image-arrow-left"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setImageIndex((current) => (current - 1 + location.images.length) % location.images.length);
                  }}
                  aria-label="Previous featured image"
                >
                  {"<"}
                </button>
                <button
                  type="button"
                  className="map-image-arrow map-image-arrow-right"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setImageIndex((current) => (current + 1) % location.images.length);
                  }}
                  aria-label="Next featured image"
                >
                  {">"}
                </button>
              </>
            ) : null}
          </div>
        ) : null}
        {image ? <strong>{imageTitle}</strong> : null}
        {location.images.length > 1 ? (
          <p className="subtle" style={{ marginTop: "0.35rem", marginBottom: "0.4rem" }}>
            {imageIndex + 1} of {location.images.length}
          </p>
        ) : null}
        <p>{location.description}</p>
        <div className="pill-row">
          <span className="pill">{location.visibility}</span>
          {location.zip_code ? <span className="pill">{location.zip_code}</span> : null}
          {location.tags.slice(0, 2).map((tag) => (
            <span key={tag.id} className="pill">
              {tag.name}
            </span>
          ))}
        </div>
      </Link>
    </div>
  );
}
