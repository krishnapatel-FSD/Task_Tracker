// Applies the SQL migrations in src/db/migrations using the app's connection settings,
// so the same TLS rules apply locally and on Supabase.
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './index.js';

const url = new URL(process.env.DATABASE_URL!.replace(/^postgres(ql)?:/, 'http:'));
console.log(`Migrating ${url.hostname}:${url.port || 5432}${url.pathname} ...`);
await migrate(db, { migrationsFolder: 'src/db/migrations' });
console.log('Migrations applied.');
await pool.end();
