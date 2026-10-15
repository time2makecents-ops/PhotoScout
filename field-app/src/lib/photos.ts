import { Directory, File, Paths } from "expo-file-system";
import * as Crypto from "expo-crypto";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import type { ImagePickerAsset } from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";

import type { FieldPhoto } from "./types";

function ensureDirectory(...segments: string[]) {
  const directory = new Directory(Paths.document, ...segments);
  if (!directory.exists) directory.create({ intermediates: true, idempotent: true });
  return directory;
}

async function normalizedFile(uri: string, width: number, height: number, maxEdge: number, destination: File, quality: number) {
  const context = ImageManipulator.manipulate(uri);
  if (Math.max(width, height) > maxEdge) {
    if (width >= height) context.resize({ width: maxEdge, height: null });
    else context.resize({ width: null, height: maxEdge });
  }
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ compress: quality, format: SaveFormat.JPEG });
  await new File(saved.uri).copy(destination, { overwrite: true });
}

export async function preparePhoto(asset: ImagePickerAsset, captureId: string, position: number, saveOriginal: boolean): Promise<FieldPhoto> {
  if (saveOriginal) {
    const permission = await MediaLibrary.requestPermissionsAsync(true, ["photo"]);
    if (permission.granted) await MediaLibrary.Asset.create(asset.uri);
  }
  const id = Crypto.randomUUID();
  const uploadDir = ensureDirectory("field-uploads", captureId);
  const thumbnailDir = ensureDirectory("field-thumbnails", captureId);
  const full = new File(uploadDir, `${id}.jpg`);
  const thumbnail = new File(thumbnailDir, `${id}.jpg`);
  await normalizedFile(asset.uri, asset.width, asset.height, 4096, full, 0.85);
  await normalizedFile(asset.uri, asset.width, asset.height, 640, thumbnail, 0.72);
  return {
    id,
    capture_id: captureId,
    title: asset.fileName?.replace(/\.[^.]+$/, "") || `Location photo ${position + 1}`,
    image_role: position === 0 ? "area_image" : "location_photo",
    local_uri: full.uri,
    thumbnail_uri: thumbnail.uri,
    captured_at_device: new Date().toISOString(),
    heading_degrees: null,
    heading_label: null,
    position,
  };
}

export function deleteFileIfPresent(uri: string | null) {
  if (!uri) return;
  const file = new File(uri);
  if (file.exists) file.delete();
}
