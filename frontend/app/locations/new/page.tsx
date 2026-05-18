"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { LocationPickerMapClient } from "@/components/location-picker-map-client";
import { getStoredToken, setStoredToken } from "@/lib/auth";
import { normalizeErrorDetail } from "@/lib/errors";
import { PhotoMetadataFields } from "@/components/photo-metadata-fields";

const steps = ["Confirm map pin", "Name location", "Choose visibility", "Describe location", "Add tags", "Zip code", "Upload photo"];

async function readResponseBody(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { detail: text || `Request failed with status ${response.status}` };
  }
}

export default function NewLocationPage() {
  const router = useRouter();
  const [uploadedImageIds, setUploadedImageIds] = useState<number[]>([]);
  const [status, setStatus] = useState<string>("");
  const [stepIndex] = useState(0);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [locationName, setLocationName] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [approximateLatitude, setApproximateLatitude] = useState("");
  const [approximateLongitude, setApproximateLongitude] = useState("");
  const [locating, setLocating] = useState(false);
  const [geocodingZip, setGeocodingZip] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [hasToken, setHasToken] = useState(false);

  const apiBase = useMemo(() => "", []);

  useEffect(() => {
    setHasToken(Boolean(getStoredToken()));
  }, []);

  async function signInDemoPhotographer() {
    setStatus("Signing in to the seeded demo photographer account...");
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "maya@photoscout.example.com",
        password: "password123"
      })
    });
    const data = await readResponseBody(response);
    if (!response.ok) {
      setStatus(normalizeErrorDetail(data.detail, "Demo sign-in failed."));
      return;
    }
    setStoredToken(data.token);
    setHasToken(true);
    setStatus("Signed in. You can upload a photo and create a location now.");
  }

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

  function useCurrentLocation() {
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
        setLatitude(nextLatitude);
        setLongitude(nextLongitude);
        setApproximateLatitude(nextLatitude);
        setApproximateLongitude(nextLongitude);
        setLocating(false);
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

  function updateCoordinates(nextLatitude: string, nextLongitude: string) {
    setLatitude(nextLatitude);
    setLongitude(nextLongitude);
    setApproximateLatitude(nextLatitude);
    setApproximateLongitude(nextLongitude);
  }

  async function useZipCode() {
    const trimmed = zipCode.trim();
    if (!trimmed) {
      setStatus("Enter a ZIP code first.");
      return;
    }

    setGeocodingZip(true);
    setStatus("Looking up ZIP code on the map...");
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=us&postalcode=${encodeURIComponent(trimmed)}&limit=1`,
      {
        headers: {
          Accept: "application/json"
        }
      }
    );
    const data = await response.json().catch(() => []);
    setGeocodingZip(false);

    if (!response.ok || !Array.isArray(data) || data.length === 0) {
      setStatus("Could not find that ZIP code on the map.");
      return;
    }

    const place = data[0];
    updateCoordinates(String(Number(place.lat).toFixed(6)), String(Number(place.lon).toFixed(6)));
    setStatus(`ZIP code ${trimmed} placed on the map.`);
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
    const response = await fetch(`${apiBase}/api/uploads/images`, {
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

    setUploadedImageIds((current) => (current.includes(data.id) ? current : [...current, data.id]));
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
    setStatus(`Image uploaded successfully. Image ID ${data.id} is ready for this listing.`);
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
    const response = await fetch(`${apiBase}/api/locations`, {
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
        zip_code: form.get("zip_code"),
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

    setStatus(`Location created: ${data.name}`);
    router.push("/home");
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
            Upload and create actions require an auth token in this phone browser. Use the seeded demo account if needed.
          </p>
          {!hasToken ? (
            <button type="button" onClick={signInDemoPhotographer}>
              Sign in as demo photographer
            </button>
          ) : (
            <div className="pill-row">
              <span className="pill">Ready to upload</span>
              {uploadedImageIds.length ? <span className="pill">{uploadedImageIds.length} image(s) ready</span> : null}
            </div>
          )}
        </div>

        <div className="panel-grid" style={{ marginTop: "1rem" }}>
          <form className="form panel" onSubmit={createLocation}>
            <h3>1-6. Enter listing details</h3>
            <div className="field">
              <label>Use phone GPS</label>
              <button type="button" className="secondary" onClick={useCurrentLocation} disabled={locating}>
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
                  value={zipCode}
                  onChange={(event) => setZipCode(event.target.value)}
                />
                <button type="button" className="secondary" onClick={useZipCode} disabled={geocodingZip}>
                  {geocodingZip ? "Finding..." : "Place pin"}
                </button>
              </div>
            </div>
            <LocationPickerMapClient latitude={latitude} longitude={longitude} onChange={updateCoordinates} label={locationName || "Selected location"} />
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
              <input id="city" name="city" />
            </div>
            <div className="field">
              <label htmlFor="region">Region / state</label>
              <input id="region" name="region" />
            </div>
            <div className="field">
              <label htmlFor="country">Country</label>
              <input id="country" name="country" defaultValue="USA" />
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

          <form className="form panel" onSubmit={uploadFile}>
            <h3>7. Upload area image</h3>
            <p className="subtle">This is the overview image for the listing. It does not need camera metadata.</p>
            <div className="field">
              <label htmlFor="area-shot-file">Image file</label>
              <input id="area-shot-file" name="file" type="file" accept="image/*" required />
            </div>
            <div className="field">
              <label htmlFor="area-shot-title">Image title</label>
              <input id="area-shot-title" name="title" required />
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

          <form className="form panel" onSubmit={uploadFile}>
            <h3>8. Upload photo from this location</h3>
            <p className="subtle">Use this for a photo captured at the location itself, with full metadata.</p>
            <div className="field">
              <label htmlFor="location-photo-file">Image file</label>
              <input id="location-photo-file" name="file" type="file" accept="image/*" required />
            </div>
            <div className="field">
              <label htmlFor="location-photo-title">Image title</label>
              <input id="location-photo-title" name="title" required />
            </div>
            <div className="field">
              <label htmlFor="location-photo-caption">Caption</label>
              <textarea id="location-photo-caption" name="caption" />
            </div>
            <PhotoMetadataFields prefix="location-photo" />
            <input type="hidden" name="featured" value="false" />
            <button type="submit" disabled={!hasToken || uploading}>
              {uploading ? "Uploading..." : "Upload location photo"}
            </button>
          </form>
        </div>
        {status ? <p className="status">{status}</p> : null}
      </div>
    </section>
  );
}
