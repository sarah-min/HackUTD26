'use client';

import { useEffect, useState, type ComponentType } from 'react';
import type { MapboxAddressInputProps } from './MapboxAddressInputInner';

export type { MapboxAddressInputProps, MapboxAddressResolved } from './MapboxAddressInputInner';

function PlainAddressInput({
  id,
  value,
  onChange,
  disabled,
  placeholder = 'Start typing a street address',
  className = 'w-full rounded-xl border border-slate-200 px-3 py-2.5 text-[13px] outline-none focus:border-blue-500 disabled:opacity-60',
}: MapboxAddressInputProps) {
  return (
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
}

/** Client-only Mapbox Address Autofill (search-js touches `document` at import time). */
export function MapboxAddressInput(props: MapboxAddressInputProps) {
  const [Inner, setInner] = useState<ComponentType<MapboxAddressInputProps> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void import('./MapboxAddressInputInner').then((mod) => {
      if (!cancelled) setInner(() => mod.MapboxAddressInputInner);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!Inner) return <PlainAddressInput {...props} />;
  return <Inner {...props} />;
}
