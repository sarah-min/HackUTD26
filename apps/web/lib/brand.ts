/** Aftermath brand tokens (P1). Damage colors match IMPLEMENTATION_PLAN T1.2. */
export const brand = {
  name: 'Aftermath',
  tagline: 'Disaster response network',
  navy: '#0f172a',
  accent: '#1d4ed8',
  danger: '#d32f2f',
} as const;

export const damageLevelColor = {
  none: { bg: 'bg-slate-200', text: 'text-slate-700', hex: '#94a3b8' },
  affected: { bg: 'bg-yellow-100', text: 'text-yellow-900', hex: '#eab308' },
  minor: { bg: 'bg-orange-100', text: 'text-orange-900', hex: '#f97316' },
  major: { bg: 'bg-red-100', text: 'text-red-900', hex: '#ef4444' },
  destroyed: { bg: 'bg-slate-900', text: 'text-white', hex: '#0f172a' },
} as const;
