import type { NormalizedAddress } from '@hack/contracts/property';

/**
 * Splits a printed one-line US address ("123 Main St Apt 2, Dallas, TX 75201-1234") into the parts
 * normalizeAddress() expects. Returns null when the state or ZIP can't be found. Pure, no network.
 */
export function parseAddressText(text: string): Omit<NormalizedAddress, 'normalized'> | null {
  const flat = text.replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').trim();
  const tail = /^(.*?)[,\s]+([A-Za-z]{2})\.?\s+(\d{5})(?:-\d{4})?\s*(?:,?\s*USA?)?$/i.exec(flat);
  if (!tail) return null;
  const [, before, state, zip] = tail;
  const parts = before!.split(',').map((p) => p.trim()).filter(Boolean);
  let line1: string;
  let city: string;
  if (parts.length >= 2) {
    city = parts[parts.length - 1]!;
    line1 = parts.slice(0, -1).join(' ');
  } else {
    // No comma between street and city: take the trailing word(s) after the street suffix as the city.
    const m = /^(.*\b(?:ST|STREET|AVE|AVENUE|RD|ROAD|DR|DRIVE|LN|LANE|BLVD|BOULEVARD|CT|COURT|CIR|CIRCLE|PL|PLACE|TER|TERRACE|PKWY|PARKWAY|HWY|HIGHWAY|TRL|TRAIL|WAY)\.?(?:\s+(?:APT|APARTMENT|UNIT|STE|SUITE|#)\s*\S+)?)\s+(.+)$/i.exec(
      parts[0] ?? '',
    );
    if (!m) return null;
    line1 = m[1]!;
    city = m[2]!;
  }
  if (!/^\d/.test(line1) || !city) return null;
  return {
    line1: line1.slice(0, 120),
    city: city.slice(0, 60),
    state: state!.toUpperCase(),
    zip: zip!,
    lat: null,
    lng: null,
    source: 'manual',
  };
}
