// Admin-only email configuration (CONTRACTS.md §5.3). The Brevo key is write-only: no view, log or error ever returns it.
import { t } from 'spacetimedb/server';
import { spacetimedb } from '../schema';
import { requireAdmin } from '../auth';
import { fail, oneOf } from '../constants';
import { DEFAULT_DAILY_SEND_CAP } from '../account_constants';
import { ensureAccountTick } from '../account_maintenance';
import { hex } from '../email_flow';
import { normalizeEmail } from '../email';
import { sha256Hex } from '../sha256';

const EMAIL_MODES = ['demo', 'brevo'] as const;

/**
 * Sets (or updates) the single email_config row. Omitted optional args keep their current value. The first call generates
 * hash_pepper (never rotated: changing it would orphan every account's email_hash). mode 'brevo' needs the API key and a
 * sender_email (a sender verified in Brevo). Also makes sure the 60 s account_tick schedule exists on databases that
 * predate it.
 */
export const admin_set_email_config = spacetimedb.reducer(
  {
    mode: t.string(),
    brevo_api_key: t.string().optional(),
    sender_email: t.string().optional(),
    require_stepup: t.bool().optional(),
    daily_send_cap: t.u32().optional(),
  },
  (ctx, a) => {
    requireAdmin(ctx.db, ctx.sender);
    const mode = oneOf(EMAIL_MODES, a.mode, 'mode');
    const cur = ctx.db.email_config.id.find(0);
    const pepper =
      cur?.hash_pepper ||
      sha256Hex(`pepper:${hex(ctx.random.fill(new Uint8Array(32)))}:${ctx.newUuidV4().toString()}:${ctx.sender.toHexString()}:${ctx.timestamp.microsSinceUnixEpoch}`);
    const apiKey = a.brevo_api_key !== undefined ? a.brevo_api_key.trim() : (cur?.brevo_api_key ?? '');
    let sender = cur?.sender_email ?? '';
    if (a.sender_email !== undefined) {
      const raw = a.sender_email.trim();
      if (raw === '') sender = '';
      else {
        const n = normalizeEmail(raw);
        if (!n) fail('sender_email must be a valid email address');
        sender = n;
      }
    }
    const cap = a.daily_send_cap ?? cur?.daily_send_cap ?? DEFAULT_DAILY_SEND_CAP;
    if (cap < 1 || cap > 100_000) fail('daily_send_cap must be 1-100000');
    if (apiKey && !/^[\x21-\x7e]{8,200}$/.test(apiKey)) fail('brevo_api_key has an invalid shape');
    if (mode === 'brevo' && (!apiKey || !sender)) {
      fail('brevo mode needs brevo_api_key and sender_email');
    }
    const row = {
      id: 0,
      mode,
      brevo_api_key: apiKey,
      sender_email: sender,
      hash_pepper: pepper,
      require_stepup: a.require_stepup ?? cur?.require_stepup ?? false,
      daily_send_cap: cap,
    };
    if (cur) ctx.db.email_config.id.update(row);
    else ctx.db.email_config.insert(row);
    // Plaintext demo codes exist only in demo mode.
    if (mode !== 'demo') for (const d of [...ctx.db.demo_code.iter()]) ctx.db.demo_code.challenge_id.delete(d.challenge_id);
    ensureAccountTick(ctx.db);
  }
);
