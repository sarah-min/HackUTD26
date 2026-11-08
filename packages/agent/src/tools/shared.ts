import { FrameFindingSchema, type FrameFinding } from '@hack/contracts/assessment';
import { scratchOf, type JobContext } from '../context';

export function requireReportId(ctx: JobContext): string {
  const id = ctx.job.reportId;
  if (!id) throw new Error('this tool needs a report job');
  return id;
}

/** Findings for the report: the analyze handler seeds scratch; otherwise read the recorded frames. */
export async function loadFindings(ctx: JobContext): Promise<FrameFinding[]> {
  const scratch = scratchOf(ctx);
  const cached = scratch.get('findings') as FrameFinding[] | undefined;
  if (cached) return cached;
  const rows = await ctx.stdb.listFrames(requireReportId(ctx));
  const findings: FrameFinding[] = [];
  for (const row of rows) {
    try {
      const parsed = FrameFindingSchema.safeParse(JSON.parse(row.findingJson));
      if (parsed.success) findings.push(parsed.data);
    } catch {
      // a malformed row is skipped; record_frame only stores validated JSON
    }
  }
  findings.sort((a, b) => a.frameIndex - b.frameIndex);
  scratch.set('findings', findings);
  return findings;
}

/** Report coordinates: device GPS / geocode point on report_private, else the property's geocode point. */
export async function loadCoordinates(ctx: JobContext): Promise<{ lat: number; lng: number } | null> {
  const scratch = scratchOf(ctx);
  if (scratch.has('coords')) return scratch.get('coords') as { lat: number; lng: number } | null;
  const reportId = requireReportId(ctx);
  let coords: { lat: number; lng: number } | null = null;
  const priv = await ctx.stdb.getReportPrivate(reportId);
  if (priv?.lat != null && priv.lng != null) coords = { lat: priv.lat, lng: priv.lng };
  if (!coords) {
    const report = await ctx.stdb.getReport(reportId);
    const prop = report ? await ctx.stdb.getPropertyPrivate(report.propertyId) : null;
    if (prop?.lat != null && prop.lng != null) coords = { lat: prop.lat, lng: prop.lng };
  }
  scratch.set('coords', coords);
  return coords;
}
