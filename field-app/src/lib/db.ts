import type { SQLiteDatabase } from "expo-sqlite";
import * as Crypto from "expo-crypto";

import type { CaptureState, FieldCapture, FieldPhoto, SyncReceipt } from "./types";

type CaptureRow = Omit<FieldCapture, "tags" | "photos"> & { tags_json: string };
type PhotoRow = FieldPhoto;

export async function migrateDb(db: SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS captures (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      tags_json TEXT NOT NULL DEFAULT '[]',
      visibility TEXT NOT NULL DEFAULT 'public',
      latitude REAL,
      longitude REAL,
      accuracy_meters REAL,
      heading_degrees REAL,
      city TEXT NOT NULL DEFAULT '',
      region TEXT NOT NULL DEFAULT '',
      country TEXT NOT NULL DEFAULT '',
      zip_code TEXT NOT NULL DEFAULT '',
      state TEXT NOT NULL DEFAULT 'draft',
      error_message TEXT,
      receipt_id INTEGER,
      location_id INTEGER,
      slug TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY NOT NULL,
      capture_id TEXT NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      image_role TEXT NOT NULL DEFAULT 'location_photo',
      local_uri TEXT,
      thumbnail_uri TEXT NOT NULL,
      captured_at_device TEXT,
      heading_degrees REAL,
      heading_label TEXT,
      position INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS ix_photos_capture ON photos(capture_id, position);
  `);
}

function hydrate(row: CaptureRow, photos: PhotoRow[]): FieldCapture {
  return { ...row, tags: JSON.parse(row.tags_json || "[]"), photos };
}

export async function createDraft(db: SQLiteDatabase): Promise<FieldCapture> {
  const id = Crypto.randomUUID();
  const now = new Date().toISOString();
  await db.runAsync("INSERT INTO captures (id, created_at, updated_at) VALUES (?, ?, ?)", id, now, now);
  return (await getCapture(db, id))!;
}

export async function listCaptures(db: SQLiteDatabase, states?: CaptureState[]): Promise<FieldCapture[]> {
  const where = states?.length ? `WHERE state IN (${states.map(() => "?").join(",")})` : "";
  const rows = await db.getAllAsync<CaptureRow>(`SELECT * FROM captures ${where} ORDER BY updated_at DESC`, ...(states || []));
  const result: FieldCapture[] = [];
  for (const row of rows) {
    const photos = await db.getAllAsync<PhotoRow>("SELECT * FROM photos WHERE capture_id = ? ORDER BY position", row.id);
    result.push(hydrate(row, photos));
  }
  return result;
}

export async function getCapture(db: SQLiteDatabase, id: string): Promise<FieldCapture | null> {
  const row = await db.getFirstAsync<CaptureRow>("SELECT * FROM captures WHERE id = ?", id);
  if (!row) return null;
  const photos = await db.getAllAsync<PhotoRow>("SELECT * FROM photos WHERE capture_id = ? ORDER BY position", id);
  return hydrate(row, photos);
}

export async function updateCapture(
  db: SQLiteDatabase,
  id: string,
  patch: Partial<Pick<FieldCapture, "name" | "notes" | "tags" | "visibility" | "latitude" | "longitude" | "accuracy_meters" | "heading_degrees" | "city" | "region" | "country" | "zip_code" | "state" | "error_message">>,
) {
  const entries = Object.entries(patch).map(([key, value]) => [
    key === "tags" ? "tags_json" : key,
    key === "tags" ? JSON.stringify(value) : value ?? null,
  ]) as [string, string | number | null][];
  if (!entries.length) return;
  const now = new Date().toISOString();
  const assignments = [...entries.map(([key]) => `${key} = ?`), "updated_at = ?"].join(", ");
  await db.runAsync(`UPDATE captures SET ${assignments} WHERE id = ?`, ...entries.map(([, value]) => value ?? null), now, id);
}

export async function addPhoto(db: SQLiteDatabase, photo: FieldPhoto) {
  await db.runAsync(
    `INSERT INTO photos (id, capture_id, title, image_role, local_uri, thumbnail_uri, captured_at_device, heading_degrees, heading_label, position)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    photo.id, photo.capture_id, photo.title, photo.image_role, photo.local_uri, photo.thumbnail_uri,
    photo.captured_at_device, photo.heading_degrees, photo.heading_label, photo.position,
  );
  await db.runAsync("UPDATE captures SET updated_at = ? WHERE id = ?", new Date().toISOString(), photo.capture_id);
}

export async function updatePhoto(db: SQLiteDatabase, id: string, title: string, role: FieldPhoto["image_role"]) {
  if (role === "area_image") {
    const photo = await db.getFirstAsync<{ capture_id: string }>("SELECT capture_id FROM photos WHERE id = ?", id);
    if (photo) await db.runAsync("UPDATE photos SET image_role = 'location_photo' WHERE capture_id = ?", photo.capture_id);
  }
  await db.runAsync("UPDATE photos SET title = ?, image_role = ? WHERE id = ?", title, role, id);
}

export async function removePhoto(db: SQLiteDatabase, id: string) {
  await db.runAsync("DELETE FROM photos WHERE id = ?", id);
}

export async function markSynced(db: SQLiteDatabase, id: string, receipt: SyncReceipt) {
  await db.runAsync(
    `UPDATE captures SET state = 'synced', error_message = NULL, receipt_id = ?, location_id = ?, slug = ?, updated_at = ? WHERE id = ?`,
    receipt.receipt_id, receipt.location_id, receipt.slug, new Date().toISOString(), id,
  );
}

export async function clearSyncedPhotoFile(db: SQLiteDatabase, photoId: string) {
  await db.runAsync("UPDATE photos SET local_uri = NULL WHERE id = ?", photoId);
}
