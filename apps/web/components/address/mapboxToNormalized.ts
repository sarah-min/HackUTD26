import { normalizeAddress, normalizeZip } from '@hack/address';
import type { NormalizedAddress } from '@hack/contracts/property';

/** US state / territory names → USPS codes (Mapbox often returns the full name). */
const STATE_NAME_TO_CODE: Record<string, string> = {
  ALABAMA: 'AL',
  ALASKA: 'AK',
  ARIZONA: 'AZ',
  ARKANSAS: 'AR',
  CALIFORNIA: 'CA',
  COLORADO: 'CO',
  CONNECTICUT: 'CT',
  DELAWARE: 'DE',
  'DISTRICT OF COLUMBIA': 'DC',
  FLORIDA: 'FL',
  GEORGIA: 'GA',
  HAWAII: 'HI',
  IDAHO: 'ID',
  ILLINOIS: 'IL',
  INDIANA: 'IN',
  IOWA: 'IA',
  KANSAS: 'KS',
  KENTUCKY: 'KY',
  LOUISIANA: 'LA',
  MAINE: 'ME',
  MARYLAND: 'MD',
  MASSACHUSETTS: 'MA',
  MICHIGAN: 'MI',
  MINNESOTA: 'MN',
  MISSISSIPPI: 'MS',
  MISSOURI: 'MO',
  MONTANA: 'MT',
  NEBRASKA: 'NE',
  NEVADA: 'NV',
  'NEW HAMPSHIRE': 'NH',
  'NEW JERSEY': 'NJ',
  'NEW MEXICO': 'NM',
  'NEW YORK': 'NY',
  'NORTH CAROLINA': 'NC',
  'NORTH DAKOTA': 'ND',
  OHIO: 'OH',
  OKLAHOMA: 'OK',
  OREGON: 'OR',
  PENNSYLVANIA: 'PA',
  'RHODE ISLAND': 'RI',
  'SOUTH CAROLINA': 'SC',
  'SOUTH DAKOTA': 'SD',
  TENNESSEE: 'TN',
  TEXAS: 'TX',
  UTAH: 'UT',
  VERMONT: 'VT',
  VIRGINIA: 'VA',
  WASHINGTON: 'WA',
  'WEST VIRGINIA': 'WV',
  WISCONSIN: 'WI',
  WYOMING: 'WY',
};

function toStateCode(raw: string): string {
  const cleaned = raw.trim().toUpperCase().replace(/\./g, '');
  if (/^[A-Z]{2}$/.test(cleaned)) return cleaned;
  return STATE_NAME_TO_CODE[cleaned] ?? '';
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Build a contract NormalizedAddress from a Mapbox Address Autofill retrieve feature.
 * Uses source "manual" (allowed enum) — Mapbox is the picker; STDB census often
 * fails on Mapbox full_address strings.
 */
export function mapboxFeatureToNormalized(feature: {
  geometry?: { coordinates?: [number, number] };
  properties?: Record<string, unknown>;
}): NormalizedAddress | null {
  const p = feature.properties ?? {};
  const line1 = str(p.address_line1) || str(p.feature_name);
  const city = str(p.address_level2) || str(p.place);
  const state = toStateCode(str(p.address_level1) || str(p.region));
  const zip = normalizeZip(str(p.postcode));
  const coords = feature.geometry?.coordinates;
  const lng = coords?.[0];
  const lat = coords?.[1];

  if (!line1 || !city || state.length !== 2 || zip.length !== 5) return null;

  const parts = { line1, city, state, zip };
  return {
    ...parts,
    lat: typeof lat === 'number' ? lat : null,
    lng: typeof lng === 'number' ? lng : null,
    normalized: normalizeAddress(parts),
    source: 'manual',
  };
}

export function mapboxFeatureLabel(feature: {
  properties?: Record<string, unknown>;
}): string {
  const p = feature.properties ?? {};
  return (
    str(p.full_address) ||
    str(p.place_name) ||
    [str(p.address_line1), str(p.address_level2), str(p.address_level1), str(p.postcode)]
      .filter(Boolean)
      .join(', ')
  );
}
