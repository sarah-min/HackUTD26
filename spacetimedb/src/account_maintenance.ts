// Shared challenge/step-up housekeeping (not exported from index.ts).
import { ScheduleAt } from 'spacetimedb/server';
import { ACCOUNT_TICK_MICROS, CHALLENGE_KEEP_MICROS, EMAIL_PURGE_MICROS } from './account_constants';
import type { Db } from './constants';

export type Challenge = ReturnType<Db['email_challenge']['insert']>;

/** Ensures the 60 s account_tick schedule row exists (init does it on fresh DBs; older DBs get it lazily). */
export function ensureAccountTick(db: Db): void {
  if (db.account_tick.count() === 0n) {
    db.account_tick.insert({ scheduled_id: 0n, scheduled_at: ScheduleAt.interval(ACCOUNT_TICK_MICROS) });
  }
}

/** Marks a challenge finished and purges the email address and any demo code. */
export function closeChallenge(db: Db, ch: Challenge, extra: Partial<Pick<Challenge, 'locked_at'>> = {}): void {
  db.email_challenge.id.update({ ...ch, consumed: true, email_plain: '', ...extra });
  db.demo_code.challenge_id.delete(ch.id);
}

/**
 * Run by account_tick every 60 s (views have no clock, so this is what makes expiry visible):
 *  - clears expired step-ups (the update re-evaluates every subscribed view that gates on step-up),
 *  - closes expired challenges and purges email addresses older than 15 min and orphan demo codes,
 *  - deletes challenge rows older than 24 h (they are the rate-limit ledger until then).
 */
export function runAccountMaintenance(db: Db, nowMicros: bigint): void {
  for (const d of [...db.account_device.iter()]) {
    if (d.stepup_until && d.stepup_until.microsSinceUnixEpoch <= nowMicros) {
      db.account_device.identity.update({ ...d, stepup_until: undefined });
    }
  }
  for (const c of [...db.email_challenge.iter()]) {
    const age = nowMicros - c.created_at.microsSinceUnixEpoch;
    if (age > CHALLENGE_KEEP_MICROS) {
      db.demo_code.challenge_id.delete(c.id);
      db.email_challenge.id.delete(c.id);
      continue;
    }
    if (!c.consumed && c.expires_at.microsSinceUnixEpoch <= nowMicros) {
      closeChallenge(db, c);
    } else if (c.email_plain !== '' && age > EMAIL_PURGE_MICROS) {
      db.email_challenge.id.update({ ...c, email_plain: '' });
    }
  }
  for (const dc of [...db.demo_code.iter()]) {
    const c = db.email_challenge.id.find(dc.challenge_id);
    if (!c || c.consumed) db.demo_code.challenge_id.delete(dc.challenge_id);
  }
}
