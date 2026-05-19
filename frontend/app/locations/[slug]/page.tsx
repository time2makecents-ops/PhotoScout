import { EmptyState } from "@/components/shell";
import { LocationDetailClient } from "@/components/location-detail-client";
import { getLocation } from "@/lib/api";

export default async function LocationDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  try {
    const location = await getLocation(slug);
    return <LocationDetailClient initialLocation={location} />;
  } catch {
    return <EmptyState title="Location not found" body="The requested listing is missing or unavailable." />;
  }
}
