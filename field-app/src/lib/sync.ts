import type { SQLiteDatabase } from "expo-sqlite";
import { File } from "expo-file-system";

import { clearSyncedPhotoFile, markSynced, updateCapture } from "./db";
import { captureManifest } from "./manifest";
import { deleteFileIfPresent } from "./photos";
import { getCredential } from "./pairing";
import type { FieldCapture, SyncReceipt } from "./types";
import { validateCapture } from "./validation";

export async function syncCapture(db: SQLiteDatabase, capture: FieldCapture): Promise<SyncReceipt> {
  const errors = validateCapture(capture);
  if (errors.length) throw new Error(errors[0]);
  const credential = await getCredential();
  if (!credential) throw new Error("Pair this phone with PhotoScout before syncing.");

  await updateCapture(db, capture.id, { state: "syncing", error_message: null });
  try {
    const form = new FormData();
    form.append("manifest", JSON.stringify(captureManifest(capture)));
    capture.photos.forEach((photo, index) => {
      form.append("files", new File(photo.local_uri!), `field-${index + 1}.jpg`);
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);
    const response = await fetch(`${credential.api_base_url.replace(/\/$/, "")}/api/field-sync/captures`, {
      method: "POST",
      headers: { Authorization: `Bearer ${credential.device_token}` },
      body: form,
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : `Sync failed (${response.status}).`);
    const receipt = result as SyncReceipt;
    await markSynced(db, capture.id, receipt);
    for (const photo of capture.photos) {
      deleteFileIfPresent(photo.local_uri);
      await clearSyncedPhotoFile(db, photo.id);
    }
    return receipt;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed. Your capture is still safely queued.";
    await updateCapture(db, capture.id, { state: "failed", error_message: message });
    throw error;
  }
}
