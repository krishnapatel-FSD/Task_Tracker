import { readFileSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from '../lib/env.js';
import * as schema from './schema.js';

/**
 * TLS for hosted databases. With a CA file the server's certificate is verified; without one
 * the connection is still encrypted but the certificate isn't checked.
 */
function sslOptions(): pg.PoolConfig['ssl'] {
  if (!env.DATABASE_SSL) return undefined;
  if (env.DATABASE_SSL_CA) return { ca: readFileSync(env.DATABASE_SSL_CA, 'utf8'), rejectUnauthorized: true };
  return { rejectUnauthorized: false };
}

// sslmode in the URL would override the options above, so drop it and let ssl decide.
const connectionString = env.DATABASE_URL.replace(/([?&])sslmode=[^&]*&?/, '$1').replace(/[?&]$/, '');

export const pool = new pg.Pool({ connectionString, ssl: sslOptions(), max: 10 });

export const db = drizzle(pool, { schema });

/** A transaction handle, as passed to db.transaction(async (tx) => ...). */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** Anything that can run queries: the shared db or an open transaction. */
export type DbOrTx = typeof db | Tx;
