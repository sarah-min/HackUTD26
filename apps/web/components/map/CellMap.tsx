'use client';

import { useMemo } from 'react';
import { cellBounds } from '@hack/address';
import type { CellMapProps } from '@/components/affected/placeholders/types';
import { DamageLegend, MapboxDamageMap, type BuildingHighlight, type MapMarkerSpec } from './MapboxDamageMap';
import type { DamageStatus } from './mapboxDamage';
import { demoStatusFor } from './mapboxGeo';

function toStatus(level: string): DamageStatus {
  const key = level.toLowerCase();
  if (key === 'destroyed' || key === 'severe') return 'severe';
  if (key === 'major' || key === 'moderate') return 'moderate';
  if (key === 'minor' || key === 'affected') return 'minor';
  return 'none';
}

function hazardStatus(cell: CellMapProps['cells'][number]): DamageStatus | null {
  if (cell.severeHazardCount72h > 0) return 'severe';
  if (cell.hazardReportCount72h >= 5) return 'severe';
  if (cell.hazardReportCount72h >= 2) return 'moderate';
  if (cell.hazardReportCount72h >= 1) return 'minor';
  return null;
}

/** Aggregated area map — Updatedfront Mapbox 3D buildings prioritized over Leaflet. */
export function CellMap({ center, ownPin, cells, mode }: CellMapProps) {
  const mapCenter = { lng: center.lng, lat: center.lat };

  const highlights: BuildingHighlight[] = useMemo(() => {
    const fromCells = cells.flatMap((c) => {
      const [[south, west], [north, east]] = cellBounds(c.cellId);
      const status =
        mode === 'damage' ? toStatus(c.worstLevel) : (hazardStatus(c) ?? ('none' as DamageStatus));
      if (mode === 'damage' && status === 'none') return [];
      if (mode === 'hazards' && !hazardStatus(c)) return [];
      return [
        {
          id: c.cellId,
          lng: (west + east) / 2,
          lat: (south + north) / 2,
          status,
        },
      ];
    });
    if (ownPin) {
      fromCells.push({
        id: 'residence',
        lng: ownPin.lng,
        lat: ownPin.lat,
        status: 'verified',
      });
    }
    return fromCells;
  }, [cells, mode, ownPin]);

  const markers: MapMarkerSpec[] = useMemo(() => {
    if (!ownPin) return [];
    return [
      {
        id: 'residence',
        lng: ownPin.lng,
        lat: ownPin.lat,
        status: 'verified',
        variant: 'residence',
        label: 'Your residence',
      },
    ];
  }, [ownPin]);

  const areaFill = useMemo(() => {
    if (cells.length > 0) return undefined;
    // Demo neighborhood fill only when live cells are empty — labeled synthetic below.
    return {
      center: mapCenter,
      radiusMeters: 280,
      statusFor: demoStatusFor(mapCenter, 280),
    };
  }, [cells.length, mapCenter.lat, mapCenter.lng]);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
      <div className="relative h-[460px] w-full bg-[#111922] md:h-[520px]">
        <MapboxDamageMap
          center={mapCenter}
          highlights={highlights}
          markers={markers}
          areaFill={areaFill}
          zoom={16.4}
          pitch={58}
          bearing={-22}
          className="absolute inset-0"
        />
        <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-xl border border-white/15 bg-[#0f172a]/85 px-3 py-2 text-white shadow-lg backdrop-blur-md">
          <p className="mb-1 text-[8px] font-bold uppercase tracking-[0.12em] text-slate-300">
            {mode === 'damage' ? 'Damage' : 'Hazards'}
          </p>
          <DamageLegend
            className="text-slate-100"
            statuses={mode === 'hazards' ? ['minor', 'moderate', 'severe', 'verified'] : undefined}
          />
        </div>
      </div>
      <p className="bg-slate-50 px-3 py-1.5 text-[10px] text-slate-500">
        Aggregated cells only — no other people&apos;s pins or addresses.
        {cells.length === 0 ? (
          <>
            {' '}
            <span className="font-semibold text-amber-700">Synthetic neighborhood shading</span> until
            live cells arrive.
          </>
        ) : null}
      </p>
    </div>
  );
}
