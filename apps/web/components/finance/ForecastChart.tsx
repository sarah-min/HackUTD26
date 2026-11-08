'use client';

import type { ForecastPoint } from '@hack/contracts/finance';
import { formatCents } from '@/lib/format';

/** Simple SVG liquid-cash forecast (91 days). */
export function ForecastChart({
  forecast,
  firstShortfallDay,
}: {
  forecast: readonly ForecastPoint[];
  firstShortfallDay: number | null;
}) {
  if (forecast.length === 0) {
    return <p className="text-[12px] text-slate-500">No forecast yet.</p>;
  }

  const values = forecast.map((p) => p.liquidCents);
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  const w = 320;
  const h = 120;
  const pad = 8;
  const points = forecast
    .map((p, i) => {
      const x = pad + (i / Math.max(1, forecast.length - 1)) * (w - pad * 2);
      const y = pad + (1 - (p.liquidCents - min) / (max - min)) * (h - pad * 2);
      return `${x},${y}`;
    })
    .join(' ');

  const zeroY = pad + (1 - (0 - min) / (max - min)) * (h - pad * 2);

  return (
    <div className="space-y-2">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full" role="img" aria-label="90-day cash forecast">
        <line x1={pad} y1={zeroY} x2={w - pad} y2={zeroY} stroke="#cbd5e1" strokeWidth="1" />
        <polyline fill="none" stroke="#1d4ed8" strokeWidth="2" points={points} />
        {firstShortfallDay != null && firstShortfallDay >= 0 && firstShortfallDay < forecast.length ? (
          <line
            x1={pad + (firstShortfallDay / Math.max(1, forecast.length - 1)) * (w - pad * 2)}
            y1={pad}
            x2={pad + (firstShortfallDay / Math.max(1, forecast.length - 1)) * (w - pad * 2)}
            y2={h - pad}
            stroke="#dc2626"
            strokeDasharray="4 3"
            strokeWidth="1.5"
          />
        ) : null}
      </svg>
      <div className="flex justify-between text-[10px] text-slate-500">
        <span>Day 0 · {formatCents(forecast[0]!.liquidCents)}</span>
        <span>
          Day 90 · {formatCents(forecast[forecast.length - 1]!.liquidCents)}
          {firstShortfallDay != null ? ` · shortfall day ${firstShortfallDay}` : ''}
        </span>
      </div>
    </div>
  );
}
