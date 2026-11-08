'use client';

import { useEffect, useMemo } from 'react';
import { CircleMarker, MapContainer, Polygon, Popup, TileLayer, useMap } from 'react-leaflet';
import { cellBounds } from '@hack/address';
import type { CellMapProps } from '@/components/affected/placeholders/types';
import { DAMAGE_LEVEL_RANK } from '@hack/contracts/common';
import { damageLevelHex } from '@/lib/format';
import './leaflet.css';

function FitBounds({
  center,
  cells,
}: {
  center: { lat: number; lng: number };
  cells: CellMapProps['cells'];
}) {
  const map = useMap();
  useEffect(() => {
    const pts: [number, number][] = [[center.lat, center.lng]];
    for (const c of cells) {
      const [[south, west], [north, east]] = cellBounds(c.cellId);
      pts.push([south, west], [north, east]);
    }
    if (pts.length === 1) {
      map.setView(pts[0]!, 15);
      return;
    }
    map.fitBounds(pts, { padding: [28, 28], maxZoom: 16 });
  }, [map, center, cells]);
  return null;
}

function cellFill(cell: CellMapProps['cells'][number], mode: CellMapProps['mode']): string {
  if (mode === 'damage') {
    if (DAMAGE_LEVEL_RANK[cell.worstLevel] <= 0) return 'transparent';
    return damageLevelHex(cell.worstLevel);
  }
  const n = cell.hazardReportCount72h;
  if (n <= 0) return 'transparent';
  if (n === 1) return '#f59e0b';
  if (n <= 4) return '#ea580c';
  return '#dc2626';
}

/** Aggregated ~250 m cells for the affected area view (IMPLEMENTATION_PLAN T1.5). */
export function CellMap({ center, ownPin, cells, mode }: CellMapProps) {
  const polygons = useMemo(
    () =>
      cells.map((c) => {
        const [[south, west], [north, east]] = cellBounds(c.cellId);
        return {
          cell: c,
          positions: [
            [south, west],
            [south, east],
            [north, east],
            [north, west],
          ] as [number, number][],
          fill: cellFill(c, mode),
        };
      }),
    [cells, mode],
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={14}
        className="z-0 h-64 w-full"
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds center={center} cells={cells} />
        {polygons.map(({ cell, positions, fill }) =>
          fill === 'transparent' ? null : (
            <Polygon
              key={cell.cellId}
              pathOptions={{ color: fill, weight: 1, fillColor: fill, fillOpacity: 0.35 }}
              positions={positions}
            >
              <Popup>
                <p className="text-xs font-semibold">
                  {cell.reportCount72h} report{cell.reportCount72h === 1 ? '' : 's'} (72h)
                </p>
                {mode === 'damage' ? (
                  <p className="text-xs">Worst: {cell.worstLevel}</p>
                ) : (
                  <>
                    <p className="text-xs">Hazard reports: {cell.hazardReportCount72h}</p>
                    {cell.severeHazardCount72h > 0 ? (
                      <p className="text-xs font-bold text-red-700">⚠ Severe hazard flagged</p>
                    ) : null}
                    {cell.hazardFlags.length > 0 ? (
                      <p className="text-xs">{cell.hazardFlags.join(', ')}</p>
                    ) : cell.hazardReportCount72h > 0 ? (
                      <p className="text-xs">Hazard reported</p>
                    ) : null}
                  </>
                )}
              </Popup>
            </Polygon>
          ),
        )}
        {ownPin ? (
          <CircleMarker
            center={[ownPin.lat, ownPin.lng]}
            pathOptions={{ color: '#1d4ed8', fillColor: '#2563eb', fillOpacity: 1 }}
            radius={8}
          >
            <Popup>Your location</Popup>
          </CircleMarker>
        ) : null}
      </MapContainer>
      <p className="bg-slate-50 px-3 py-1.5 text-[10px] text-slate-500">
        Aggregated cells only — no other people&apos;s pins or addresses.
      </p>
    </div>
  );
}
