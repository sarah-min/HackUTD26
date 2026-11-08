// Account housekeeping (not exported from index.ts).
import { ScheduleAt } from 'spacetimedb/server';
import { ACCOUNT_TICK_MICROS, ATTEMPT_KEEP_MICROS } from './account_constants';
import type { Db } from './constants';

/**
 * Ensures the 60 s account_tick schedule row exists. Called from init, admin_set_account_config and getAccountConfig (every
 * create / sign-in / step-up / replace), so a missing row self-heals on the next account activity.
 */
export function ensureAccountTick(db: Db): void {
  if (db.account_tick.count() === 0n) {
    db.account_tick.insert({ scheduled_id: 0n, scheduled_at: ScheduleAt.interval(ACCOUNT_TICK_MICROS) });
  }
}

/**
 * Run by account_tick every 60 s (views have no clock, so this is what makes expiry visible):
 *  - clears expired step-ups (the update re-evaluates every subscribed view that gates on step-up),
 *  - deletes failed-attempt ledger rows older than 24 h.
 */
export function runAccountMaintenance(db: Db, nowMicros: bigint): void {
  for (const d of [...db.account_device.iter()]) {
    if (d.stepup_until && d.stepup_until.microsSinceUnixEpoch <= nowMicros) {
      db.account_device.identity.update({ ...d, stepup_until: undefined });
    }
  }
  for (const a of [...db.code_attempt.iter()]) {
    if (nowMicros - a.at.microsSinceUnixEpoch >= ATTEMPT_KEEP_MICROS) db.code_attempt.id.delete(a.id);
  }
}
