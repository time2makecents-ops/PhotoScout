"use client";

import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";

import { createFieldPairingRequest, getFieldDevices, revokeFieldDevice } from "@/lib/api";
import type { FieldDevice, FieldPairingRequest } from "@/lib/types";

function formatDeviceTime(value?: string | null) {
  if (!value) {
    return "Not connected yet";
  }
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function FieldAppPanel({ token }: { token: string }) {
  const [devices, setDevices] = useState<FieldDevice[]>([]);
  const [pairing, setPairing] = useState<FieldPairingRequest | null>(null);
  const [qrUrl, setQrUrl] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  const secondsRemaining = useMemo(() => {
    if (!pairing) return 0;
    return Math.max(0, Math.ceil((new Date(pairing.expires_at).getTime() - now) / 1000));
  }, [now, pairing]);

  async function refreshDevices() {
    try {
      setDevices(await getFieldDevices(token));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to load paired devices.");
    }
  }

  useEffect(() => {
    void refreshDevices();
  }, [token]);

  useEffect(() => {
    if (!pairing) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [pairing]);

  async function beginPairing() {
    setBusy(true);
    setStatus("");
    try {
      const nextPairing = await createFieldPairingRequest(token);
      const nextQrUrl = await QRCode.toDataURL(nextPairing.pairing_payload, {
        width: 360,
        margin: 1,
        color: { dark: "#213f3a", light: "#fffaf2" }
      });
      setPairing(nextPairing);
      setQrUrl(nextQrUrl);
      setNow(Date.now());
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to create a pairing code.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(device: FieldDevice) {
    if (!window.confirm(`Disconnect ${device.name}? Its queued captures will stay on the phone, but it cannot sync until paired again.`)) {
      return;
    }
    setBusy(true);
    try {
      await revokeFieldDevice(device.id, token);
      setStatus(`${device.name} disconnected.`);
      await refreshDevices();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to disconnect the device.");
    } finally {
      setBusy(false);
    }
  }

  const activeDevices = devices.filter((device) => !device.revoked_at);
  const isLoopback = pairing?.api_base_url.includes("127.0.0.1") || pairing?.api_base_url.includes("localhost");

  return (
    <section className="field-pairing-section" aria-labelledby="field-app-title">
      <div className="field-pairing-heading">
        <div>
          <span className="eyebrow">Offline capture</span>
          <h3 id="field-app-title">PhotoScout Field</h3>
          <p>Pair a phone, record locations without the server, then review and sync when you reconnect.</p>
        </div>
        <button type="button" onClick={() => void beginPairing()} disabled={busy}>
          {busy ? "Working…" : pairing && secondsRemaining > 0 ? "New code" : "Pair a phone"}
        </button>
      </div>

      {pairing && qrUrl && secondsRemaining > 0 ? (
        <div className="field-pairing-code">
          <img src={qrUrl} alt="PhotoScout Field one-time pairing QR code" />
          <div>
            <strong>Scan in PhotoScout Field</strong>
            <p>This one-time code expires in {Math.floor(secondsRemaining / 60)}:{String(secondsRemaining % 60).padStart(2, "0")}.</p>
            <code>{pairing.api_base_url}</code>
            {isLoopback ? <p className="field-pairing-warning">Restart PhotoScout with <code>-EnableFieldSync</code> so your phone receives a reachable address.</p> : null}
          </div>
        </div>
      ) : pairing ? (
        <p className="status">That pairing code expired. Generate a new one when the phone is ready.</p>
      ) : null}

      <div className="field-device-list">
        <div className="field-device-list-label">
          <strong>Connected devices</strong>
          <span>{activeDevices.length}</span>
        </div>
        {activeDevices.length ? activeDevices.map((device) => (
          <div className="field-device-row" key={device.id}>
            <div>
              <strong>{device.name}</strong>
              <span>{device.platform} · Last seen {formatDeviceTime(device.last_seen_at || device.created_at)}</span>
            </div>
            <button type="button" className="text-button danger" onClick={() => void revoke(device)} disabled={busy}>Disconnect</button>
          </div>
        )) : <p className="subtle">No phones paired yet.</p>}
      </div>
      {status ? <p className="status">{status}</p> : null}
    </section>
  );
}
