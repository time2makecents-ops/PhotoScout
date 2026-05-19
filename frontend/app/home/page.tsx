import Link from "next/link";

import { FeaturedLocationCard } from "@/components/featured-location-card";
import { HomeLocationMap } from "@/components/home-location-map";
import { HireableContact } from "@/components/hireable-contact";
import { HomeRefreshListener } from "@/components/home-refresh-listener";
import { SectionHeading } from "@/components/shell";
import { assetUrl, getChallenge, getChallenges, getLocations, getProfiles } from "@/lib/api";

export default async function HomePage() {
  const [locations, challenges, profiles] = await Promise.all([getLocations(), getChallenges(), getProfiles()]);
  const featuredLocations = locations.slice(0, 3);
  const featuredChallenges = challenges.slice(0, 2);
  const challengeDetails = await Promise.all(featuredChallenges.map((challenge) => getChallenge(challenge.slug)));
  const scouts = profiles.filter((profile) => profile.scout_for_hire).slice(0, 3);

  return (
    <>
      <HomeRefreshListener />
      <section className="hero">
        <div className="hero-card hero-copy">
          <span className="hero-kicker">Mobile-first MVP foundation</span>
          <h1>Scout locations. Find talent. License images.</h1>
          <p>
            PhotoScout helps photographers, studios, scouts, and property owners share photo-ready locations, rich
            shoot metadata, and weekly challenge work from one marketplace-ready base.
          </p>
          <div className="hero-actions">
            <Link href="/locations/new" className="button">
              Add a pin
            </Link>
            <Link href="/search" className="button secondary">
              Search the network
            </Link>
          </div>
          <div className="stats">
            <div className="stat">
              <strong>{locations.length}</strong>
              <span>Live locations</span>
            </div>
            <div className="stat">
              <strong>{profiles.length}</strong>
              <span>Profiles</span>
            </div>
            <div className="stat">
              <strong>{challenges.length}</strong>
              <span>Weekly challenges</span>
            </div>
          </div>
        </div>
        <div className="highlight">
          <span className="eyebrow">Current focus</span>
          <h3>Private locations stay discoverable without exposing exact access details.</h3>
          <p className="subtle">
            The API masks exact coordinates for non-authorized viewers while still letting studios discover the listing
            and send inquiry placeholders.
          </p>
          {featuredChallenges[0] ? (
            <>
              <span className="eyebrow" style={{ marginTop: "1rem", display: "block" }}>
                Weekly challenge
              </span>
              <h3>{featuredChallenges[0].title}</h3>
              <p className="subtle">{featuredChallenges[0].prompt}</p>
            </>
          ) : null}
        </div>
      </section>

      <section className="section">
        <HomeLocationMap locations={locations} />
      </section>

      <section className="section">
        <SectionHeading
          eyebrow="Discovery"
          title="Featured locations"
          body="The first MVP slice includes public and private listing behavior, metadata-rich images, and profile attribution."
        />
        <div className="cards-3">
          {featuredLocations.map((location) => (
            <FeaturedLocationCard key={location.id} location={location} />
          ))}
        </div>
      </section>

      <section className="section">
        <SectionHeading
          eyebrow="Weekly challenge"
          title="Challenge entries"
          body="Active challenges now surface example submissions and photos directly on the front page."
        />
        <div className="cards-2">
          {challengeDetails.map((challenge) => (
            <div key={challenge.id} className="card">
              <h3>{challenge.title}</h3>
              <p>{challenge.prompt}</p>
              <div className="cards-2" style={{ marginTop: "0.8rem" }}>
                {challenge.submissions.slice(0, 2).map((submission) => (
                  <Link key={submission.id} href={`/challenges/${challenge.slug}`} className="card">
                    <img className="cover" src={assetUrl(submission.image.source_url)} alt={submission.image.title} />
                    <h3>{submission.image.title}</h3>
                    <p>{submission.caption}</p>
                    <div className="pill-row">
                      <span className="pill">{submission.vote_count} votes</span>
                      <span className="pill">@{submission.user_handle}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <SectionHeading eyebrow="Scouts" title="Hireable experts" body="Scout-enabled profiles expose services and a direct inquiry button." />
        <div className="cards-3">
          {scouts.map((profile) => (
            <div key={profile.id} className="card">
              <Link href={`/profile?handle=${profile.handle}`}>
                <h3>{profile.display_name}</h3>
                <p>{profile.bio}</p>
                <div className="pill-row">
                  <span className="pill">{profile.base_city}</span>
                  <span className="pill">{profile.hourly_rate_note || "Rate on request"}</span>
                </div>
              </Link>
              <HireableContact profileId={profile.id} displayName={profile.display_name} />
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
