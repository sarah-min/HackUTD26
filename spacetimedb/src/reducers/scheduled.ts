// Scheduled reducers (CONTRACTS §5.1 lease_tick / area_tick).
import { spacetimedb } from '../schema';
import { lease_tick, area_tick } from '../tables/system';
import { refreshAllCells } from '../cells';
import { failAttempt, leaseExpired } from '../jobs';
import { fail } from '../constants';
import { purgeExpiredNotices } from '../notices';

function requireScheduler(isInternal: boolean): void {
  // Scheduled reducers run as the module itself; block direct client calls.
  if (!isInternal) fail('unauthorized: scheduled only');
}

export const requeue_expired_jobs = spacetimedb.reducer(
  { onSchedule: lease_tick },
  { arg: lease_tick.rowType },
  ctx => {
    requireScheduler(ctx.senderAuth.isInternal);
    for (const j of [...ctx.db.job.state.filter('leased')]) {
      if (leaseExpired(j, ctx.timestamp)) failAttempt(ctx, j, 'lease expired');
    }
  }
);

export const refresh_area_cells = spacetimedb.reducer(
  { onSchedule: area_tick },
  { arg: area_tick.rowType },
  ctx => {
    requireScheduler(ctx.senderAuth.isInternal);
    refreshAllCells(ctx);
    purgeExpiredNotices(ctx);
  }
);
