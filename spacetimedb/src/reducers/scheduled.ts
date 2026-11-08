// Scheduled reducers (CONTRACTS §5.1 lease_tick / area_tick).
import { spacetimedb } from '../schema';
import { lease_tick, area_tick } from '../tables/system';
import { refreshAllCells } from '../cells';
import { failAttempt, leaseExpired } from '../jobs';
import { fail } from '../constants';
import { purgeExpiredNotices } from '../notices';
import { BLOB_STALE_MICROS, deleteBlob, parseKey } from '../blobs';

function requireScheduler(isInternal: boolean, sender: { isEqual(o: unknown): boolean }, self: unknown): void {
  // Scheduled reducers run as the module itself; block direct client calls. The test harness reports
  // isInternal, but on a live host the scheduler's sender is the database's own identity instead.
  if (!isInternal && !sender.isEqual(self)) fail('unauthorized: scheduled only');
}

export const requeue_expired_jobs = spacetimedb.reducer(
  { onSchedule: lease_tick },
  { arg: lease_tick.rowType },
  ctx => {
    requireScheduler(ctx.senderAuth.isInternal, ctx.sender, ctx.databaseIdentity);
    for (const j of [...ctx.db.job.state.filter('leased')]) {
      if (leaseExpired(j, ctx.timestamp)) failAttempt(ctx, j, 'lease expired');
    }
    // Storage lifecycle: unfinished uploads, and ID images not tied to a pending verification, after 1 hour.
    const now = ctx.timestamp.microsSinceUnixEpoch;
    for (const b of [...ctx.db.blob.iter()]) {
      if (now - b.created_at.microsSinceUnixEpoch < BLOB_STALE_MICROS) continue;
      if (!b.complete || b.object_key.startsWith('idv/')) {
        deleteBlob(ctx.db, b.object_key);
        continue;
      }
      // Complete media never attached to a report (abandoned uploads) goes after the same hour.
      if (b.object_key.startsWith('media/')) {
        let attached = false;
        const k = parseKey(b.object_key);
        if (k.kind === 'media') for (const m of ctx.db.media_asset.report_id.filter(k.reportId)) if (m.object_key === b.object_key) attached = true;
        if (!attached) deleteBlob(ctx.db, b.object_key);
      }
    }
  }
);

export const refresh_area_cells = spacetimedb.reducer(
  { onSchedule: area_tick },
  { arg: area_tick.rowType },
  ctx => {
    requireScheduler(ctx.senderAuth.isInternal, ctx.sender, ctx.databaseIdentity);
    refreshAllCells(ctx);
    purgeExpiredNotices(ctx);
  }
);
