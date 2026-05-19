"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { LocationPickerMapClient } from "@/components/location-picker-map-client";
import { PhotoMetadataFields } from "@/components/photo-metadata-fields";
import { PhotoFileInputs } from "@/components/photo-file-inputs";
import { ShotConditionsCapture } from "@/components/shot-conditions-capture";
import Link from "next/link";

import { markHomeForRefresh } from "@/components/home-refresh-listener";
import { clearStoredToken, getStoredToken } from "@/lib/auth";
import { getCurrentUser, getProfile } from "@/lib/api";
import { normalizeErrorDetail } from "@/lib/errors";
import type { ImageAsset } from "@/lib/types";

const steps = ["Confirm map pin", "Name location", "Choose visibility", "Describe location", "Add tags", "Zip code", "Upload photo"];
const DRAFT_IMAGE_IDS_KEY = "photoscout-location-draft-image-ids";

async function readResponseBody(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { detail: text || `Request failed with status ${response.status}` };
  }
}

type AddressParts = {
  zipCode?: string;
  city?: string;
  region?: string;
  country?: string;
};

function extractAddressParts(address: Record<string, string | undefined> | undefined): AddressParts {
  return {
    zipCode: address?.postcode,
    city: address?.city || address?.town || address?.village || address?.hamlet || address?.suburb,
    region: address?.state || address?.region || address?.county,
    country: address?.country
  };
}

function readDraftImageIds(): number[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(DRAFT_IMAGE_IDS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(Number).filter((id) => Number.isInteger(id)) : [];
  } catch {
    return [];
  }
}

function writeDraftImageIds(ids: number[]) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(DRAFT_IMAGE_IDS_KEY, JSON.stringify(ids));
}

function clearDraftImageIds() {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(DRAFT_IMAGE_IDS_KEY);
}

export default function NewLocationPage() {
  const router = useRouter();
  const [uploadedImageIds, setUploadedImageIds] = useState<number[]>([]);
  const [status, setStatus] = useState<string>("");
  const [stepIndex] = useState(0);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [locationName, setLocationName] = useState("");
  const [streetAddress, setStreetAddress] = useState("");
  const [mapZipCode, setMapZipCode] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [country, setCountry] = useState("USA");
  const [approximateLatitude, setApproximateLatitude] = useState("");
  const [approximateLongitude, setApproximateLongitude] = useState("");
  const [locating, setLocating] = useState(false);
  const [geocodingZip, setGeocodingZip] = useState(false);
  const [resolvingPlace, setResolvingPlace] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [hasToken, setHasToken] = useState(false);
  const [currentHandle, setCurrentHandle] = useState<string | null>(null);
  const [recoverableImages, setRecoverableImages] = useState<ImageAsset[]>([]);
  const [selectedUploadFiles, setSelectedUploadFiles] = useState<Record<string, File | null>>({
    area: null,
    location: null
  });
  const autoLocatedRef = useRef(false);

  useEffect(() => {
    const draftImageIds = readDraftImageIds();
    if (draftImageIds.length) {
      setUploadedImageIds(draftImageIds);
      setStatus(`Recovered ${draftImageIds.length} uploaded image(s). They will attach to the next location you create.`);
    }

    const token = getStoredToken();
    if (!token) {
      setHasToken(false);
      setCurrentHandle(null);
      return;
    }
    void getCurrentUser(token)
      .then((me) => {
        setHasToken(true);
        setCurrentHandle(me.handle || null);
        if (me.handle) {
          void restoreUnattachedUploads(me.handle);
        }
      })
      .catch(() => {
        clearStoredToken();
        setHasToken(false);
        setCurrentHandle(null);
        setStatus("Session expired. Please sign in again.");
      });
  }, []);

  async function restoreUnattachedUploads(handle: string) {
    try {
      const profile = await getProfile(handle);
      const attachedImageIds = new Set(profile.created_locations.flatMap((location) => location.images.map((image) => image.id)));
      const unattachedImages = profile.uploaded_images.filter((image) => !image.location_id && !attachedImageIds.has(image.id));

      if (!unattachedImages.length) {
        setRecoverableImages([]);
        return;
      }

      setRecoverableImages(unattachedImages);
      if (!readDraftImageIds().length) {
        setStatus(`${unattachedImages.length} previous unattached upload(s) are available below. Select only the ones that belong to this new location.`);
      }
    } catch {
      // A failed recovery should not block normal manual uploads.
    }
  }

  function toggleRecoveredImage(imageId: number, selected: boolean) {
    setUploadedImageIds((current) => {
      const next = selected ? [...new Set([...current, imageId])] : current.filter((id) => id !== imageId);
      writeDraftImageIds(next);
      return next;
    });
  }

  useEffect(() => {
    if (autoLocatedRef.current || latitude || longitude || !navigator.geolocation) {
      return;
    }
    autoLocatedRef.current = true;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLatitude = position.coords.latitude.toFixed(6);
        const nextLongitude = position.coords.longitude.toFixed(6);
        updateCoordinates(nextLatitude, nextLongitude);
        void reverseGeocode(nextLatitude, nextLongitude);
        setStatus("Current location prefilled for the pin.");
      },
      () => {
        setStatus("Allow GPS or use the button to prefill the map.");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  }, [latitude, longitude]);

  function setFormValue(form: HTMLFormElement, name: string, value: string | null | undefined) {
    if (value == null || value === "") {
      return;
    }
    const field = form.elements.namedItem(name);
    if (!field) {
      return;
    }
    if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) {
      field.value = value;
    }
  }

  function updateCoordinates(nextLatitude: string, nextLongitude: string) {
    setLatitude(nextLatitude);
    setLongitude(nextLongitude);
    setApproximateLatitude(nextLatitude);
    setApproximateLongitude(nextLongitude);
  }

  function applyAddressParts(parts: AddressParts) {
    if (parts.zipCode) {
      setZipCode(parts.zipCode);
      setMapZipCode(parts.zipCode);
    }
    if (parts.city) {
      setCity(parts.city);
    }
    if (parts.region) {
      setRegion(parts.region);
    }
    if (parts.country) {
      setCountry(parts.country);
    }
  }

  async function reverseGeocode(nextLatitude: string, nextLongitude: string) {
    if (!nextLatitude || !nextLongitude || Number.isNaN(Number(nextLatitude)) || Number.isNaN(Number(nextLongitude))) {
      return;
    }

    setResolvingPlace(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(nextLatitude)}&lon=${encodeURIComponent(nextLongitude)}&addressdetails=1`,
        {
          headers: {
            Accept: "application/json"
          }
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.address) {
        return;
      }
      applyAddressParts(extractAddressParts(data.address as Record<string, string | undefined>));
    } finally {
      setResolvingPlace(false);
    }
  }

  async function useCurrentLocation() {
    if (!navigator.geolocation) {
      setStatus("This browser does not support GPS location.");
      return;
    }

    setLocating(true);
    setStatus("Requesting current location...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLatitude = position.coords.latitude.toFixed(6);
        const nextLongitude = position.coords.longitude.toFixed(6);
        updateCoordinates(nextLatitude, nextLongitude);
        setLocating(false);
        void reverseGeocode(nextLatitude, nextLongitude);
        setStatus("Current GPS coordinates added.");
      },
      (error) => {
        setLocating(false);
        if (error.code === error.PERMISSION_DENIED) {
          setStatus("Location permission was denied. Enable GPS access in the browser and try again.");
          return;
        }
        setStatus("Unable to get your current location.");
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  }

  async function useZipCode() {
    const trimmed = mapZipCode.trim();
    if (!trimmed) {
      setStatus("Enter a ZIP code first.");
      return;
    }

    setGeocodingZip(true);
    setStatus("Looking up ZIP code on the map...");
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=us&postalcode=${encodeURIComponent(trimmed)}&addressdetails=1&limit=1`,
        {
          headers: {
            Accept: "application/json"
          }
        }
      );
      const data = await response.json().catch(() => []);

      if (!response.ok || !Array.isArray(data) || data.length === 0) {
        setStatus("Could not find that ZIP code on the map.");
        return;
      }

      const place = data[0];
      const nextLatitude = String(Number(place.lat).toFixed(6));
      const nextLongitude = String(Number(place.lon).toFixed(6));
      updateCoordinates(nextLatitude, nextLongitude);
      setZipCode(place.address?.postcode || trimmed);
      applyAddressParts(extractAddressParts(place.address as Record<string, string | undefined>));
      setStatus(`ZIP code ${trimmed} placed on the map.`);
    } finally {
      setGeocodingZip(false);
    }
  }

  async function uploadFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const uploadForm = event.currentTarget;
    const token = getStoredToken();
    if (!token) {
      setStatus("Sign in before uploading images.");
      return;
    }

    setUploading(true);
    setStatus("Uploading image...");
    const formData = new FormData(uploadForm);
    const uploadKind = uploadForm.dataset.uploadKind === "location" ? "location" : "area";
    const selectedFile = selectedUploadFiles[uploadKind];
    if (!selectedFile) {
      setUploading(false);
      setStatus("Take a photo or choose a photo first.");
      return;
    }
    formData.set("file", selectedFile);
    formData.set("image_role", uploadKind === "area" ? "area_image" : "location_photo");
    const title = String(formData.get("title") || "").trim();
    if (!title) {
      const baseName = locationName.trim() || "PhotoScout location";
      formData.set("title", uploadKind === "area" ? `${baseName} area image` : `${baseName} location photo`);
    }
    const response = await fetch("/api/uploads/images", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    });
    const data = await readResponseBody(response);
    setUploading(false);
    if (!response.ok) {
      setStatus(normalizeErrorDetail(data.detail, "Upload failed."));
      return;
    }

    setUploadedImageIds((current) => {
      const next = current.includes(data.id) ? current : [...current, data.id];
      writeDraftImageIds(next);
      return next;
    });
    setSelectedUploadFiles((current) => ({ ...current, [uploadKind]: null }));
    const metadata = data.image_metadata || {};
    setFormValue(uploadForm, "camera_model", metadata.camera_model);
    setFormValue(uploadForm, "lens_model", metadata.lens_model);
    setFormValue(uploadForm, "focal_length", metadata.focal_length);
    setFormValue(uploadForm, "aperture", metadata.aperture);
    setFormValue(uploadForm, "shutter_speed", metadata.shutter_speed);
    setFormValue(uploadForm, "iso_speed", metadata.iso_speed);
    setFormValue(uploadForm, "white_balance", metadata.white_balance);
    setFormValue(uploadForm, "exposure_compensation", metadata.exposure_compensation);
    setFormValue(uploadForm, "taken_at", metadata.taken_at ? new Date(metadata.taken_at).toISOString().slice(0, 16) : null);
    setFormValue(uploadForm, "camera_direction", metadata.camera_direction);
    setStatus(`Image uploaded successfully. Image ID ${data.id} is ready. Press Create location to save the pin.`);
  }

  async function createLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = getStoredToken();
    if (!token) {
      setStatus("Sign in before creating a location.");
      return;
    }
    if (!uploadedImageIds.length) {
      setStatus("Upload at least one image before creating the location.");
      return;
    }
    if (!latitude || !longitude || Number.isNaN(Number(latitude)) || Number.isNaN(Number(longitude))) {
      setStatus("Place the pin on the map or use GPS/ZIP before creating the location.");
      return;
    }

    setCreating(true);
    setStatus("Creating location...");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/locations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: form.get("name"),
        latitude: Number(form.get("latitude")),
        longitude: Number(form.get("longitude")),
        approximate_latitude: form.get("approximate_latitude") ? Number(form.get("approximate_latitude")) : undefined,
        approximate_longitude: form.get("approximate_longitude") ? Number(form.get("approximate_longitude")) : undefined,
        visibility: form.get("visibility"),
        description: form.get("description"),
        city: form.get("city"),
        region: form.get("region"),
        country: form.get("country"),
        street_address: streetAddress,
        zip_code: zipCode,
        tags: String(form.get("tags") || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        uploaded_image_ids: uploadedImageIds
      })
    });
    const data = await readResponseBody(response);
    setCreating(false);
    if (!response.ok) {
      setStatus(normalizeErrorDetail(data.detail, "Location creation failed."));
      return;
    }

    markHomeForRefresh();
    clearDraftImageIds();
    setStatus(`Location created: ${data.name}`);
    router.push(`/locations/${data.slug}`);
  }

  return (
    <section className="section">
      <div className="panel">
        <span className="eyebrow">Add pin flow</span>
        <h2>Create a location listing</h2>
        <div className="stepper">
          {steps.map((step, index) => (
            <span key={step} className={`step ${index === stepIndex ? "active" : ""}`}>
              {index + 1}. {step}
            </span>
          ))}
        </div>

        <div className="panel" style={{ marginTop: "1rem" }}>
          <span className="eyebrow">Session</span>
          <h3>{hasToken ? "Authenticated" : "Sign in required"}</h3>
          <p className="subtle">
            Upload and create actions require an auth token in this phone browser.
          </p>
          {!hasToken ? (
            <Link href="/login" className="button">
              Sign in
            </Link>
          ) : (
            <div className="pill-row">
              <span className="pill">Ready to upload</span>
              {currentHandle ? <span className="pill">@{currentHandle}</span> : null}
              {uploadedImageIds.length ? <span className="pill">{uploadedImageIds.length} image(s) ready</span> : null}
            </div>
          )}
        </div>

        <div className="panel-grid" style={{ marginTop: "1rem" }}>
          <form className="form panel" onSubmit={createLocation}>
            <h3>1-6. Enter listing details</h3>
            <div className="field">
              <label>Use phone GPS</label>
              <button type="button" className="secondary" onClick={useCurrentLocation} disabled={locating || resolvingPlace}>
                {locating ? "Getting location..." : "Use current location"}
              </button>
            </div>
            <div className="field">
              <label htmlFor="map_zip_code">ZIP code for map</label>
              <div className="inline">
                <input
                  id="map_zip_code"
                  name="map_zip_code"
                  inputMode="numeric"
                  list="zip-code-options"
                  placeholder="90265"
                  value={mapZipCode}
                  onChange={(event) => setMapZipCode(event.target.value)}
                />
                <button type="button" className="secondary" onClick={useZipCode} disabled={geocodingZip || resolvingPlace}>
                  {geocodingZip ? "Finding..." : "Place pin"}
                </button>
              </div>
            </div>
            <LocationPickerMapClient
              latitude={latitude}
              longitude={longitude}
              onChange={updateCoordinates}
              onPickLocation={(nextLatitude, nextLongitude) => {
                void reverseGeocode(nextLatitude.toFixed(6), nextLongitude.toFixed(6));
              }}
              label={locationName || "Selected location"}
            />
            <div className="field">
              <label htmlFor="latitude">Latitude</label>
              <input
                id="latitude"
                name="latitude"
                type="number"
                step="0.000001"
                value={latitude}
                onChange={(event) => updateCoordinates(event.target.value, longitude)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="longitude">Longitude</label>
              <input
                id="longitude"
                name="longitude"
                type="number"
                step="0.000001"
                value={longitude}
                onChange={(event) => updateCoordinates(latitude, event.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="name">Location name</label>
              <input id="name" name="name" value={locationName} onChange={(event) => setLocationName(event.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="street_address">Exact address</label>
              <input
                id="street_address"
                name="street_address"
                value={streetAddress}
                onChange={(event) => setStreetAddress(event.target.value)}
                placeholder="123 Main St, Los Angeles, CA 90012"
              />
              <p className="subtle">Optional. Saved exactly as entered. GPS, ZIP, and the map will fill city and ZIP, but not the exact address.</p>
            </div>
            <div className="field">
              <label htmlFor="visibility">Visibility</label>
              <select id="visibility" name="visibility" defaultValue="public">
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="description">Short description</label>
              <textarea id="description" name="description" required />
            </div>
            <div className="field">
              <label htmlFor="tags">Tags or categories</label>
              <input id="tags" name="tags" placeholder="coastal, dusk, modernist" required />
            </div>
            <div className="field">
              <label htmlFor="city">City</label>
              <input id="city" name="city" value={city} onChange={(event) => setCity(event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="region">Region / state</label>
              <input id="region" name="region" value={region} onChange={(event) => setRegion(event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="country">Country</label>
              <input id="country" name="country" value={country} onChange={(event) => setCountry(event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="zip_code">Zip code</label>
              <input
                id="zip_code"
                name="zip_code"
                inputMode="numeric"
                list="zip-code-options"
                placeholder="90265"
                value={zipCode}
                onChange={(event) => setZipCode(event.target.value)}
              />
              <datalist id="zip-code-options">
                <option value="90265" />
                <option value="90049" />
                <option value="90272" />
                <option value="91364" />
                <option value="90401" />
                <option value="92663" />
                <option value="92101" />
                <option value="94103" />
              </datalist>
            </div>
            <div className="field">
              <label htmlFor="approximate_latitude">Approximate latitude for private listings</label>
              <input
                id="approximate_latitude"
                name="approximate_latitude"
                type="number"
                step="0.000001"
                value={approximateLatitude}
                onChange={(event) => setApproximateLatitude(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="approximate_longitude">Approximate longitude for private listings</label>
              <input
                id="approximate_longitude"
                name="approximate_longitude"
                type="number"
                step="0.000001"
                value={approximateLongitude}
                onChange={(event) => setApproximateLongitude(event.target.value)}
              />
            </div>
            <button type="submit" disabled={!hasToken || !uploadedImageIds.length || creating}>
              {creating ? "Creating..." : "Create location"}
            </button>
            {!uploadedImageIds.length ? <p className="subtle">Upload at least one image below to enable location creation.</p> : null}
          </form>

          {recoverableImages.length ? (
            <div className="form panel">
              <h3>Previous unattached uploads</h3>
              <p className="subtle">These photos were uploaded earlier but not tied to a pin. Select only photos that belong to this new location.</p>
              {recoverableImages.map((image) => (
                <label key={image.id} className="card">
                  <input
                    type="checkbox"
                    checked={uploadedImageIds.includes(image.id)}
                    onChange={(event) => toggleRecoveredImage(image.id, event.target.checked)}
                  />{" "}
                  {image.title}
                  <span className="subtle" style={{ display: "block" }}>
                    {image.caption || "No caption"}
                  </span>
                </label>
              ))}
            </div>
          ) : null}

          <form className="form panel" onSubmit={uploadFile} data-upload-kind="area">
            <h3>7. Upload area image</h3>
            <p className="subtle">This is the overview image for the listing. Shot conditions are optional and saved when your phone can provide them.</p>
            <PhotoFileInputs
              idPrefix="area-shot"
              selectedFile={selectedUploadFiles.area}
              onSelect={(file) => setSelectedUploadFiles((current) => ({ ...current, area: file }))}
            />
            <ShotConditionsCapture idPrefix="area-shot" selectedFile={selectedUploadFiles.area} />
            <div className="field">
              <label htmlFor="area-shot-title">Image title</label>
              <input id="area-shot-title" name="title" placeholder={locationName ? `${locationName} area image` : "Area image"} />
            </div>
            <div className="field">
              <label htmlFor="area-shot-caption">Caption</label>
              <textarea id="area-shot-caption" name="caption" />
            </div>
            <input type="hidden" name="featured" value="true" />
            <button type="submit" disabled={!hasToken || uploading}>
              {uploading ? "Uploading..." : "Upload area image"}
            </button>
          </form>

          <form className="form panel" onSubmit={uploadFile} data-upload-kind="location">
            <h3>8. Upload photo from this location</h3>
            <p className="subtle">Use this for a photo captured at the location itself, with full metadata.</p>
            <PhotoFileInputs
              idPrefix="location-photo"
              selectedFile={selectedUploadFiles.location}
              onSelect={(file) => setSelectedUploadFiles((current) => ({ ...current, location: file }))}
            />
            <div className="field">
              <label htmlFor="location-photo-title">Image title</label>
              <input id="location-photo-title" name="title" placeholder={locationName ? `${locationName} location photo` : "Location photo"} />
            </div>
            <div className="field">
              <label htmlFor="location-photo-caption">Caption</label>
              <textarea id="location-photo-caption" name="caption" />
            </div>
            <ShotConditionsCapture idPrefix="location-photo" selectedFile={selectedUploadFiles.location} />
            <PhotoMetadataFields prefix="location-photo" showCameraDirection={false} />
            <input type="hidden" name="featured" value="false" />
            <button type="submit" disabled={!hasToken || uploading}>
              {uploading ? "Uploading..." : "Upload location photo"}
            </button>
          </form>
        </div>
        {status ? <p className="status">{status}</p> : null}
        {resolvingPlace ? <p className="subtle">Resolving ZIP and address from the pin...</p> : null}
      </div>
    </section>
  );
}
