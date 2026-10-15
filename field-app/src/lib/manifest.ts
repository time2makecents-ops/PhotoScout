import type { FieldCapture } from "./types";

export function captureManifest(capture: FieldCapture) {
  return {
    version: 1 as const,
    client_capture_id: capture.id,
    name: capture.name.trim(),
    notes: capture.notes.trim(),
    tags: capture.tags,
    visibility: capture.visibility,
    latitude: capture.latitude,
    longitude: capture.longitude,
    accuracy_meters: capture.accuracy_meters,
    heading_degrees: capture.heading_degrees,
    city: capture.city.trim(),
    region: capture.region.trim(),
    country: capture.country.trim(),
    zip_code: capture.zip_code.trim(),
    photos: capture.photos.map((photo) => ({
      client_photo_id: photo.id,
      title: photo.title.trim(),
      image_role: photo.image_role,
      captured_at_device: photo.captured_at_device,
      camera_heading_degrees: photo.heading_degrees,
      camera_heading_label: photo.heading_label,
      heading_source: photo.heading_degrees === null ? "unavailable" as const : "sensor" as const,
    })),
  };
}
