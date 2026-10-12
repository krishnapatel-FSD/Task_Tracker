import { pool } from '../db/index.js';

/**
 * Runs `fn` only if this process gets the named Postgres advisory lock, so a job
 * never runs twice at once when more than one server instance is up.
 * Returns undefined when another instance holds the lock.
 */
export async function withAdvisoryLock<T>(name: string, fn: () => Promise<T>): Promise<T | undefined> {
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ locked: boolean }>('select pg_try_advisory_lock(hashtext($1)) as locked', [name]);
    if (!rows[0].locked) return undefined;
    try {
      return await fn();
    } finally {
      await client.query('select pg_advisory_unlock(hashtext($1))', [name]);
    }
  } finally {
    client.release();
  }
}
