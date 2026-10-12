import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from '../lib/env.js';
import * as schema from './schema.js';

export const pool = new pg.Pool({ connectionString: env.DATABASE_URL });

export const db = drizzle(pool, { schema });

/** A transaction handle, as passed to db.transaction(async (tx) => ...). */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** Anything that can run queries: the shared db or an open transaction. */
export type DbOrTx = typeof db | Tx;
