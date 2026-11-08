// area_cell_summary maintenance (CONTRACTS.md §2.3 area-map hazard rule).
// Counts come from assessed reports created in the last 72 h. hazard_flags_csv is only
// filled when the cell has >= 3 reports so a hazard type can't be pinned to one house.
import type { Timestamp } from 'spacetimedb';
import { tsFromMicros } from './values';
import {
  AREA_WINDOW_MICROS,
  CELL_FLAGS_MIN_REPORTS,
  DAMAGE_LEVEL_RANK,
  SEVERE_FLAGS,
  parseCsv,
  type Ctx,
} from './constants';
import { NO_CELL } from './matching';

interface CellAgg {
  count: number;
  worstRank: number;
  worstLevel: string;
  hazardReports: number;
  severeReports: number;
  flags: Set<string>;
  last: bigint;
}

function emptyAgg(): CellAgg {
  return { count: 0, worstRank: 0, worstLevel: 'none', hazardReports: 0, severeReports: 0, flags: new Set(), last: 0n };
}

type ReportRow = { status: string; created_at: Timestamp; overall_level: string; life_safety_csv: string };

function addReport(agg: CellAgg, r: ReportRow): void {
  agg.count++;
  const rank = DAMAGE_LEVEL_RANK[r.overall_level] ?? 0;
  if (agg.count === 1 || rank > agg.worstRank) {
    agg.worstRank = rank;
    agg.worstLevel = r.overall_level in DAMAGE_LEVEL_RANK ? r.overall_level : 'none';
  }
  const flags = parseCsv(r.life_safety_csv);
  if (flags.length > 0) agg.hazardReports++;
  if (flags.some(f => (SEVERE_FLAGS as readonly string[]).includes(f))) agg.severeReports++;
  for (const f of flags) agg.flags.add(f);
  const at = r.created_at.microsSinceUnixEpoch;
  if (at > agg.last) agg.last = at;
}

function inWindow(r: ReportRow, now: Timestamp): boolean {
  return r.status === 'assessed' && now.microsSinceUnixEpoch - r.created_at.microsSinceUnixEpoch <= AREA_WINDOW_MICROS;
}

function writeCell(ctx: Ctx, cellId: string, agg: CellAgg): void {
  const existing = ctx.db.area_cell_summary.cell_id.find(cellId);
  if (agg.count === 0) {
    if (existing) ctx.db.area_cell_summary.cell_id.delete(cellId);
    return;
  }
  const row = {
    cell_id: cellId,
    report_count_72h: agg.count,
    worst_level: agg.worstLevel,
    hazard_report_count_72h: agg.hazardReports,
    severe_hazard_count_72h: agg.severeReports,
    hazard_flags_csv: agg.count >= CELL_FLAGS_MIN_REPORTS ? [...agg.flags].sort().join(',') : '',
    last_report_at: tsFromMicros(ctx, agg.last),
  };
  if (existing) ctx.db.area_cell_summary.cell_id.update(row);
  else ctx.db.area_cell_summary.insert(row);
}

/** Recompute one cell from scratch (called from record_assessment). */
export function recomputeCell(ctx: Ctx, cellId: string): void {
  if (cellId === NO_CELL) return;
  const agg = emptyAgg();
  for (const r of ctx.db.report.cell_id.filter(cellId)) {
    if (inWindow(r, ctx.timestamp)) addReport(agg, r);
  }
  writeCell(ctx, cellId, agg);
}

/** Full rebuild of the 72 h window (scheduled refresh_area_cells). */
export function refreshAllCells(ctx: Ctx): void {
  const aggs = new Map<string, CellAgg>();
  for (const r of ctx.db.report.iter()) {
    if (r.cell_id === NO_CELL || !inWindow(r, ctx.timestamp)) continue;
    let a = aggs.get(r.cell_id);
    if (!a) aggs.set(r.cell_id, (a = emptyAgg()));
    addReport(a, r);
  }
  for (const existing of [...ctx.db.area_cell_summary.iter()]) {
    if (!aggs.has(existing.cell_id)) ctx.db.area_cell_summary.cell_id.delete(existing.cell_id);
  }
  for (const [id, agg] of aggs) writeCell(ctx, id, agg);
}
