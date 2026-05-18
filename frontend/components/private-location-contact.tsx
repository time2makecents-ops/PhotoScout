"use client";

import { FormEvent, useState } from "react";

import { getStoredToken } from "@/lib/auth";
import { normalizeErrorDetail } from "@/lib/errors";


export function PrivateLocationContact({
  locationId,
  ownerName
}: {
  locationId: number;
  ownerName: string;
}) {
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = getStoredToken();
    if (!token) {
      setStatus("Sign in to contact the location owner.");
      return;
    }

    setSubmitting(true);
    setStatus("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/inquiries/access", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        target_id: locationId,
        message: form.get("message")
      })
    });

    const data = await response.json().catch(() => ({}));
    setSubmitting(false);
    if (!response.ok) {
      setStatus(normalizeErrorDetail(data.detail, "Unable to send inquiry."));
      return;
    }

    event.currentTarget.reset();
    setStatus(`Inquiry sent to ${ownerName}.`);
  }

  return (
    <div className="panel">
      <span className="eyebrow">Private access</span>
      <h3>Contact owner</h3>
      <p className="subtle">
        Exact access details stay hidden until the owner reviews your request. Use this to ask about shoot approval,
        logistics, and future access fees.
      </p>
      <form className="form" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="private-location-message">Inquiry message</label>
          <textarea
            id="private-location-message"
            name="message"
            defaultValue="Hi, I’d like to request access for a photo or production shoot. I’d like to learn more about availability and approval requirements."
            required
          />
        </div>
        <button type="submit">{submitting ? "Sending..." : "Contact owner"}</button>
      </form>
      {status ? <p className="status">{status}</p> : null}
    </div>
  );
}
