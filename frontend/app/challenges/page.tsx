import Link from "next/link";

import { getChallenges } from "@/lib/api";


export default async function ChallengesPage() {
  const challenges = await getChallenges();

  return (
    <section className="section">
      <div className="panel">
        <span className="eyebrow">Weekly photo challenges</span>
        <h2>Current and recent prompts</h2>
        <p>Admins can create weekly prompts. Users submit an image and other users vote on the entries.</p>
      </div>
      <div className="cards-2 section">
        {challenges.map((challenge) => (
          <Link key={challenge.id} href={`/challenges/${challenge.slug}`} className="card">
            <h3>{challenge.title}</h3>
            <p>{challenge.prompt}</p>
            <div className="pill-row">
              <span className="pill">{challenge.is_active ? "Active" : "Closed"}</span>
              <span className="pill">{new Date(challenge.ends_at).toLocaleDateString()}</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

