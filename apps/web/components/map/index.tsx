'use client';

import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
import type { CellMapProps } from '@/components/affected/placeholders/types';
import type { MapPin } from './PinMap';

function MapSkeleton({ label }: { label: string }) {
  return (
    <div className="grid h-64 place-items-center rounded-2xl border border-slate-200 bg-slate-100 text-sm text-slate-500">
      Loading {label}…
    </div>
  );
}

export const CellMap = dynamic(
  () => import('./CellMap').then((m) => m.CellMap),
  { ssr: false, loading: () => <MapSkeleton label="area map" /> },
) as ComponentType<CellMapProps>;

export const PinMap = dynamic(
  () => import('./PinMap').then((m) => m.PinMap),
  { ssr: false, loading: () => <MapSkeleton label="map" /> },
) as ComponentType<{ pins: MapPin[] }>;

export const MapboxDamageMap = dynamic(
  () => import('./MapboxDamageMap').then((m) => m.MapboxDamageMap),
  { ssr: false, loading: () => <MapSkeleton label="mapbox" /> },
);

export type { MapPin };
export type { BuildingHighlight, MapMarkerSpec } from './MapboxDamageMap';
