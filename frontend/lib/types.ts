export type ImageMetadata = {
  gps_latitude?: number | null;
  gps_longitude?: number | null;
  captured_at_device?: string | null;
  camera_heading_degrees?: number | null;
  camera_heading_label?: string | null;
  camera_pitch_degrees?: number | null;
  camera_roll_degrees?: number | null;
  heading_source?: string | null;
  camera_model?: string | null;
  lens_model?: string | null;
  focal_length?: string | null;
  aperture?: string | null;
  shutter_speed?: string | null;
  iso_speed?: string | null;
  white_balance?: string | null;
  exposure_compensation?: string | null;
  taken_at?: string | null;
  weather?: string | null;
  season?: string | null;
  sun_position?: string | null;
  camera_direction?: string | null;
  point_of_view?: string | null;
  distance_to_subject?: string | null;
  notes?: string | null;
};

export type ImageAsset = {
  id: number;
  location_id?: number | null;
  image_role: string;
  title: string;
  caption: string;
  source_url: string;
  mime_type: string;
  licensing_available: boolean;
  featured: boolean;
  created_at: string;
  image_metadata?: ImageMetadata | null;
};

export type Tag = {
  id: number;
  name: string;
  slug: string;
  kind: string;
};

export type Profile = {
  id: number;
  handle: string;
  display_name: string;
  bio: string;
  base_city: string;
  specialties: string;
  website_url?: string | null;
  instagram_url?: string | null;
  licensing_available: boolean;
  scout_for_hire: boolean;
  hourly_rate_note?: string | null;
  scout_services: {
    id: number;
    title: string;
    description: string;
    regions_served: string;
    specialties: string;
    day_rate_note?: string | null;
    is_active: boolean;
  }[];
  uploaded_images: ImageAsset[];
  created_locations: ProfileLocation[];
};

export type Location = {
  id: number;
  name: string;
  slug: string;
  description: string;
  street_address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  visibility: string;
  city: string;
  region: string;
  country: string;
  zip_code: string;
  is_featured: boolean;
  created_at: string;
  tags: Tag[];
  images: ImageAsset[];
  creator_handle: string;
  creator_name: string;
};

export type ProfileLocation = Location;

export type ChallengeSubmission = {
  id: number;
  caption: string;
  vote_count: number;
  rank?: number | null;
  is_winner: boolean;
  is_featured: boolean;
  created_at: string;
  user_handle: string;
  user_display_name: string;
  image: ImageAsset;
};

export type Challenge = {
  id: number;
  title: string;
  slug: string;
  prompt: string;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  featured_image_url?: string | null;
};

export type ChallengeDetail = Challenge & {
  submissions: ChallengeSubmission[];
};

export type SearchItem = {
  id: number;
  type: string;
  title: string;
  subtitle: string;
  href: string;
};

export type SearchResponse = {
  query: string;
  results: SearchItem[];
};
