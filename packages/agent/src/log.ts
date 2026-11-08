export interface Logger {
  debug(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
  child(scope: string): Logger;
}

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;

/**
 * JSON-lines logger. Never pass IdDocumentFields, finance JSON, reporter notes or secrets as data.
 * Keys named like secrets are redacted defensively.
 */
export function createLogger(scope: string, minLevel: Level = (process.env.LOG_LEVEL as Level) || 'info'): Logger {
  const redact = (data?: Record<string, unknown>) => {
    if (!data) return undefined;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      out[k] = /secret|token|key|password|authorization/i.test(k) && !/objectKey|thumbKey/i.test(k) ? '[redacted]' : v;
    }
    return out;
  };
  const emit = (level: Level, msg: string, data?: Record<string, unknown>) => {
    if (LEVELS[level] < LEVELS[minLevel]) return;
    const line = JSON.stringify({ t: new Date().toISOString(), level, scope, msg, ...redact(data) });
    (level === 'error' || level === 'warn' ? process.stderr : process.stdout).write(line + '\n');
  };
  return {
    debug: (m, d) => emit('debug', m, d),
    info: (m, d) => emit('info', m, d),
    warn: (m, d) => emit('warn', m, d),
    error: (m, d) => emit('error', m, d),
    child: (s) => createLogger(`${scope}:${s}`, minLevel),
  };
}
