// LIVE email test against Brevo, DEV database only. Four manual steps, run in order:
//
//   pnpm live:email config                           set brevo mode from BREVO_API_KEY / BREVO_SENDER_EMAIL in ../.env.local
//   pnpm live:email request <your-email> <tokenFile> enroll request: sends a real email, prints delivery_state / error
//   pnpm live:email verify <code> <tokenFile>        enter the code from the email: enrolls the account
//   pnpm live:email cleanup <tokenFile>              delete the account and put the config back to demo mode
//
// <tokenFile> is a text file holding the SpacetimeDB token of a dev identity that is already VERIFIED for a property
// (e.g. the scratchpad aff.token, verified for property 2 on dev). The token and the Brevo key are never printed.
// Use only an address you own and consent to (a team member's own inbox). The address is printed masked (s***@x.com).
//
// Needs: ../.env.local with STDB_URI, STDB_MODULE (must end in -dev), BREVO_API_KEY, BREVO_SENDER_EMAIL (the sender
// must be verified in Brevo), and the `spacetime` CLI logged in as the dev ADMIN (config/cleanup call
// admin_set_email_config with that login). Typecheck: npx tsc -p .
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DbConnection } from '@hack/stdb-bindings';

const here = dirname(fileURLToPath(import.meta.url));
function loadEnv(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !line.trimStart().startsWith('#')) out[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
  }
  return out;
}
const env = loadEnv(join(here, '..', '.env.local'));
const STDB_URI = env.STDB_URI ?? '';
const STDB_MODULE = env.STDB_MODULE ?? '';
if (!STDB_URI || !STDB_MODULE) die('Missing STDB_URI / STDB_MODULE in .env.local');
if (!STDB_MODULE.endsWith('-dev')) die(`Refusing to run: STDB_MODULE "${STDB_MODULE}" is not a -dev database.`);

function die(msg: string): never {
  console.error(msg);
  process.exit(2);
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const none = '{"none":[]}';

/** admin_set_email_config via the CLI login. Args: mode, brevo_api_key?, sender_email?, require_stepup?, daily_send_cap?. */
function setConfig(mode: 'demo' | 'brevo', key?: string, sender?: string): void {
  const opt = (v?: string) => (v === undefined ? none : JSON.stringify({ some: v }));
  const secrets = [key, sender].filter((x): x is string => !!x);
  try {
    execFileSync(
      'spacetime',
      ['call', '--server', 'maincloud', STDB_MODULE, 'admin_set_email_config', JSON.stringify(mode), opt(key), opt(sender), none, none],
      { stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' }
    );
  } catch (e) {
    let msg = String((e as { stderr?: string }).stderr ?? 'spacetime call failed');
    for (const s of secrets) msg = msg.split(s).join('<redacted>');
    die(`admin_set_email_config failed (is the CLI logged in as the dev admin?):\n${msg.slice(0, 600)}`);
  }
}

function readToken(path: string | undefined): string {
  if (!path) die('Missing <tokenFile> (a text file with a VERIFIED dev identity token).');
  const t = readFileSync(path, 'utf8').trim();
  if (!t) die('Token file is empty.');
  return t;
}

const QUERIES = ['my_account', 'my_email_challenge', 'my_auth_status', 'my_verifications'].map(v => `SELECT * FROM ${v}`);
async function connect(token: string): Promise<DbConnection> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('connect/subscribe timeout')), 20000);
    DbConnection.builder()
      .withUri(STDB_URI)
      .withDatabaseName(STDB_MODULE)
      .withToken(token)
      .onConnect(conn => {
        conn
          .subscriptionBuilder()
          .onApplied(() => {
            clearTimeout(timer);
            resolve(conn);
          })
          .onError((_ctx: unknown) => {
            clearTimeout(timer);
            reject(new Error('subscription error'));
          })
          .subscribe(QUERIES);
      })
      .onConnectError((_ctx, err) => {
        clearTimeout(timer);
        reject(new Error(`connect error ${String(err)}`));
      })
      .build();
  });
}

async function waitFor<T>(fn: () => T | undefined | null | false, ms = 10000): Promise<T | undefined> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const v = fn();
    if (v) return v as T;
    await sleep(100);
  }
  return undefined;
}

const mask = (e: string) => {
  const n = e.trim().toLowerCase();
  const at = n.lastIndexOf('@');
  return `${at >= 2 ? n[0] : ''}***${n.slice(at)}`;
};

async function main(): Promise<void> {
  const [step, a1, a2] = process.argv.slice(2);
  switch (step) {
    case 'config': {
      const key = env.BREVO_API_KEY ?? '';
      const sender = env.BREVO_SENDER_EMAIL ?? '';
      if (!key || !sender) die('Missing BREVO_API_KEY / BREVO_SENDER_EMAIL in ../.env.local');
      setConfig('brevo', key, sender);
      console.log(`email_config set to brevo mode on ${STDB_MODULE} (key and sender are not printed).`);
      console.log(`Check: spacetime sql --server maincloud ${STDB_MODULE} "SELECT * FROM admin_email_config"  (booleans only)`);
      return;
    }
    case 'request': {
      if (!a1) die('Usage: live:email request <your-email> <tokenFile>');
      const conn = await connect(readToken(a2));
      const status = [...conn.db.myAuthStatus.iter()][0];
      console.log(`mode: ${status?.mode ?? 'unknown'}`);
      if (status?.mode !== 'brevo') die('Mode is not brevo: run the config step first.');
      const verified = [...conn.db.myVerifications.iter()].some(v => v.state === 'verified');
      if (!verified) die('This token is not a VERIFIED identity (enroll needs a verified property).');
      if ([...conn.db.myAccount.iter()].length > 0) die('This identity already has an account: run cleanup first.');
      const r = await conn.procedures.requestEmailCode({ email: a1, purpose: 'enroll' });
      console.log(`request_email_code -> ok=${r.ok} error=${r.error || '-'} retryAfterS=${r.retryAfterS} (address ${mask(a1)})`);
      if (r.ok) {
        const ch = await waitFor(() => [...conn.db.myEmailChallenge.iter()].find(c => c.id === r.challengeId));
        console.log(`delivery_state=${ch?.deliveryState ?? '?'} delivery_error=${ch?.deliveryError ?? '-'}`);
        console.log(ch?.deliveryState === 'sent' ? 'Sent. Check the inbox (and spam), then run: live:email verify <code> <tokenFile>' : 'Not sent: see delivery_error (brevo:<status>:<code>); `spacetime logs` shows module errors.');
      }
      conn.disconnect();
      return;
    }
    case 'verify': {
      if (!a1) die('Usage: live:email verify <code> <tokenFile>');
      const conn = await connect(readToken(a2));
      const ch = await waitFor(() => [...conn.db.myEmailChallenge.iter()].sort((x, y) => Number(y.id - x.id))[0]);
      if (!ch) die('No open challenge for this identity (expired? run request again).');
      const r = await conn.procedures.verifyEmailCode({ challengeId: ch.id, code: a1.trim() });
      console.log(`verify_email_code -> ok=${r.ok} error=${r.error || '-'} attemptsLeft=${r.attemptsLeft} purpose=${r.purpose}`);
      if (r.ok) {
        const acct = await waitFor(() => [...conn.db.myAccount.iter()][0]);
        console.log(`my_account: ${acct ? `enrolled, emailMasked=${acct.emailMasked}` : 'not visible yet'}`);
      }
      conn.disconnect();
      return;
    }
    case 'cleanup': {
      const conn = await connect(readToken(a1));
      if ([...conn.db.myAccount.iter()].length > 0) {
        await conn.reducers.deleteAccount({});
        console.log('Account deleted (verifications and reports stay).');
      } else {
        console.log('No account on this identity.');
      }
      conn.disconnect();
      setConfig('demo');
      console.log('email_config set back to demo mode (the key and sender stay stored; they are write-only).');
      return;
    }
    default:
      die('Usage: live:email config | request <email> <tokenFile> | verify <code> <tokenFile> | cleanup <tokenFile>');
  }
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(`live-email failed: ${String((e as Error)?.message ?? e).slice(0, 400)}`);
    process.exit(1);
  });
