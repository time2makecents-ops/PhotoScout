"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { ImageSourceFields } from "@/components/image-source-fields";
import { LocationPickerMapClient } from "@/components/location-picker-map-client";
import { PhotoFileInputs } from "@/components/photo-file-inputs";
import { markHomeForRefresh } from "@/components/home-refresh-listener";
import { clearStoredToken, ensureLocalSession, getStoredToken } from "@/lib/auth";
import { getCurrentUser } from "@/lib/api";
import { normalizeErrorDetail } from "@/lib/errors";

const DRAFT_IMAGE_IDS_KEY = "photoscout-location-draft-image-ids";
const DRAFT_LOCATION_KEY = "photoscout-location-draft";

type AddressParts = { zipCode?: string; city?: string; region?: string; country?: string };
type LocationDraft = {
  latitude: string;
  longitude: string;
  name: string;
  notes: string;
  tags: string;
  visibility: string;
  city: string;
  region: string;
  country: string;
  zipCode: string;
  step: "map" | "details";
};

function readDraftImageIds(): number[] {
  try {
    const raw = window.localStorage.getItem(DRAFT_IMAGE_IDS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(Number).filter(Number.isInteger) : [];
  } catch {
    return [];
  }
}

function readLocationDraft(): LocationDraft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_LOCATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LocationDraft>;
    return {
      latitude: typeof parsed.latitude === "string" ? parsed.latitude : "",
      longitude: typeof parsed.longitude === "string" ? parsed.longitude : "",
      name: typeof parsed.name === "string" ? parsed.name : "",
      notes: typeof parsed.notes === "string" ? parsed.notes : "",
      tags: typeof parsed.tags === "string" ? parsed.tags : "",
      visibility: parsed.visibility === "private" ? "private" : "public",
      city: typeof parsed.city === "string" ? parsed.city : "",
      region: typeof parsed.region === "string" ? parsed.region : "",
      country: typeof parsed.country === "string" ? parsed.country : "USA",
      zipCode: typeof parsed.zipCode === "string" ? parsed.zipCode : "",
      step: parsed.step === "details" ? "details" : "map"
    };
  } catch {
    return null;
  }
}

function responseBody(response: Response) {
  return response.text().then((text) => {
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      return { detail: text || `Request failed with status ${response.status}` };
    }
  });
}

function addressParts(address: Record<string, string | undefined> | undefined): AddressParts {
  return {
    zipCode: address?.postcode,
    city: address?.city || address?.town || address?.village || address?.hamlet || address?.suburb,
    region: address?.state || address?.region || address?.county,
    country: address?.country
  };
}

export default function NewLocationPage() {
  const router = useRouter();
  const [hasToken, setHasToken] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [pinIsSet, setPinIsSet] = useState(false);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState("");
  const [visibility, setVisibility] = useState("public");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [country, setCountry] = useState("USA");
  const [zipCode, setZipCode] = useState("");
  const [status, setStatus] = useState("");
  const [creating, setCreating] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [areaShotOpen, setAreaShotOpen] = useState(false);
  const [areaFile, setAreaFile] = useState<File | null>(null);
  const [areaUploading, setAreaUploading] = useState(false);
  const [areaFormKey, setAreaFormKey] = useState(0);
  const [uploadedImageIds, setUploadedImageIds] = useState<number[]>([]);

  useEffect(() => {
    setUploadedImageIds(readDraftImageIds());
    const draft = readLocationDraft();
    if (draft) {
      setLatitude(draft.latitude);
      setLongitude(draft.longitude);
      setName(draft.name);
      setNotes(draft.notes);
      setTags(draft.tags);
      setVisibility(draft.visibility);
      setCity(draft.city);
      setRegion(draft.region);
      setCountry(draft.country);
      setZipCode(draft.zipCode);
      setPinIsSet(draft.step === "details" && Boolean(draft.latitude && draft.longitude));
      setStatus("Draft restored from this device.");
    }
    setDraftReady(true);
    void ensureLocalSession()
      .then((token) => getCurrentUser(token))
      .then(() => setHasToken(true))
      .catch(() => {
        clearStoredToken();
        setStatus("Could not start the local test session.");
      });
  }, []);

  useEffect(() => {
    if (!draftReady) return;
    const hasDraft = Boolean(latitude || longitude || name || notes || tags || uploadedImageIds.length);
    if (!hasDraft) {
      window.localStorage.removeItem(DRAFT_LOCATION_KEY);
      return;
    }
    const draft: LocationDraft = {
      latitude,
      longitude,
      name,
      notes,
      tags,
      visibility,
      city,
      region,
      country,
      zipCode,
      step: pinIsSet ? "details" : "map"
    };
    window.localStorage.setItem(DRAFT_LOCATION_KEY, JSON.stringify(draft));
  }, [city, country, draftReady, latitude, longitude, name, notes, pinIsSet, region, tags, uploadedImageIds.length, visibility, zipCode]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [pinIsSet]);

  function updateCoordinates(nextLatitude: string, nextLongitude: string) {
    setLatitude(nextLatitude);
    setLongitude(nextLongitude);
  }

  async function placePin(nextLatitude: number, nextLongitude: number) {
    updateCoordinates(nextLatitude.toFixed(6), nextLongitude.toFixed(6));
    setPinIsSet(true);
    setResolving(true);
    setStatus("Pin placed. Finding location details…");
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${nextLatitude}&lon=${nextLongitude}&addressdetails=1`, { headers: { Accept: "application/json" } });
      const data = await response.json().catch(() => ({}));
      const details = addressParts(data?.address);
      if (details.zipCode) setZipCode(details.zipCode);
      if (details.city) setCity(details.city);
      if (details.region) setRegion(details.region);
      if (details.country) setCountry(details.country);
    } catch {
      // Pin placement remains useful even if reverse geocoding is unavailable.
    } finally {
      setResolving(false);
      setStatus("Pin ready. Add the location details and save.");
    }
  }

  function cancelPin() {
    setPinIsSet(false);
    setLatitude("");
    setLongitude("");
    setStatus("Choose a spot on the map to start again.");
  }

  function returnToMap() {
    setPinIsSet(false);
  }

  async function uploadAreaShot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = getStoredToken();
    if (!token) {
      setStatus("Sign in before uploading an area shot.");
      return;
    }
    if (!areaFile) {
      setStatus("Choose an area shot first.");
      return;
    }
    setAreaUploading(true);
    try {
      const formData = new FormData(event.currentTarget);
      formData.set("file", areaFile);
      formData.set("image_role", "area_image");
      const response = await fetch("/api/uploads/images", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: formData });
      const data = await responseBody(response);
      if (!response.ok) {
        setStatus(normalizeErrorDetail(data.detail, "Area shot upload failed."));
        return;
      }
      setUploadedImageIds((current) => {
        const next = current.includes(data.id) ? current : [...current, data.id];
        window.localStorage.setItem(DRAFT_IMAGE_IDS_KEY, JSON.stringify(next));
        return next;
      });
      setAreaFile(null);
      setAreaFormKey((current) => current + 1);
      setAreaShotOpen(false);
      setStatus("Area shot ready to attach when you save the pin.");
    } catch {
      setStatus("Area shot upload could not connect. Your pin draft is still saved.");
    } finally {
      setAreaUploading(false);
    }
  }

  async function createLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = getStoredToken();
    if (!token) {
      setStatus("Sign in before saving a pin.");
      return;
    }
    if (!latitude || !longitude) {
      setStatus("Drag the pin onto the map before saving.");
      return;
    }
    if (name.trim().length < 2) {
      setStatus("Add a location name with at least 2 characters.");
      return;
    }
    if (notes.trim().length < 10) {
      setStatus("Add at least 10 characters of useful location notes.");
      return;
    }
    if (!tags.split(",").some((tag) => tag.trim())) {
      setStatus("Add at least one tag.");
      return;
    }
    setCreating(true);
    try {
      const response = await fetch("/api/locations", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: notes.trim(),
          tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
          visibility,
          latitude: Number(latitude),
          longitude: Number(longitude),
          approximate_latitude: Number(latitude),
          approximate_longitude: Number(longitude),
          city,
          region,
          country,
          zip_code: zipCode,
          uploaded_image_ids: uploadedImageIds
        })
      });
      const data = await responseBody(response);
      if (!response.ok) {
        setStatus(normalizeErrorDetail(data.detail, "Pin could not be saved."));
        return;
      }
      window.localStorage.removeItem(DRAFT_IMAGE_IDS_KEY);
      window.localStorage.removeItem(DRAFT_LOCATION_KEY);
      markHomeForRefresh();
      router.push(`/locations/${data.slug}`);
    } catch {
      setStatus("Pin could not connect to PhotoScout. Your draft is still saved on this device.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className={`add-pin-workspace ${pinIsSet ? "is-entering-details" : ""}`}>
      {!pinIsSet ? <LocationPickerMapClient latitude={latitude} longitude={longitude} onChange={updateCoordinates} onPickLocation={placePin} onCancel={() => router.push("/home")} /> : null}
      {pinIsSet ? <aside className="add-pin-editor" aria-label="New pin details">
        <div className="add-pin-editor-heading">
          <button type="button" className="details-back-button" onClick={returnToMap}>← Back to map</button>
          <span className="eyebrow">Step 2 of 2</span>
          <h1>Location details</h1>
          <p>Name the spot and add the notes another photographer would need.</p>
          <small className="draft-save-state">Saved on this device</small>
        </div>
        <form id="location-details-form" className="add-pin-form" onSubmit={createLocation}>
          <div className="field"><label htmlFor="location-name">Location <span>Required</span></label><input id="location-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Eugene Airport overlook" minLength={2} required /></div>
          <div className="field"><label htmlFor="location-notes">Notes <span>Required</span></label><textarea id="location-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Light, access, parking, timing, and what makes the view useful." minLength={10} required /></div>
          <div className="field"><label htmlFor="location-tags">Tags <span>Required</span></label><input id="location-tags" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="airport, terminal, sunrise" required /></div>
          <fieldset className="visibility-toggle"><legend>Visibility</legend><label><input type="radio" name="visibility" value="public" checked={visibility === "public"} onChange={() => setVisibility("public")} /> Public</label><label><input type="radio" name="visibility" value="private" checked={visibility === "private"} onChange={() => setVisibility("private")} /> Private</label></fieldset>
        </form>
        <details className="area-shot-drawer" open={areaShotOpen} onToggle={(event) => setAreaShotOpen(event.currentTarget.open)}>
          <summary>Add area shot {uploadedImageIds.length ? `(${uploadedImageIds.length} ready)` : "(optional)"}</summary>
          <form key={areaFormKey} className="add-pin-area-form" onSubmit={uploadAreaShot}>
            <PhotoFileInputs idPrefix="new-area-shot" selectedFile={areaFile} onSelect={setAreaFile} />
            <div className="field"><label htmlFor="area-shot-title">Image title</label><input id="area-shot-title" name="title" placeholder="Terminal approach at sunrise" required /></div>
            <ImageSourceFields idPrefix="new-area-shot" />
            <button type="submit" className="secondary" disabled={!hasToken || areaUploading}>{areaUploading ? "Uploading…" : "Upload area shot"}</button>
          </form>
        </details>
        <p className="add-pin-status" role="status">{status || (latitude ? "Pin placed." : "No pin placed yet.")}</p>
        <div className="add-pin-actions">
          <button type="submit" form="location-details-form" disabled={!hasToken || creating || resolving}>{creating ? "Saving pin…" : resolving ? "Finding address…" : "Save pin"}</button>
          <button type="button" className="secondary" onClick={cancelPin}>Cancel pin</button>
        </div>
      </aside> : null}
    </section>
  );
}
