export type CaptureState = "draft" | "ready" | "syncing" | "failed" | "synced";

export type FieldCapture = {
  id: string;
  name: string;
  notes: string;
  tags: string[];
  visibility: "public" | "private";
  latitude: number | null;
  longitude: number | null;
  accuracy_meters: number | null;
  heading_degrees: number | null;
  city: string;
  region: string;
  country: string;
  zip_code: string;
  state: CaptureState;
  error_message: string | null;
  receipt_id: number | null;
  location_id: number | null;
  slug: string | null;
  created_at: string;
  updated_at: string;
  photos: FieldPhoto[];
};

export type FieldPhoto = {
  id: string;
  capture_id: string;
  title: string;
  image_role: "area_image" | "location_photo";
  local_uri: string | null;
  thumbnail_uri: string;
  captured_at_device: string | null;
  heading_degrees: number | null;
  heading_label: string | null;
  position: number;
};

export type PairingCredential = {
  api_base_url: string;
  device_token: string;
  device_id: number;
};

export type SyncReceipt = {
  status: "synced";
  receipt_id: number;
  location_id: number;
  slug: string;
  image_count: number;
};
