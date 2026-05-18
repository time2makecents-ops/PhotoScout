import { EmptyState } from "@/components/shell";
import { assetUrl, getImage } from "@/lib/api";

const metadataRows = [
  ["Camera model", "camera_model"],
  ["Lens model", "lens_model"],
  ["Focal length", "focal_length"],
  ["Aperture", "aperture"],
  ["Shutter speed", "shutter_speed"],
  ["ISO / film speed", "iso_speed"],
  ["White balance", "white_balance"],
  ["Exposure compensation", "exposure_compensation"],
  ["Weather", "weather"],
  ["Season", "season"],
  ["Sun position", "sun_position"],
  ["Shot direction", "camera_direction"],
  ["Point of view", "point_of_view"],
  ["Distance to subject", "distance_to_subject"],
  ["Notes", "notes"]
] as const;


export default async function ImageDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const image = await getImage(id);
    return (
      <section className="section">
        <div className="panel-grid">
          <div className="panel">
            <img className="cover" src={assetUrl(image.source_url)} alt={image.title} />
          </div>
          <div className="panel">
            <span className="eyebrow">Image detail</span>
            <h2>{image.title}</h2>
            <p>{image.caption}</p>
            <div className="pill-row">
              {image.licensing_available ? <span className="pill">Licensing available</span> : null}
              {image.image_metadata?.weather ? <span className="pill">{image.image_metadata.weather}</span> : null}
              {image.image_metadata?.season ? <span className="pill">{image.image_metadata.season}</span> : null}
            </div>
            <div className="section">
              <h3>Metadata</h3>
              <p className="subtle">
                Time taken:{" "}
                {image.image_metadata?.taken_at ? new Date(image.image_metadata.taken_at).toLocaleString() : "Not set"}
              </p>
              {metadataRows.map(([label, key]) => (
                <p key={key} className="subtle">
                  {label}: {image.image_metadata?.[key] || "Not set"}
                </p>
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  } catch {
    return <EmptyState title="Image not found" body="The requested image could not be loaded." />;
  }
}
