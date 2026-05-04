/**
 * Minimal structured logger.
 * Outputs JSON lines in production, human-readable in development.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

const IS_PROD = process.env.NODE_ENV === 'production';

function write(level: Level, module: string, msg: string, meta?: Record<string, unknown>) {
  if (IS_PROD) {
    process.stdout.write(JSON.stringify({ ts: new Date().toISOString(), level, module, msg, ...meta }) + '\n');
  } else {
    const prefix = `[${module}]`;
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    fn(prefix, msg, meta ?? '');
  }
}

export function createLogger(module: string) {
  return {
    debug: (msg: string, meta?: Record<string, unknown>) => write('debug', module, msg, meta),
    info:  (msg: string, meta?: Record<string, unknown>) => write('info',  module, msg, meta),
    warn:  (msg: string, meta?: Record<string, unknown>) => write('warn',  module, msg, meta),
    error: (msg: string, meta?: Record<string, unknown>) => write('error', module, msg, meta),
  };
}
