// Area-notice helpers (not exported from index.ts: only reducers/views may be).
import type { Ctx } from './constants';

/** Delete NWS alerts whose expires_at has passed. Called from refresh_area_cells. */
export function purgeExpiredNotices(ctx: Ctx): void {
  const now = ctx.timestamp.microsSinceUnixEpoch;
  for (const n of [...ctx.db.area_notice.iter()]) {
    if (n.kind === 'nws_alert' && n.expires_at && n.expires_at.microsSinceUnixEpoch <= now) {
      ctx.db.area_notice.id.delete(n.id);
    }
  }
}
