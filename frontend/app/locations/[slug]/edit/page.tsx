"use client";

import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";

import { LocationPickerMapClient } from "@/components/location-picker-map-client";
import { markHomeForRefresh } from "@/components/home-refresh-listener";
import { getCurrentUser, getLocation, updateLocation } from "@/lib/api";
import { getStoredToken } from "@/lib/auth";
import { normalizeErrorDetail } from "@/lib/errors";
import type { Location } from "@/lib/types";

type AddressParts = {
  streetAddress?: string;
  zipCode?: string;
  city?: string;
  region?: string;
  country?: string;
};

function extractAddressParts(address: Record<string, string | undefined> | undefined, displayName?: string): AddressParts {
  return {
    streetAddress: displayName?.trim() || undefined,
    zipCode: address?.postcode,
    city: address?.city || address?.town || address?.village || address?.hamlet || address?.suburb,
    region: address?.state || address?.region || address?.county,
    country: address?.country
  };
}

export default function EditLocationPage() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const autoLocatedRef = useRef(false);
  const [location, setLocation] = useState<Location | null>(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [approximateLatitude, setApproximateLatitude] = useState("");
  const [approximateLongitude, setApproximateLongitude] = useState("");
  const [name, setName] = useState("");
  const [streetAddress, setStreetAddress] = useState("");
  const [visibility, setVisibility] = useState("public");
  const [description, setDescription] = useState("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [country, setCountry] = useState("USA");
  const [zipCode, setZipCode] = useState("");
  const [tags, setTags] = useState("");
  const [mapZipCode, setMapZipCode] = useState("");
  const [locating, setLocating] = useState(false);
  const [geocodingZip, setGeocodingZip] = useState(false);
  const [resolvingPlace, setResolvingPlace] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);

  function updateCoordinates(nextLatitude: string, nextLongitude: string) {
    setLatitude(nextLatitude);
    setLongitude(nextLongitude);
    setApproximateLatitude(nextLatitude);
    setApproximateLongitude(nextLongitude);
  }

  function applyAddressParts(parts: AddressParts) {
    if (parts.streetAddress) {
      setStreetAddress(parts.streetAddress);
    }
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
        { headers: { Accept: "application/json" } }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.address) {
        return;
      }
      applyAddressParts(extractAddressParts(data.address as Record<string, string | undefined>, data.display_name));
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
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLatitude = position.coords.latitude.toFixed(6);
        const nextLongitude = position.coords.longitude.toFixed(6);
        updateCoordinates(nextLatitude, nextLongitude);
        setLocating(false);
        void reverseGeocode(nextLatitude, nextLongitude);
      },
      () => {
        setLocating(false);
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
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=us&postalcode=${encodeURIComponent(trimmed)}&addressdetails=1&limit=1`,
        { headers: { Accept: "application/json" } }
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
      applyAddressParts(extractAddressParts(place.address as Record<string, string | undefined>, place.display_name));
      setStatus(`ZIP code ${trimmed} placed on the map.`);
    } finally {
      setGeocodingZip(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const token = getStoredToken();
      if (!token) {
        if (!cancelled) {
          setHasAccess(false);
          setLoading(false);
          setStatus("Sign in to edit this location.");
        }
        return;
      }

      try {
        const [currentUser, currentLocation] = await Promise.all([getCurrentUser(token), getLocation(slug, token)]);
        if (!cancelled) {
          const allowed = currentUser.role === "admin" || currentUser.handle === currentLocation.creator_handle;
          setHasAccess(allowed);
          setLocation(currentLocation);
          setName(currentLocation.name);
          setStreetAddress(currentLocation.street_address || "");
          setVisibility(currentLocation.visibility);
          setDescription(currentLocation.description);
          setCity(currentLocation.city || "");
          setRegion(currentLocation.region || "");
          setCountry(currentLocation.country || "USA");
          setZipCode(currentLocation.zip_code || "");
          setMapZipCode(currentLocation.zip_code || "");
          setTags(currentLocation.tags.map((tag) => tag.name).join(", "));
          updateCoordinates(
            currentLocation.latitude?.toFixed(6) || "",
            currentLocation.longitude?.toFixed(6) || ""
          );
          setApproximateLatitude(currentLocation.latitude?.toFixed(6) || "");
          setApproximateLongitude(currentLocation.longitude?.toFixed(6) || "");
          setLoading(false);
          if (!allowed) {
            setStatus("You do not have permission to edit this location.");
          }
        }
      } catch (error) {
        if (!cancelled) {
          setLoading(false);
          setStatus(error instanceof Error ? error.message : "Unable to load location.");
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

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
      },
      () => {
        setStatus("Allow GPS or use the button to prefill the map.");
      }
    );
  }, [latitude, longitude]);

  async function saveLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = getStoredToken();
    if (!token || !location || !hasAccess) {
      return;
    }

    setSaving(true);
    try {
      await updateLocation(
        slug,
        {
          name,
          description,
          street_address: streetAddress,
          latitude: Number(latitude),
          longitude: Number(longitude),
          visibility,
          city,
          region,
          country,
          zip_code: zipCode,
          approximate_latitude: approximateLatitude ? Number(approximateLatitude) : undefined,
          approximate_longitude: approximateLongitude ? Number(approximateLongitude) : undefined,
          tags: tags
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
        },
        token
      );
    } catch (error) {
      setSaving(false);
      setStatus(error instanceof Error ? error.message : normalizeErrorDetail(undefined, "Location update failed."));
      return;
    }

    setSaving(false);
    markHomeForRefresh();
    setStatus("Location updated.");
    router.push(`/locations/${slug}`);
  }

  if (loading) {
    return (
      <section className="section">
        <div className="panel">
          <h2>Loading location...</h2>
        </div>
      </section>
    );
  }

  if (!hasAccess) {
    return (
      <section className="section">
        <div className="panel">
          <h2>Edit location</h2>
          <p>{status || "You do not have permission to edit this location."}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="section">
      <div className="panel">
        <span className="eyebrow">Edit location</span>
        <h2>{name || "Update listing"}</h2>
        <form className="form" onSubmit={saveLocation}>
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
            label={name || "Selected location"}
          />
          <div className="field">
            <label htmlFor="latitude">Latitude</label>
            <input id="latitude" type="number" step="0.000001" value={latitude} onChange={(event) => updateCoordinates(event.target.value, longitude)} required />
          </div>
          <div className="field">
            <label htmlFor="longitude">Longitude</label>
            <input id="longitude" type="number" step="0.000001" value={longitude} onChange={(event) => updateCoordinates(latitude, event.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="name">Location name</label>
            <input id="name" value={name} onChange={(event) => setName(event.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="street_address">Exact address</label>
            <input
              id="street_address"
              value={streetAddress}
              onChange={(event) => setStreetAddress(event.target.value)}
              placeholder="123 Main St, Los Angeles, CA 90012"
            />
          </div>
          <div className="field">
            <label htmlFor="visibility">Visibility</label>
            <select id="visibility" value={visibility} onChange={(event) => setVisibility(event.target.value)}>
              <option value="public">Public</option>
              <option value="private">Private</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="description">Short description</label>
            <textarea id="description" value={description} onChange={(event) => setDescription(event.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="tags">Tags or categories</label>
            <input id="tags" value={tags} onChange={(event) => setTags(event.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="city">City</label>
            <input id="city" value={city} onChange={(event) => setCity(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="region">Region / state</label>
            <input id="region" value={region} onChange={(event) => setRegion(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="country">Country</label>
            <input id="country" value={country} onChange={(event) => setCountry(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="zip_code">Zip code</label>
            <input id="zip_code" inputMode="numeric" list="zip-code-options" placeholder="90265" value={zipCode} onChange={(event) => setZipCode(event.target.value)} />
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
              type="number"
              step="0.000001"
              value={approximateLongitude}
              onChange={(event) => setApproximateLongitude(event.target.value)}
            />
          </div>
          <button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save location"}
          </button>
        </form>
        {status ? <p className="status">{status}</p> : null}
      </div>
    </section>
  );
}
