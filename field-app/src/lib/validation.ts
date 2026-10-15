import type { FieldCapture } from "./types";

export function validateCapture(capture: FieldCapture): string[] {
  const errors: string[] = [];
  if (capture.name.trim().length < 2) errors.push("Add a title with at least 2 characters.");
  if (capture.notes.trim().length < 10) errors.push("Add notes with at least 10 characters.");
  if (!capture.tags.some((tag) => tag.trim())) errors.push("Add at least one tag.");
  if (capture.latitude === null || capture.longitude === null || !Number.isFinite(capture.latitude) || !Number.isFinite(capture.longitude) || Math.abs(capture.latitude) > 90 || Math.abs(capture.longitude) > 180) errors.push("Record valid GPS coordinates or enter them manually.");
  if (capture.photos.length > 12) errors.push("A capture can contain no more than 12 photos.");
  if (capture.photos.filter((photo) => photo.image_role === "area_image").length > 1) errors.push("Choose only one area shot.");
  if (capture.photos.some((photo) => !photo.title.trim())) errors.push("Every photo needs a title.");
  if (capture.photos.some((photo) => !photo.local_uri && capture.state !== "synced")) errors.push("One or more queued photo files are missing.");
  return errors;
}

export function parseTags(value: string): string[] {
  return [...new Set(value.split(",").map((tag) => tag.trim()).filter(Boolean))].slice(0, 20);
}

export function isAllowedApiBaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return true;
    if (url.protocol !== "http:") return false;
    const host = url.hostname;
    if (host === "localhost" || host === "127.0.0.1") return true;
    if (/^10\./.test(host) || /^192\.168\./.test(host)) return true;
    const match = host.match(/^172\.(\d+)\./);
    return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
  } catch {
    return false;
  }
}
