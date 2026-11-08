import exifr from 'exifr';

export type PhotoGps = { lat: number; lng: number };

/**
 * Read GPS from image EXIF (browser). Returns null if missing, stripped, or not an image.
 * Does not log EXIF contents.
 */
export async function gpsFromEvidenceFiles(files: File[]): Promise<PhotoGps | null> {
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    try {
      const gps = await exifr.gps(file);
      const lat = gps?.latitude;
      const lng = gps?.longitude;
      if (typeof lat !== 'number' || typeof lng !== 'number') continue;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
      return { lat, lng };
    } catch {
      /* unreadable EXIF — try next file */
    }
  }
  return null;
}
