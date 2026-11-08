import type { DamageStatus } from './mapboxDamage';

export type LngLat = { lng: number; lat: number };

/** Fallback map centre (downtown Fort Myers, FL 33916). Replace with real coordinates. */
export const DEFAULT_CENTER: LngLat = { lng: -81.8695, lat: 26.642 };

/** Returns the point `east` / `north` metres away from `origin`. */
export function offsetMeters(origin: LngLat, east: number, north: number): LngLat {
  const dLat = north / 111_320;
  const dLng = east / (111_320 * Math.cos((origin.lat * Math.PI) / 180));
  return { lng: origin.lng + dLng, lat: origin.lat + dLat };
}

/** Shorthand: a point `east` / `north` metres from DEFAULT_CENTER (used for demo data). */
export const at = (east: number, north: number): LngLat => offsetMeters(DEFAULT_CENTER, east, north);

/**
 * DEMO ONLY: a deterministic pseudo-assessment so the whole neighbourhood is shaded.
 * Damage is worse nearer `center` and varies by ~18 m cell. Replace `statusFor` with a
 * lookup into your real assessment data (e.g. by parcel id or nearest report).
 */
export function demoStatusFor(center: LngLat, radiusMeters: number) {
  return (b: { lng: number; lat: number }): DamageStatus => {
    const dx = (b.lng - center.lng) * 111_320 * Math.cos((center.lat * Math.PI) / 180);
    const dy = (b.lat - center.lat) * 111_320;
    const r = Math.min(1, Math.hypot(dx, dy) / radiusMeters);
    const noise = (n: number) => n - Math.floor(n);
    const v = noise(Math.sin(Math.round(dx / 18) * 127.1 + Math.round(dy / 18) * 311.7) * 43758.5453);
    const score = (1 - r) * 0.55 + v * 0.6;
    return score > 0.85 ? "severe" : score > 0.68 ? "moderate" : score > 0.5 ? "minor" : "none";
  };
}

/** Forward-geocode a US street address with the Mapbox Geocoding API (v6). */
export async function geocodeAddress(address: string, signal?: AbortSignal): Promise<LngLat | null> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token || !address.trim()) return null;
  try {
    const url =
      "https://api.mapbox.com/search/geocode/v6/forward" +
      `?q=${encodeURIComponent(address)}&country=us&limit=1&access_token=${token}`;
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    const data = await res.json();
    const coords = data?.features?.[0]?.geometry?.coordinates as [number, number] | undefined;
    return coords ? { lng: coords[0], lat: coords[1] } : null;
  } catch {
    return null;
  }
}
