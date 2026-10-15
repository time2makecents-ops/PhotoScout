import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import type { PairingCredential } from "./types";
import { isAllowedApiBaseUrl } from "./validation";

const CREDENTIAL_KEY = "photoscout.field.credential.v1";

export async function getCredential(): Promise<PairingCredential | null> {
  const value = await SecureStore.getItemAsync(CREDENTIAL_KEY);
  return value ? JSON.parse(value) : null;
}

export async function clearCredential() {
  await SecureStore.deleteItemAsync(CREDENTIAL_KEY);
}

export async function pairWithPayload(rawPayload: string, deviceName: string): Promise<PairingCredential> {
  let payload: { version?: number; api_base_url?: string; pairing_secret?: string };
  try {
    payload = JSON.parse(rawPayload);
  } catch {
    throw new Error("This is not a PhotoScout pairing code.");
  }
  if (payload.version !== 1 || !payload.api_base_url || !payload.pairing_secret) {
    throw new Error("This pairing code is incomplete or unsupported.");
  }
  if (!isAllowedApiBaseUrl(payload.api_base_url)) {
    throw new Error("PhotoScout Field only accepts HTTPS servers or private LAN addresses.");
  }
  const response = await fetch(`${payload.api_base_url.replace(/\/$/, "")}/api/field-devices/pair`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pairing_secret: payload.pairing_secret,
      name: deviceName.trim() || `${Platform.OS === "ios" ? "iPhone" : "Android"} field phone`,
      platform: Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "unknown",
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.detail || "The server could not pair this phone.");
  const credential: PairingCredential = {
    api_base_url: result.api_base_url,
    device_token: result.device_token,
    device_id: result.device_id,
  };
  await SecureStore.setItemAsync(CREDENTIAL_KEY, JSON.stringify(credential));
  return credential;
}
