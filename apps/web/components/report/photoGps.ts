import exifr from 'exifr';

export type PhotoGps = { lat: number; lng: number };

const IMAGE_EXT = /\.(jpe?g|png|webp|heic|heif)$/i;

/** Browsers often leave `File.type` empty for camera-roll picks — use the name too. */
export function isLikelyImage(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  return IMAGE_EXT.test(file.name);
}

function normalizeGps(raw: { latitude?: number; longitude?: number } | null | undefined): PhotoGps | null {
  const lat = raw?.latitude;
  const lng = raw?.longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

/**
 * Read GPS from image EXIF (browser). Returns null if missing, stripped, or not an image.
 * Does not log EXIF contents.
 */
export async function gpsFromEvidenceFiles(files: File[]): Promise<PhotoGps | null> {
  for (const file of files) {
    if (!isLikelyImage(file)) continue;
    try {
      const fromGps = normalizeGps(await exifr.gps(file));
      if (fromGps) return fromGps;
      // Some phone exports need a fuller parse; still never log the payload.
      const parsed = await exifr.parse(file, { gps: true });
      const fallback = normalizeGps(
        parsed
          ? {
              latitude: parsed.latitude as number | undefined,
              longitude: parsed.longitude as number | undefined,
            }
          : null,
      );
      if (fallback) return fallback;
    } catch {
      /* unreadable EXIF — try next file */
    }
  }
  return null;
}
