import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { unauthorized } from '../lib/errors.js';
import { signToken } from '../lib/jwt.js';
import type { LoginInput } from '../validation/schemas.js';

// Compared against when the email is unknown, so a missing account
// takes about as long to reject as a wrong password.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

export async function login({ email, password }: LoginInput) {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    throw unauthorized('Invalid email or password');
  }

  return {
    token: signToken({ id: user.id, role: user.role }),
    user: { id: user.id, name: user.name, role: user.role },
  };
}
