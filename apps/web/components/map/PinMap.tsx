'use client';

import { useEffect } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import { damageLevelHex } from '@/lib/format';
import './leaflet.css';

export type MapPin = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  level: string;
  claimed?: boolean;
  href?: string;
};

function FitPins({ pins }: { pins: MapPin[] }) {
  const map = useMap();
  useEffect(() => {
    if (pins.length === 0) return;
    if (pins.length === 1) {
      map.setView([pins[0]!.lat, pins[0]!.lng], 15);
      return;
    }
    map.fitBounds(
      pins.map((p) => [p.lat, p.lng] as [number, number]),
      { padding: [36, 36], maxZoom: 16 },
    );
  }, [map, pins]);
  return null;
}

/** Reporter "My submissions" pin map — only this identity's reports. */
export function PinMap({ pins }: { pins: MapPin[] }) {
  const center = pins[0] ? ([pins[0].lat, pins[0].lng] as [number, number]) : ([32.78, -96.8] as [number, number]);

  if (pins.length === 0) {
    return (
      <div className="grid h-56 place-items-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
        No mapped submissions yet
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
      <MapContainer center={center} zoom={13} className="z-0 h-64 w-full" scrollWheelZoom={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitPins pins={pins} />
        {pins.map((p) => (
          <CircleMarker
            key={p.id}
            center={[p.lat, p.lng]}
            pathOptions={{
              color: p.claimed ? '#059669' : damageLevelHex(p.level),
              fillColor: damageLevelHex(p.level),
              fillOpacity: 0.9,
              weight: 2,
            }}
            radius={9}
          >
            <Popup>
              <p className="text-xs font-semibold">{p.label}</p>
              <p className="text-xs capitalize">{p.level}</p>
              {p.claimed ? <p className="text-xs font-bold text-emerald-700">Claimed</p> : null}
              {p.href ? (
                <a className="text-xs font-bold text-blue-700 underline" href={p.href}>
                  Open report
                </a>
              ) : null}
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
