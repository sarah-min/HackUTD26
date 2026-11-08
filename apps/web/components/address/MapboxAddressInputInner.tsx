'use client';

import type { NormalizedAddress } from '@hack/contracts/property';
import { AddressAutofill, type AddressAutofillRetrieveResponse } from '@mapbox/search-js-react';
import { mapboxFeatureLabel, mapboxFeatureToNormalized } from './mapboxToNormalized';

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';

export type MapboxAddressResolved = {
  label: string;
  address: NormalizedAddress | null;
  coords?: { lat: number; lng: number };
};

export type MapboxAddressInputProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** Fired after the user picks a Mapbox suggestion. Prefer `address` over re-geocoding. */
  onResolved?: (result: MapboxAddressResolved) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
};

export function MapboxAddressInputInner({
  id,
  value,
  onChange,
  onResolved,
  disabled,
  placeholder = 'Start typing a street address',
  className = 'w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[13px] outline-none focus:border-blue-500 disabled:opacity-60',
}: MapboxAddressInputProps) {
  const input = (
    <input
      autoComplete="street-address"
      className={className}
      disabled={disabled}
      id={id}
      name="address-line1"
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      type="text"
      value={value}
    />
  );

  if (!TOKEN) {
    return (
      <div className="space-y-1">
        {input}
        <p className="text-[10px] text-amber-800">
          Set <code className="font-semibold">NEXT_PUBLIC_MAPBOX_TOKEN</code> in{' '}
          <code className="font-semibold">.env.local</code> to enable address suggestions.
        </p>
      </div>
    );
  }

  return (
    <AddressAutofill
      accessToken={TOKEN}
      options={{ country: 'US', language: 'en' }}
      onRetrieve={(res: AddressAutofillRetrieveResponse) => {
        const feature = res.features[0];
        if (!feature) return;
        const label = mapboxFeatureLabel(feature);
        const address = mapboxFeatureToNormalized(feature);
        const coords = feature.geometry?.coordinates;
        if (label) onChange(label);
        onResolved?.({
          label: label || (address ? `${address.line1}, ${address.city}, ${address.state} ${address.zip}` : ''),
          address,
          coords:
            coords && coords.length >= 2
              ? { lng: coords[0]!, lat: coords[1]! }
              : undefined,
        });
      }}
    >
      {input}
    </AddressAutofill>
  );
}
