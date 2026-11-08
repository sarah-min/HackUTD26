// Pure helpers for the affected-person pages (Part 2). Unit-tested in helpers.test.ts.
import {
  AREA_CELL_MIN_REPORTS_FOR_FLAGS,
  NormalizedAddressSchema,
  type AreaCell,
  type NormalizedAddress,
} from '@hack/contracts/property';
import {
  DAMAGE_LEVEL_RANK,
  DamageLevelSchema,
  LifeSafetyFlagSchema,
  type DamageLevel,
  type LifeSafetyFlag,
} from '@hack/contracts/common';

export const DOC_KINDS = [
  { id: 'drivers_license', label: "Driver's license" },
  { id: 'state_id', label: 'State ID card' },
  { id: 'utility_bill', label: 'Utility bill (if your ID shows an old address)' },
  { id: 'insurance_declarations', label: 'Insurance declarations page' },
] as const;
export type DocKind = (typeof DOC_KINDS)[number]['id'];

export const FAIL_REASON_TEXT: Record<string, string> = {
  address_mismatch: "The address on the document doesn't match the address you entered.",
  unreadable: "We couldn't read the document. Try again in good light, flat, with all four corners visible.",
  not_an_id: "That doesn't look like one of the accepted documents.",
  expired: 'That document is expired.',
  rate_limited: 'Too many attempts. Please wait an hour and try again.',
};

export const DAMAGE_LEVEL_TEXT: Record<DamageLevel, string> = {
  none: 'No visible damage',
  affected: 'Minor damage',
  minor: 'Moderate damage',
  major: 'Severe damage',
  destroyed: 'Destroyed',
};

export const STATUS_TEXT: Record<string, string> = {
  draft: 'Being filed',
  queued: 'Waiting for review',
  processing: 'Reviewing photos',
  assessed: 'Report ready',
  needs_more_footage: 'Needs more photos',
  failed: 'Review didn’t finish',
};

/** CSV of LifeSafetyFlag (report.life_safety_csv) → validated flags; unknown values dropped. */
export function parseFlagsCsv(csv: string | null | undefined): LifeSafetyFlag[] {
  if (!csv) return [];
  const out: LifeSafetyFlag[] = [];
  for (const raw of csv.split(',')) {
    const r = LifeSafetyFlagSchema.safeParse(raw.trim());
    if (r.success && !out.includes(r.data)) out.push(r.data);
  }
  return out;
}

export function parseLevel(s: string): DamageLevel {
  const r = DamageLevelSchema.safeParse(s);
  return r.success ? r.data : 'none';
}

/** Generated row (camelCase columns; the generator spells `72h` as `72H`) → contract AreaCell. Enforces the ≥3-reports flag rule again client-side. */
export function toAreaCell(row: {
  cellId: string;
  reportCount72H: number;
  worstLevel: string;
  hazardReportCount72H: number;
  severeHazardCount72H: number;
  hazardFlagsCsv: string;
  lastReportAt: { toMillis(): bigint };
}): AreaCell {
  return {
    cellId: row.cellId,
    reportCount72h: row.reportCount72H,
    worstLevel: parseLevel(row.worstLevel),
    hazardReportCount72h: row.hazardReportCount72H,
    severeHazardCount72h: row.severeHazardCount72H,
    hazardFlags: row.reportCount72H >= AREA_CELL_MIN_REPORTS_FOR_FLAGS ? parseFlagsCsv(row.hazardFlagsCsv) : [],
    lastReportAt: Number(row.lastReportAt.toMillis()),
  };
}

/** Most severe level across reports (for the property header). */
export function worstLevel(levels: string[]): DamageLevel {
  return levels.map(parseLevel).reduce<DamageLevel>((a, b) => (DAMAGE_LEVEL_RANK[b] > DAMAGE_LEVEL_RANK[a] ? b : a), 'none');
}

/** Area banner data pulled loosely from an assessment JSON (P3's DamageAssessment). Never throws. */
export interface AreaNotices {
  declarations: { femaDeclarationString: string; title: string; incidentType: string; sourceUrl?: string }[];
  alerts: { event: string; severity: string; headline: string }[];
}
export function readAreaNotices(assessmentJson: string | null | undefined): AreaNotices {
  const empty: AreaNotices = { declarations: [], alerts: [] };
  if (!assessmentJson) return empty;
  try {
    const a = JSON.parse(assessmentJson) as { declarations?: unknown; activeAlerts?: unknown };
    const declarations = Array.isArray(a.declarations)
      ? a.declarations.filter(
          (d): d is AreaNotices['declarations'][number] =>
            !!d && typeof d === 'object' && typeof (d as { femaDeclarationString?: unknown }).femaDeclarationString === 'string',
        )
      : [];
    const alerts = Array.isArray(a.activeAlerts)
      ? a.activeAlerts.filter(
          (x): x is AreaNotices['alerts'][number] =>
            !!x && typeof x === 'object' && typeof (x as { event?: unknown }).event === 'string',
        )
      : [];
    return { declarations, alerts };
  } catch {
    return empty;
  }
}

/** A public `area_notice` row, as far as the banner needs it (matches the generated row type). */
export interface AreaNoticeLike {
  kind: string;
  title: string;
  severity?: string;
  headline?: string;
  declarationString?: string;
  sourceUrl?: string;
}

/** One line of the area banner. */
export interface BannerNotice {
  key: string;
  kind: 'fema_declaration' | 'nws_alert';
  text: string;
  url?: string;
}

/**
 * Merge notices for the banner: assessment-derived ones first (verified visitors only),
 * then the public `area_notice` rows (everyone). Deduped by declaration string / alert text.
 * Declarations are listed before alerts.
 */
export function mergeAreaNotices(fromAssessment: AreaNotices, fromTable: readonly AreaNoticeLike[]): BannerNotice[] {
  const out: BannerNotice[] = [];
  const seen = new Set<string>();
  const push = (n: BannerNotice) => {
    if (seen.has(n.key)) return;
    seen.add(n.key);
    out.push(n);
  };
  for (const d of fromAssessment.declarations)
    push({ key: `dec:${d.femaDeclarationString}`, kind: 'fema_declaration', text: `FEMA declaration ${d.femaDeclarationString}: ${d.title}` });
  for (const n of fromTable)
    if (n.kind === 'fema_declaration')
      push({
        key: `dec:${n.declarationString ?? n.title}`,
        kind: 'fema_declaration',
        text: n.declarationString ? `FEMA declaration ${n.declarationString}: ${n.title}` : `FEMA declaration: ${n.title}`,
        url: n.sourceUrl,
      });
  for (const a of fromAssessment.alerts)
    push({ key: `nws:${a.event}:${a.headline}`, kind: 'nws_alert', text: `${a.event} (${a.severity}): ${a.headline}` });
  for (const n of fromTable)
    if (n.kind === 'nws_alert')
      push({
        key: `nws:${n.title}:${n.headline ?? ''}`,
        kind: 'nws_alert',
        text: `${n.title}${n.severity ? ` (${n.severity})` : ''}${n.headline ? `: ${n.headline}` : ''}`,
        url: n.sourceUrl,
      });
  return out;
}

/** One-line display for a normalized address. */
export function formatAddress(a: Pick<NormalizedAddress, 'line1' | 'city' | 'state' | 'zip'>): string {
  return `${a.line1}, ${a.city}, ${a.state} ${a.zip}`;
}

// ---- Selected address, carried from /affected/start to /affected/verify (sessionStorage) --------

const SELECTED_KEY = 'affected:selectedAddress';

export function saveSelectedAddress(a: NormalizedAddress): void {
  try {
    sessionStorage.setItem(SELECTED_KEY, JSON.stringify(a));
  } catch {
    // reason: storage unavailable; /verify will send the user back to /start
  }
}

export function loadSelectedAddress(): NormalizedAddress | null {
  try {
    const raw = sessionStorage.getItem(SELECTED_KEY);
    if (!raw) return null;
    const r = NormalizedAddressSchema.safeParse(JSON.parse(raw));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}
