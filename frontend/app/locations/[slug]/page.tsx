import Link from "next/link";

import { EmptyState } from "@/components/shell";
import { LocationEditLink } from "@/components/location-edit-link";
import { PrivateLocationContact } from "@/components/private-location-contact";
import { assetUrl, getLocation } from "@/lib/api";


export default async function LocationDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  try {
    const location = await getLocation(slug);
    return (
      <section className="section">
        <div className="panel-grid">
          <div className="panel">
            <span className="eyebrow">{location.visibility} listing</span>
            <h2>{location.name}</h2>
            <p>{location.description}</p>
            <div className="pill-row">
              <span className="pill">
                {location.city}, {location.region}
              </span>
              {location.street_address ? <span className="pill">{location.street_address}</span> : null}
              {location.zip_code ? <span className="pill">{location.zip_code}</span> : null}
              <span className="pill">Pinned by {location.creator_name}</span>
              {location.tags.map((tag) => (
                <span key={tag.id} className="pill">
                  {tag.name}
                </span>
              ))}
            </div>
            <p className="subtle" style={{ marginTop: "1rem" }}>
              Coordinates shown: {location.latitude ?? "Hidden"}, {location.longitude ?? "Hidden"}
            </p>
            <div style={{ marginTop: "1rem" }}>
              <LocationEditLink slug={location.slug} creatorHandle={location.creator_handle} />
            </div>
          </div>
          {location.visibility === "private" ? (
            <PrivateLocationContact locationId={location.id} ownerName={location.creator_name} />
          ) : null}
        </div>
        <div className="cards-2 section">
          {location.images.map((image) => (
            <Link key={image.id} href={`/images/${image.id}`} className="card">
              <img className="cover" src={assetUrl(image.source_url)} alt={image.title} />
              <h3>{image.title}</h3>
              <p>{image.caption}</p>
              <div className="pill-row">
                {image.image_metadata?.camera_model ? <span className="pill">{image.image_metadata.camera_model}</span> : null}
                {image.image_metadata?.season ? <span className="pill">{image.image_metadata.season}</span> : null}
                {image.image_metadata?.sun_position ? <span className="pill">{image.image_metadata.sun_position}</span> : null}
                {image.image_metadata?.camera_direction ? <span className="pill">{image.image_metadata.camera_direction}</span> : null}
              </div>
            </Link>
          ))}
        </div>
      </section>
    );
  } catch {
    return <EmptyState title="Location not found" body="The requested listing is missing or unavailable." />;
  }
}
