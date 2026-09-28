export type BlastStyle = "cinematic" | "cartoon" | "fireworks" | "catastrophic";

export interface MediaResponse {
  provider: string;
  model: string;
  prompt: string;
  image_url: string | null;
  remote_url: string | null;
  local_path: string | null;
  task_id: string | null;
  created_at: string;
}

export interface PlacePhotoRequest {
  place_name: string;
  lat: number;
  lng: number;
  heading?: number;
  pitch?: number;
  fov?: number;
  aspect_ratio?: string;
}

export interface BlastDamageRequest {
  place_name: string;
  lat?: number;
  lng?: number;
  heading?: number;
  input_image?: string;
  style?: BlastStyle;
  aspect_ratio?: string;
}

const API_BASE = import.meta.env.VITE_KIE_API_BASE?.trim() || "/kie-api";

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const err = (await res.json()) as { detail?: string };
      if (err.detail) detail = typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail);
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

export async function checkKieApi(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}

/** Photoreal plate of the aimed Street View (Static API or Kie stand-in). */
export async function requestPlacePhoto(body: PlacePhotoRequest): Promise<MediaResponse> {
  return postJson("/api/media/place-photo", {
    place_name: body.place_name,
    lat: body.lat,
    lng: body.lng,
    heading: body.heading ?? 95,
    pitch: body.pitch ?? 2,
    fov: body.fov ?? 80,
    aspect_ratio: body.aspect_ratio ?? "16:9",
  });
}

/** Upload a client-captured Street View frame (exact view on screen). */
export async function uploadCapturedPlate(
  imageData: string,
  placeName: string,
): Promise<MediaResponse> {
  return postJson("/api/media/upload-plate", {
    image_data: imageData,
    place_name: placeName,
  });
}

/** Catastrophic fictional damage — pass remote_url from place-photo for same-image edit. */
export async function requestBlastDamage(body: BlastDamageRequest): Promise<MediaResponse> {
  return postJson("/api/media/blast-damage", {
    place_name: body.place_name,
    lat: body.lat,
    lng: body.lng,
    heading: body.heading,
    input_image: body.input_image,
    style: body.style ?? "catastrophic",
    aspect_ratio: body.aspect_ratio ?? "16:9",
  });
}

export function mediaFileUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) return imageUrl;
  if (imageUrl.startsWith("/api/")) return `${API_BASE}${imageUrl}`;
  return imageUrl;
}
