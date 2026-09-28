export interface StreetLocation {
  id: string;
  name: string;
  blurb: string;
  lat: number;
  lng: number;
  heading: number;
  pitch: number;
}

/** Curated Street View spots with coverage — generic storefront / street energy. */
export const STREET_PRESETS: StreetLocation[] = [
  {
    id: "great-neck-middle-neck",
    name: "Great Neck · 566 Middle Neck Rd",
    blurb: "Your store block — point at the facade and blast.",
    lat: 40.8017192,
    lng: -73.7358714,
    heading: 90,
    pitch: 2,
  },
  {
    id: "nyc-broadway",
    name: "NYC · Broadway",
    blurb: "Point at shop fronts and blast cartoon props.",
    lat: 40.758896,
    lng: -73.98513,
    heading: 120,
    pitch: 5,
  },
  {
    id: "sf-castro",
    name: "SF · Castro St",
    blurb: "Colorful street — pick a facade and go.",
    lat: 37.7609,
    lng: -122.435,
    heading: 200,
    pitch: 2,
  },
  {
    id: "tokyo-shibuya",
    name: "Tokyo · Shibuya",
    blurb: "Dense city blocks for chaotic waves.",
    lat: 35.6595,
    lng: 139.7004,
    heading: 30,
    pitch: 0,
  },
  {
    id: "london-oxford",
    name: "London · Oxford St",
    blurb: "Retail row — aim at the windows (fiction only).",
    lat: 51.5152,
    lng: -0.1426,
    heading: 90,
    pitch: 3,
  },
  {
    id: "paris-rivoli",
    name: "Paris · Rue de Rivoli",
    blurb: "Arcade vibes — look, then blast.",
    lat: 48.8606,
    lng: 2.3376,
    heading: 250,
    pitch: 4,
  },
];

export function parseLatLng(input: string): { lat: number; lng: number } | null {
  const cleaned = input.trim().replace(/\s+/g, " ");
  // "40.7, -74.0" or "40.7,-74.0"
  const m = cleaned.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
  if (!m) return null;
  const lat = Number.parseFloat(m[1]);
  const lng = Number.parseFloat(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

/** Pull lat/lng from common Google Maps / Street View URLs when possible. */
export function parseMapsUrl(input: string): { lat: number; lng: number } | null {
  const text = input.trim();
  // Prefer place pin coords (!3dLAT!4dLNG) over map-camera @lat,lng
  const d3 = text.match(/!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/);
  if (d3) {
    const lat = Number.parseFloat(d3[1]);
    const lng = Number.parseFloat(d3[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  const at = text.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (at) {
    const lat = Number.parseFloat(at[1]);
    const lng = Number.parseFloat(at[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  return parseLatLng(text);
}
