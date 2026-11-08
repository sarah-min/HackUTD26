import type { DamageLevel, LifeSafetyFlag } from '@hack/contracts/common';
import { damageLevelColor } from './brand';

export const DAMAGE_LEVEL_LABEL: Record<DamageLevel, string> = {
  none: 'No damage assessed yet',
  affected: 'Affected',
  minor: 'Minor',
  major: 'Major',
  destroyed: 'Destroyed',
};

export const REPORT_STATUS_LABEL: Record<string, string> = {
  draft: 'Draft — evidence not submitted yet',
  queued: 'Queued for analysis',
  processing: 'Analyzing footage',
  assessed: 'Assessment complete',
  needs_more_footage: 'Needs more footage',
  failed: 'Analysis failed',
};

export const FLAG_GUIDANCE: Record<LifeSafetyFlag, string> = {
  person_trapped: 'Possible person trapped — call 911 if anyone is in danger.',
  injury_visible: 'Visible injury reported — seek emergency care if needed.',
  active_fire: 'Active fire reported — evacuate and call 911.',
  gas_leak_suspected: 'Possible gas leak — leave the area and call 911.',
  structural_collapse: 'Structural damage — do not enter unstable buildings.',
  downed_power_line: 'Downed power line — stay far away and report to the utility.',
  standing_water_interior: 'Standing water indoors — electrical and contamination risk.',
  road_blocked: 'Road access may be blocked for responders and residents.',
};

export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}$${(abs / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatRelativeTime(epochMs: number, now = Date.now()): string {
  const delta = Math.round((now - epochMs) / 1000);
  if (delta < 60) return 'just now';
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  return `${Math.floor(delta / 86400)}d ago`;
}

export function damageLevelClasses(level: string): string {
  const key = level as DamageLevel;
  const c = damageLevelColor[key] ?? damageLevelColor.none;
  return `${c.bg} ${c.text}`;
}

export function damageLevelHex(level: string): string {
  const key = level as DamageLevel;
  return (damageLevelColor[key] ?? damageLevelColor.none).hex;
}
