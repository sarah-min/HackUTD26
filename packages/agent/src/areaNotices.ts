import { scratchOf, type JobContext } from './context';
import type { AssessmentLocation, DisasterDeclaration } from '@hack/contracts/assessment';

// Public county notices for unverified visitors (CONTRACTS §5.1 area_notice, §5.2 record_area_notices).
// Built from the analyze tools' results; Part 2's module replaces every notice for the county with this list.

/** One element of record_area_notices' `notices_json` (epoch ms, camelCase). */
export interface AreaNoticeInput {
  kind: 'nws_alert' | 'fema_declaration';
  title: string;
  severity?: string;
  headline?: string;
  declarationString?: string;
  ihProgramDeclared?: boolean;
  sourceUrl?: string;
  effectiveAt: number;
  expiresAt?: number;
}

export const MAX_AREA_NOTICES = 20;

/**
 * The county and its full current notice list, or null when either source wasn't checked. Replace semantics mean a
 * partial list would erase the other kind, so nothing is sent unless the location, FEMA and NWS lookups all ran.
 */
export function buildAreaNotices(ctx: JobContext, now = Date.now()): { countyFips: string; notices: AreaNoticeInput[] } | { skip: string } {
  const scratch = scratchOf(ctx);
  const location = (scratch.get('location') as { location: AssessmentLocation | null } | undefined)?.location;
  const decl = scratch.get('declarations') as { queried: unknown; declarations: DisasterDeclaration[] } | undefined;
  const alerts = scratch.get('alerts') as { checked: boolean } | undefined;
  const alertNotices = (scratch.get('alertNotices') as AreaNoticeInput[] | undefined) ?? [];
  if (!location || !/^\d{5}$/.test(location.countyFips)) return { skip: 'county unknown' };
  if (!decl?.queried) return { skip: 'FEMA declarations not checked' };
  if (!alerts?.checked) return { skip: 'weather alerts not checked' };

  const fema: AreaNoticeInput[] = decl.declarations.map((d) => {
    const t = Date.parse(d.declarationDate);
    return {
      kind: 'fema_declaration',
      title: (d.title || d.incidentType || 'Disaster declaration').slice(0, 200),
      declarationString: d.femaDeclarationString.slice(0, 40),
      ihProgramDeclared: d.ihProgramDeclared,
      sourceUrl: d.sourceUrl.slice(0, 500),
      effectiveAt: Number.isFinite(t) ? t : now,
    };
  });
  const nws = alertNotices.filter((a) => a.expiresAt === undefined || a.expiresAt > now);
  return { countyFips: location.countyFips, notices: [...fema, ...nws].slice(0, MAX_AREA_NOTICES) };
}
