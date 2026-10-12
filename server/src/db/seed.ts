import bcrypt from 'bcryptjs';
import { db, pool } from './index.js';
import { tasks, users } from './schema.js';

// Seeding is the only way accounts are created (no sign-up).
// Safe to re-run: existing users (matched by email) are left alone,
// and sample tasks are only added when the tasks table is empty.
const DEFAULT_PASSWORD = 'password123';

/** YYYY-MM-DD for today plus `days`, so the sample data always has past and upcoming work. */
function dayFromToday(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const seedUsers = [
  { name: 'Admin', email: 'admin@example.com', role: 'admin' as const },
  { name: 'Asha Patel', email: 'asha@example.com', role: 'employee' as const },
  { name: 'Ben Carter', email: 'ben@example.com', role: 'employee' as const },
  { name: 'Chen Li', email: 'chen@example.com', role: 'employee' as const },
];

async function main() {
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  await db
    .insert(users)
    .values(seedUsers.map((u) => ({ ...u, passwordHash })))
    .onConflictDoNothing({ target: users.email });

  const allUsers = await db.select().from(users);
  const byEmail = new Map(allUsers.map((u) => [u.email, u.id]));

  const existingTasks = await db.select({ id: tasks.id }).from(tasks).limit(1);
  if (existingTasks.length === 0) {
    await db.insert(tasks).values([
      {
        title: 'Prepare quarterly report',
        description: 'Collect figures from finance and draft the Q4 summary.',
        assigneeId: byEmail.get('asha@example.com')!,
        priority: 'high',
        deadline: dayFromToday(8),
      },
      {
        title: 'Update onboarding checklist',
        description: 'Add the new security training step to the checklist.',
        assigneeId: byEmail.get('asha@example.com')!,
        priority: 'medium',
        deadline: dayFromToday(16),
        status: 'in_progress',
      },
      {
        title: 'Fix login page typo',
        description: 'The "Forgot password" link text is misspelled.',
        assigneeId: byEmail.get('ben@example.com')!,
        priority: 'low',
        deadline: dayFromToday(-3),
        status: 'done',
      },
      {
        title: 'Client demo prep',
        description: 'Build the slide deck and rehearse the product demo.',
        assigneeId: byEmail.get('chen@example.com')!,
        priority: 'high',
        deadline: dayFromToday(-1),
      },
    ]);
  }

  console.log(`Seed complete. All seeded accounts use the password "${DEFAULT_PASSWORD}".`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
