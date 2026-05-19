"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { PrivateLocationContact } from "@/components/private-location-contact";
import { PhotoFileInputs } from "@/components/photo-file-inputs";
import { PhotoMetadataFields } from "@/components/photo-metadata-fields";
import { ShotConditionsCapture } from "@/components/shot-conditions-capture";
import {
  addImageToLocation,
  assetUrl,
  deleteLocation,
  deleteLocationImage,
  getCurrentUser,
  getLocation
} from "@/lib/api";
import { getStoredToken } from "@/lib/auth";
import { normalizeErrorDetail } from "@/lib/errors";
import type { ImageAsset, Location } from "@/lib/types";

type CurrentUser = {
  id: number;
  email: string;
  role: string;
  is_active: boolean;
  handle?: string | null;
};

type Props = {
  initialLocation: Location;
};

function formatValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return String(value);
}

function metadataItems(image: ImageAsset) {
  const metadata = image.image_metadata;
  if (!metadata) {
    return [];
  }

  const gpsSummary =
    metadata.gps_latitude !== null &&
    metadata.gps_latitude !== undefined &&
    metadata.gps_longitude !== null &&
    metadata.gps_longitude !== undefined
      ? `${metadata.gps_latitude.toFixed(5)}, ${metadata.gps_longitude.toFixed(5)}`
      : null;

  const headingSummary =
    metadata.camera_direction || (metadata.camera_heading_degrees !== null && metadata.camera_heading_degrees !== undefined
      ? `${Math.round(metadata.camera_heading_degrees)} ${metadata.camera_heading_label || ""}`.trim()
      : null);

  return [
    ["GPS", gpsSummary],
    ["Captured", metadata.captured_at_device],
    ["Facing", headingSummary],
    ["Heading source", metadata.heading_source],
    ["Pitch", metadata.camera_pitch_degrees !== null && metadata.camera_pitch_degrees !== undefined ? `${metadata.camera_pitch_degrees} deg` : null],
    ["Roll", metadata.camera_roll_degrees !== null && metadata.camera_roll_degrees !== undefined ? `${metadata.camera_roll_degrees} deg` : null],
    ["Camera", metadata.camera_model],
    ["Lens", metadata.lens_model],
    ["Focal length", metadata.focal_length],
    ["Aperture", metadata.aperture],
    ["Shutter", metadata.shutter_speed],
    ["ISO", metadata.iso_speed],
    ["White balance", metadata.white_balance],
    ["Exposure", metadata.exposure_compensation],
    ["Taken at", metadata.taken_at],
    ["Weather", metadata.weather],
    ["Season", metadata.season],
    ["Sun", metadata.sun_position],
    ["POV", metadata.point_of_view],
    ["Distance", metadata.distance_to_subject],
    ["Notes", metadata.notes]
  ].filter(([, value]) => Boolean(value));
}

export function LocationDetailClient({ initialLocation }: Props) {
  const router = useRouter();
  const [location, setLocation] = useState(initialLocation);
  const [viewer, setViewer] = useState<CurrentUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [status, setStatus] = useState("");
  const [addingPhoto, setAddingPhoto] = useState(false);
  const [deletingLocation, setDeletingLocation] = useState(false);
  const [deletingImageId, setDeletingImageId] = useState<number | null>(null);
  const [selectedPhotoFile, setSelectedPhotoFile] = useState<File | null>(null);

  const canManage = Boolean(viewer && (viewer.role === "admin" || viewer.handle === location.creator_handle));

  useEffect(() => {
    let cancelled = false;

    async function loadViewerAndLocation() {
      const token = getStoredToken();
      if (!token) {
        if (!cancelled) {
          setViewer(null);
          setLocation(initialLocation);
          setAuthReady(true);
          setStatus("");
        }
        return;
      }

      try {
        const [me, freshLocation] = await Promise.all([getCurrentUser(token), getLocation(initialLocation.slug, token)]);
        if (!cancelled) {
          setViewer(me);
          setLocation(freshLocation);
          setStatus("");
        }
      } catch (error) {
        if (!cancelled) {
          setViewer(null);
          setLocation(initialLocation);
          setStatus(error instanceof Error ? error.message : "Unable to load location permissions.");
        }
      } finally {
        if (!cancelled) {
          setAuthReady(true);
        }
      }
    }

    function syncViewer() {
      void loadViewerAndLocation();
    }

    void loadViewerAndLocation();
    window.addEventListener("photoscout-auth-changed", syncViewer);
    window.addEventListener("storage", syncViewer);
    return () => {
      cancelled = true;
      window.removeEventListener("photoscout-auth-changed", syncViewer);
      window.removeEventListener("storage", syncViewer);
    };
  }, [initialLocation.slug]);

  const photoCount = location.images.length;

  async function onAddPhoto(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = getStoredToken();
    if (!token) {
      setStatus("Sign in to add photos to this pin.");
      return;
    }
    if (!canManage) {
      setStatus("Only the owner or an admin can add photos to this pin.");
      return;
    }

    setAddingPhoto(true);
    try {
      if (!selectedPhotoFile) {
        setStatus("Take a photo or choose a photo first.");
        return;
      }
      const formData = new FormData(event.currentTarget);
      formData.set("file", selectedPhotoFile);
      formData.set("image_role", "location_photo");
      const updated = await addImageToLocation(location.slug, formData, token);
      setLocation(updated);
      event.currentTarget.reset();
      setSelectedPhotoFile(null);
      setStatus("Photo added to this pin.");
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : normalizeErrorDetail(undefined, "Unable to add photo."));
    } finally {
      setAddingPhoto(false);
    }
  }

  async function onDeletePhoto(imageId: number) {
    const token = getStoredToken();
    if (!token) {
      setStatus("Sign in to delete photos from this pin.");
      return;
    }
    if (!canManage) {
      setStatus("Only the owner or an admin can delete photos from this pin.");
      return;
    }
    if (!window.confirm("Delete this photo from the pin?")) {
      return;
    }

    setDeletingImageId(imageId);
    try {
      const updated = await deleteLocationImage(location.slug, imageId, token);
      setLocation(updated);
      setStatus("Photo deleted.");
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : normalizeErrorDetail(undefined, "Unable to delete photo."));
    } finally {
      setDeletingImageId(null);
    }
  }

  async function onDeleteLocation() {
    const token = getStoredToken();
    if (!token) {
      setStatus("Sign in to delete this pin.");
      return;
    }
    if (!canManage) {
      setStatus("Only the owner or an admin can delete this pin.");
      return;
    }
    if (!window.confirm("Delete this location and all attached photos? This cannot be undone.")) {
      return;
    }

    setDeletingLocation(true);
    try {
      await deleteLocation(location.slug, token);
      router.push("/home");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : normalizeErrorDetail(undefined, "Unable to delete location."));
    } finally {
      setDeletingLocation(false);
    }
  }

  return (
    <section className="section">
      <div className="panel-grid">
        <div className="panel">
          <span className="eyebrow">{location.visibility} listing</span>
          <h2>{location.name}</h2>
          <p>{location.description}</p>
          <div className="pill-row">
            <span className="pill">Pinned by {location.creator_name}</span>
            <span className="pill">@{location.creator_handle}</span>
            <span className="pill">
              {location.city}
              {location.region ? `, ${location.region}` : ""}
            </span>
            {location.country ? <span className="pill">{location.country}</span> : null}
            {formatValue(location.street_address) ? <span className="pill">{location.street_address}</span> : null}
            {location.zip_code ? <span className="pill">{location.zip_code}</span> : null}
            {location.tags.map((tag) => (
              <span key={tag.id} className="pill">
                {tag.name}
              </span>
            ))}
          </div>
          <p className="subtle" style={{ marginTop: "1rem" }}>
            Coordinates shown:{" "}
            {location.latitude !== null && location.latitude !== undefined ? location.latitude.toFixed(6) : "Hidden"},{" "}
            {location.longitude !== null && location.longitude !== undefined ? location.longitude.toFixed(6) : "Hidden"}
          </p>
          {status ? <p className="status">{status}</p> : null}
          {authReady && canManage ? (
            <div className="pill-row" style={{ marginTop: "1rem" }}>
              <Link href={`/locations/${location.slug}/edit`} className="button secondary">
                Edit location
              </Link>
              <button type="button" className="secondary" onClick={onDeleteLocation} disabled={deletingLocation}>
                {deletingLocation ? "Deleting..." : "Delete location"}
              </button>
            </div>
          ) : null}
        </div>
        {location.visibility === "private" && authReady && !canManage ? (
          <PrivateLocationContact locationId={location.id} ownerName={location.creator_name} />
        ) : null}
      </div>

      {authReady && canManage ? (
        <div className="panel section">
          <span className="eyebrow">Add photo to this pin</span>
          <h3>Attach a new image</h3>
          <p className="subtle">Upload another photo that belongs to this location and save its metadata with the pin.</p>
          <form className="form" onSubmit={onAddPhoto}>
            <PhotoFileInputs idPrefix="pin-detail-photo" selectedFile={selectedPhotoFile} onSelect={setSelectedPhotoFile} />
            <div className="field">
              <label htmlFor="location-photo-title">Image title</label>
              <input id="location-photo-title" name="title" required />
            </div>
            <div className="field">
              <label htmlFor="location-photo-caption">Caption</label>
              <textarea id="location-photo-caption" name="caption" />
            </div>
            <div className="field">
              <label>
                <input type="checkbox" name="featured" /> Featured on pin
              </label>
            </div>
            <ShotConditionsCapture idPrefix="pin-detail-photo" />
            <PhotoMetadataFields prefix="location-photo" showCameraDirection={false} />
            <button type="submit" disabled={addingPhoto}>
              {addingPhoto ? "Uploading..." : "Add photo"}
            </button>
          </form>
        </div>
      ) : authReady && viewer ? (
        <p className="subtle section">Only the owner or an admin can add, edit, or delete photos for this pin.</p>
      ) : null}

      <div className="section">
        <div className="cards-2">
          {photoCount ? (
            location.images.map((image) => (
              <div key={image.id} className="card">
                <Link href={`/images/${image.id}`}>
                  <img className="cover" src={assetUrl(image.source_url)} alt={image.title} />
                  <h3>{image.title}</h3>
                  <p>{image.caption}</p>
                </Link>
                <div className="pill-row">
                  {image.featured ? <span className="pill">Featured</span> : null}
                  {image.licensing_available ? <span className="pill">Licensing available</span> : null}
                </div>
                <div className="pill-row">
                  {metadataItems(image).map(([label, value]) => (
                    <span key={`${image.id}-${label}`} className="pill" title={label ?? undefined}>
                      {value}
                    </span>
                  ))}
                </div>
                {authReady && canManage ? (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => void onDeletePhoto(image.id)}
                    disabled={deletingImageId === image.id}
                  >
                    {deletingImageId === image.id ? "Deleting..." : "Delete photo"}
                  </button>
                ) : null}
              </div>
            ))
          ) : (
            <div className="panel">
              <h3>No photos yet</h3>
              <p className="subtle">This pin does not have any attached photos yet.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
