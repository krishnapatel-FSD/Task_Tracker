// One-time move of existing accounts into Supabase Auth. Each person keeps their current
// password (Supabase accepts the same bcrypt hashes) and is marked as confirmed, so nobody
// has to sign up again. Safe to rerun: linked accounts are skipped, and a login that already
// exists in Supabase for that email is linked instead of created.
// Usage: npm run logins:to-supabase -- [--skip someone@company.com ...]
import { isNull, eq } from 'drizzle-orm';
import { db, pool } from '../src/db/index.js';
import { users } from '../src/db/schema.js';
import { authProvider } from '../src/lib/supabaseAuth.js';

const args = process.argv.slice(2);
const skip = new Set(args.flatMap((a, i) => (args[i - 1] === '--skip' ? [a.toLowerCase()] : [])));
const pending = (await db.select().from(users).where(isNull(users.authId))).filter((u) => !skip.has(u.email));
if (skip.size) console.log(`Skipping ${skip.size} account(s).`);
let created = 0;
let linked = 0;
for (const u of pending) {
  const existing = await authProvider.findUserByEmail(u.email);
  const login =
    existing ?? (await authProvider.createUser({ email: u.email, name: u.name, ...(u.passwordHash ? { passwordHash: u.passwordHash } : {}) }));
  await db.update(users).set({ authId: login.id }).where(eq(users.id, u.id));
  if (existing) linked++;
  else created++;
  console.log(`${existing ? 'linked ' : 'created'} ${u.email}`);
}
console.log(`Done: ${created} created, ${linked} linked, ${pending.length} in total.`);
await pool.end();
