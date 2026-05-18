"use client";

import { FormEvent, use, useEffect, useMemo, useState } from "react";

import { PhotoMetadataFields } from "@/components/photo-metadata-fields";
import { assetUrl, getChallenge } from "@/lib/api";
import { getStoredToken } from "@/lib/auth";
import { normalizeErrorDetail } from "@/lib/errors";
import type { ChallengeDetail } from "@/lib/types";

async function readResponseBody(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { detail: text || `Request failed with status ${response.status}` };
  }
}

export default function ChallengeDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [challenge, setChallenge] = useState<ChallengeDetail | null>(null);
  const [status, setStatus] = useState<string>("");
  const [working, setWorking] = useState(false);
  const apiBase = useMemo(() => "", []);

  useEffect(() => {
    async function load() {
      setChallenge(await getChallenge(slug));
    }
    load();
  }, [slug]);

  async function submitEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = getStoredToken();
    if (!token || !challenge) {
      setStatus("Sign in to submit.");
      return;
    }

    setWorking(true);
    setStatus("Uploading image for challenge submission...");
    const form = new FormData(event.currentTarget);
    const uploadResponse = await fetch(`${apiBase}/api/uploads/images`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: form
    });
    const uploadData = await readResponseBody(uploadResponse);
    if (!uploadResponse.ok) {
      setWorking(false);
      setStatus(normalizeErrorDetail(uploadData.detail, "Upload failed"));
      return;
    }

    setStatus("Submitting to challenge...");
    const submissionResponse = await fetch(`${apiBase}/api/challenges/${challenge.id}/submissions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        image_id: uploadData.id,
        caption: form.get("caption")
      })
    });
    const submissionData = await readResponseBody(submissionResponse);
    setWorking(false);
    if (!submissionResponse.ok) {
      setStatus(normalizeErrorDetail(submissionData.detail, "Submission failed"));
      return;
    }

    setChallenge(submissionData);
    setStatus(`Challenge submission added with image ID ${uploadData.id}.`);
  }

  async function vote(submissionId: number, direction: "up" | "down") {
    const token = getStoredToken();
    if (!token) {
      setStatus("Sign in to vote.");
      return;
    }
    const response = await fetch(`${apiBase}/api/challenges/submissions/${submissionId}/vote`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ direction })
    });
    const data = await readResponseBody(response);
    if (!response.ok) {
      setStatus(normalizeErrorDetail(data.detail, "Vote failed"));
      return;
    }
    setChallenge(data);
    setStatus(direction === "up" ? "Thumbs up saved." : "Thumbs down saved.");
  }

  if (!challenge) {
    return (
      <section className="section">
        <div className="panel">
          <h2>Loading challenge...</h2>
        </div>
      </section>
    );
  }

  return (
    <section className="section">
      <div className="panel-grid">
        <div className="panel">
          <span className="eyebrow">Challenge</span>
          <h2>{challenge.title}</h2>
          <p>{challenge.prompt}</p>
          <p className="subtle">
            Ends {new Date(challenge.ends_at).toLocaleDateString()} · Slug {slug}
          </p>
        </div>
        <form className="panel form" onSubmit={submitEntry}>
          <h3>Upload and submit an image</h3>
          <div className="field">
            <label htmlFor="file">Image file</label>
            <input id="file" name="file" type="file" accept="image/*" required />
          </div>
          <div className="field">
            <label htmlFor="title">Image title</label>
            <input id="title" name="title" required />
          </div>
          <div className="field">
            <label htmlFor="caption">Submission caption</label>
            <textarea id="caption" name="caption" />
          </div>
          <PhotoMetadataFields title="Submission photo metadata" />
          <button type="submit" disabled={working}>
            {working ? "Uploading..." : "Upload photo and submit"}
          </button>
        </form>
      </div>

      {status ? <p className="status">{status}</p> : null}

      <div className="cards-2 section">
        {challenge.submissions.map((submission) => (
          <div key={submission.id} className="card">
            <img
              className="cover"
              src={assetUrl(submission.image.source_url)}
              alt={submission.image.title}
            />
            <h3>{submission.image.title}</h3>
            <p>{submission.caption}</p>
            <div className="pill-row">
              <span className="pill">{submission.vote_count} votes</span>
              <span className="pill">@{submission.user_handle}</span>
            </div>
            <div className="pill-row" style={{ marginTop: "0.8rem" }}>
              <button type="button" onClick={() => vote(submission.id, "up")}>
                Thumbs up
              </button>
              <button type="button" className="secondary" onClick={() => vote(submission.id, "down")}>
                Thumbs down
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
