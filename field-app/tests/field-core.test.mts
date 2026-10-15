import assert from "node:assert/strict";
import test from "node:test";

import { captureManifest } from "../src/lib/manifest.ts";
import type { FieldCapture } from "../src/lib/types.ts";
import { isAllowedApiBaseUrl, parseTags, validateCapture } from "../src/lib/validation.ts";

function capture(overrides: Partial<FieldCapture> = {}): FieldCapture {
  return {
    id: "30d9f927-771a-4880-8fef-8a888c08f2e3",
    name: "River access",
    notes: "Clear access beside the old bridge.",
    tags: ["river"],
    visibility: "private",
    latitude: 44.05,
    longitude: -123.08,
    accuracy_meters: 6,
    heading_degrees: 270,
    city: "Eugene",
    region: "OR",
    country: "USA",
    zip_code: "97401",
    state: "ready",
    error_message: null,
    receipt_id: null,
    location_id: null,
    slug: null,
    created_at: "2026-10-13T12:00:00Z",
    updated_at: "2026-10-13T12:00:00Z",
    photos: [],
    ...overrides,
  };
}

test("validates the minimum offline package and GPS ranges", () => {
  assert.deepEqual(validateCapture(capture()), []);
  assert.ok(validateCapture(capture({ latitude: Number.NaN })).some((error) => error.includes("GPS")));
  assert.ok(validateCapture(capture({ notes: "short" })).some((error) => error.includes("notes")));
});

test("normalizes tags without duplicates", () => {
  assert.deepEqual(parseTags(" river, industrial, river,  sunset "), ["river", "industrial", "sunset"]);
});

test("only allows HTTPS or private-LAN HTTP pairing targets", () => {
  assert.equal(isAllowedApiBaseUrl("https://app.photoscout.example"), true);
  assert.equal(isAllowedApiBaseUrl("http://192.168.1.20:8010"), true);
  assert.equal(isAllowedApiBaseUrl("http://172.20.10.2:8010"), true);
  assert.equal(isAllowedApiBaseUrl("http://8.8.8.8:8010"), false);
});

test("builds the ordered server manifest with automatic original-edited semantics", () => {
  const photoCapture = capture({ photos: [{ id: "photo-1", capture_id: "capture-1", title: " Area shot ", image_role: "area_image", local_uri: "file:///full.jpg", thumbnail_uri: "file:///thumb.jpg", captured_at_device: "2026-10-13T12:00:00Z", heading_degrees: 90, heading_label: "E", position: 0 }] });
  const manifest = captureManifest(photoCapture);
  assert.equal(manifest.photos[0].title, "Area shot");
  assert.equal(manifest.photos[0].image_role, "area_image");
  assert.equal(manifest.photos[0].heading_source, "sensor");
  assert.equal("camera_model" in manifest.photos[0], false);
});
