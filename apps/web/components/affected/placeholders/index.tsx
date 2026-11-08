'use client';
// TEMPORARY placeholders so Part 2's pages compile and render before P1/P3/P4 ship their
// components. Delete each one once its line in ../external.ts points at the real component.
import { DAMAGE_LEVEL_RANK } from '@hack/contracts/common';
import type {
  AgentTraceProps,
  Banner911Props,
  CellMapProps,
  DamageReportProps,
  HazardListProps,
  RecoverySummaryCardProps,
} from './types';

function Box({ owner, name, children }: { owner: string; name: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-400 p-3 text-sm text-gray-600">
      <p className="font-medium">
        Placeholder: {name} <span className="text-xs">(owned by {owner})</span>
      </p>
      {children}
    </div>
  );
}

export function CellMap({ center, ownPin, cells, mode }: CellMapProps) {
  const shaded =
    mode === 'damage'
      ? cells.filter((c) => DAMAGE_LEVEL_RANK[c.worstLevel] > 0).length
      : cells.filter((c) => c.hazardReportCount72h > 0).length;
  return (
    <Box owner="P1" name="<CellMap>">
      <p>
        Center {center.lat.toFixed(4)}, {center.lng.toFixed(4)} · own pin {ownPin ? 'yes' : 'no'} · {cells.length} cells ·{' '}
        {shaded} shaded in {mode} mode
      </p>
    </Box>
  );
}

export function Banner911({ reason }: Banner911Props) {
  return (
    <div role="alert" className="rounded-lg bg-red-700 p-3 text-white">
      <p className="font-semibold">If anyone is in immediate danger, call 911.</p>
      {reason ? <p className="text-sm">{reason}</p> : null}
    </div>
  );
}

export function HazardList({ flags }: HazardListProps) {
  if (flags.length === 0) return null;
  return (
    <Box owner="P1" name="<HazardList>">
      <ul className="list-disc pl-5">
        {flags.map((f) => (
          <li key={f}>{f.replace(/_/g, ' ')}</li>
        ))}
      </ul>
    </Box>
  );
}

export function DamageReport({ reportId }: DamageReportProps) {
  return <Box owner="P3" name={`<DamageReport reportId="${reportId}">`} />;
}

export function AgentTrace({ reportId, mode }: AgentTraceProps) {
  return <Box owner="P3" name={`<AgentTrace reportId="${reportId}" mode="${mode}">`} />;
}

export function RecoverySummaryCard({ propertyId, reportId }: RecoverySummaryCardProps) {
  return <Box owner="P4" name={`<RecoverySummaryCard propertyId="${propertyId}" reportId="${reportId}">`} />;
}
