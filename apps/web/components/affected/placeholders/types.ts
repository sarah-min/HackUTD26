// Props Part 2's affected pages pass to components owned by other parts. The real components
// must accept these props (extra optional props are fine). Raise changes in status/part2.md.
import type { AreaCell } from '@hack/contracts/property';
import type { LifeSafetyFlag } from '@hack/contracts/common';

export type LatLng = { lat: number; lng: number };

/** P1 `components/map` — affected area map (IMPLEMENTATION_PLAN T1.5). */
export interface CellMapProps {
  center: LatLng;
  /** The viewer's own property pin (verified: exact geocode; unverified: the address they entered). */
  ownPin: LatLng | null;
  cells: AreaCell[];
  /** Controlled by the page's Damage / Hazards toggle. */
  mode: 'damage' | 'hazards';
}

/** P1 `components/safety`. */
export interface Banner911Props {
  /** Why the banner is showing, e.g. "The person who filmed this reported someone in danger." */
  reason?: string;
}
export interface HazardListProps {
  flags: LifeSafetyFlag[];
}

/** P3 `components/damage-report` — frames, findings, hazards + guidance, cost lines, claim draft. */
export interface DamageReportProps {
  reportId: string;
}

/** P3 `components/agent-trace`. 'full' = every step (verified affected person). */
export interface AgentTraceProps {
  reportId: string;
  mode: 'full' | 'pipeline';
}

/** P4 `components/finance`. */
export interface RecoverySummaryCardProps {
  propertyId: string;
  reportId: string;
}
