'use client';

import { useMemo } from 'react';
import { DamageLegend, MapboxDamageMap, type BuildingHighlight, type MapMarkerSpec } from './MapboxDamageMap';
import { DEFAULT_CENTER } from './mapboxGeo';
import type { DamageStatus } from './mapboxDamage';

export type MapPin = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  level: string;
  claimed?: boolean;
  href?: string;
};

function toStatus(level: string): DamageStatus {
  const key = level.toLowerCase();
  if (key === 'destroyed' || key === 'severe') return 'severe';
  if (key === 'major' || key === 'moderate') return 'moderate';
  if (key === 'minor' || key === 'affected') return 'minor';
  return 'none';
}

/** Reporter "My submissions" map — Updatedfront Mapbox building highlights + pins. */
export function PinMap({ pins }: { pins: MapPin[] }) {
  const center = pins[0] ? { lng: pins[0].lng, lat: pins[0].lat } : DEFAULT_CENTER;

  const highlights: BuildingHighlight[] = useMemo(
    () =>
      pins.map((p) => ({
        id: p.id,
        lng: p.lng,
        lat: p.lat,
        status: toStatus(p.level),
      })),
    [pins],
  );

  const markers: MapMarkerSpec[] = useMemo(
    () =>
      pins.map((p) => ({
        id: p.id,
        lng: p.lng,
        lat: p.lat,
        status: toStatus(p.level),
        variant: 'pin',
        label: p.claimed ? 'Claimed' : p.label,
        ariaLabel: p.label,
      })),
    [pins],
  );

  if (pins.length === 0) {
    return (
      <div className="grid h-56 place-items-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
        No mapped submissions yet
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
      <div className="relative h-[420px] w-full bg-[#111922]">
        <MapboxDamageMap
          center={center}
          highlights={highlights}
          markers={markers}
          zoom={16.2}
          pitch={55}
          bearing={-20}
          className="absolute inset-0"
        />
        <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-xl border border-white/15 bg-[#0f172a]/85 px-3 py-2 text-white shadow-lg backdrop-blur-md">
          <p className="mb-1 text-[8px] font-bold uppercase tracking-[0.12em] text-slate-300">Damage</p>
          <DamageLegend className="text-slate-100" />
        </div>
      </div>
    </div>
  );
}
