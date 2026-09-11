import { Pool } from 'pg';

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

function makePool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }
  return new Pool({
    connectionString: url,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}

function getPool(): Pool {
  return global.__pgPool ?? (global.__pgPool = makePool());
}

// Lazy proxy: defer Pool construction (and the DATABASE_URL check) to the
// first actual call. Otherwise `next build`'s page-data collection imports
// this module and throws before env vars are wired up.
export const pool: Pool = new Proxy({} as Pool, {
  get(_target, prop) {
    const real = getPool() as unknown as Record<PropertyKey, unknown>;
    const value = real[prop];
    return typeof value === 'function' ? value.bind(real) : value;
  },
});
