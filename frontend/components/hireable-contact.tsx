"use client";

import { FormEvent, useState } from "react";

import { getStoredToken } from "@/lib/auth";
import { normalizeErrorDetail } from "@/lib/errors";


export function HireableContact({
  profileId,
  displayName
}: {
  profileId: number;
  displayName: string;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = getStoredToken();
    if (!token) {
      setStatus("Sign in to send a hire inquiry.");
      return;
    }

    setSubmitting(true);
    setStatus("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/inquiries/hire", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        target_id: profileId,
        message: form.get("message")
      })
    });
    const data = await response.json().catch(() => ({}));
    setSubmitting(false);
    if (!response.ok) {
      setStatus(normalizeErrorDetail(data.detail, "Unable to send hire inquiry."));
      return;
    }

    event.currentTarget.reset();
    setStatus(`Hire inquiry sent to ${displayName}.`);
  }

  return (
    <div style={{ marginTop: "0.9rem" }}>
      <button type="button" className="secondary" onClick={() => setOpen((value) => !value)}>
        {open ? "Close contact" : "Contact for hire"}
      </button>
      {open ? (
        <form className="form" style={{ marginTop: "0.8rem" }} onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor={`hire-${profileId}`}>Project inquiry</label>
            <textarea
              id={`hire-${profileId}`}
              name="message"
              defaultValue="Hi, I’d like to discuss availability, scope, and pricing for an upcoming shoot."
              required
            />
          </div>
          <button type="submit">{submitting ? "Sending..." : "Send inquiry"}</button>
        </form>
      ) : null}
      {status ? <p className="status">{status}</p> : null}
    </div>
  );
}

