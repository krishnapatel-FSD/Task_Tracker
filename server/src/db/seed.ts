import bcrypt from 'bcryptjs';
import { sql } from 'drizzle-orm';
import { db, pool } from './index.js';
import { projects, taskEvents, tasks, users, type Priority, type Status } from './schema.js';

// Seeding is the only way accounts are created (no sign-up).
// Safe to re-run: existing users (matched by email) are left alone, and sample
// projects and tasks are only added when the tasks table is empty.
//   npm run db:seed          add missing users, add sample data to an empty database
//   npm run db:reset         wipe tasks, projects and history, then seed fresh sample data
const DEFAULT_PASSWORD = 'password123';
const RESET = process.argv.includes('--reset');
const DAY = 86_400_000;

const seedUsers = [
  { name: 'Admin', email: 'admin@example.com', role: 'admin' as const },
  { name: 'Asha Patel', email: 'asha@example.com', role: 'employee' as const },
  { name: 'Ben Carter', email: 'ben@example.com', role: 'employee' as const },
  { name: 'Chen Li', email: 'chen@example.com', role: 'employee' as const },
  { name: 'Rohan Mehta', email: 'rohan@example.com', role: 'employee' as const },
  { name: 'Sara Okafor', email: 'sara@example.com', role: 'employee' as const },
];

const seedProjects = [
  {
    name: 'Website relaunch',
    description: 'New marketing site and help centre.',
    colourIndex: 1,
    titles: [
      'Write homepage copy', 'Audit old blog posts', 'Design pricing page', 'Set up redirects from old URLs',
      'Choose stock photography', 'Build contact form', 'Accessibility check on templates', 'Migrate help articles',
      'Draft launch announcement', 'Fix broken links in footer', 'Review mobile navigation', 'Compress hero images',
    ],
  },
  {
    name: 'Client onboarding',
    description: 'Getting new customers live in their first two weeks.',
    colourIndex: 2,
    titles: [
      'Kick-off call with Harbor Foods', 'Prepare onboarding checklist', 'Import customer data for Lumen Dental',
      'Schedule training session', 'Send welcome pack', 'Configure user roles for Northwind', 'Collect logo and brand colours',
      'Follow up on signed contract', 'Record walkthrough video', 'Check first invoice with finance',
    ],
  },
  {
    name: 'Internal ops',
    description: 'Office, finance and team admin.',
    colourIndex: 3,
    titles: [
      'Prepare quarterly report', 'Renew software licences', 'Update onboarding checklist', 'Book venue for team offsite',
      'Review Q4 budget', 'Collect expense receipts', 'Order new laptops', 'Plan holiday cover rota',
      'Update emergency contacts', 'Archive old shared drives',
    ],
  },
];

const descriptions = [
  'Keep notes in the shared folder and flag anything blocking.',
  'Check with the team lead before sending anything external.',
  'Use last quarter as the reference and note what changed.',
  'Aim for a first draft, then ask for one round of review.',
  'Coordinate with finance if costs go above the usual budget.',
];

// Small deterministic random generator, so every reset produces the same data.
let state = 20261012;
function rand() {
  state = (state * 1664525 + 1013904223) % 4294967296;
  return state / 4294967296;
}
const pick = <T,>(items: T[]) => items[Math.floor(rand() * items.length)];
const between = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

async function main() {
  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  await db
    .insert(users)
    .values(seedUsers.map((u) => ({ ...u, passwordHash })))
    .onConflictDoNothing({ target: users.email });

  if (RESET) {
    // CASCADE also clears rows in later tables that reference tasks (notifications, attachments, reports).
    await db.execute(sql`truncate table ${taskEvents}, ${tasks}, ${projects} restart identity cascade`);
  }

  const [{ taskCount }] = await db.select({ taskCount: sql<number>`count(*)`.mapWith(Number) }).from(tasks);
  if (taskCount > 0) {
    console.log('Tasks already exist; skipped sample data. Use npm run db:reset for fresh sample data.');
    return;
  }

  const allUsers = await db.select().from(users);
  const admin = allUsers.find((u) => u.role === 'admin')!;
  const employees = allUsers.filter((u) => u.role === 'employee');

  const now = new Date();
  const today = startOfDay(now);

  for (const p of seedProjects) {
    const [project] = await db
      .insert(projects)
      .values({ name: p.name, description: p.description, colourIndex: p.colourIndex, createdAt: new Date(today.getTime() - 70 * DAY) })
      .returning();

    for (const title of p.titles) {
      // Created somewhere in the last eight weeks, due 3 to 14 days later.
      // Skewed toward recent weeks, so there is upcoming work as well as history.
      const createdAt = new Date(today.getTime() - Math.floor(56 * rand() ** 1.8) * DAY + between(9, 17) * 3_600_000);
      if (createdAt > now) createdAt.setTime(now.getTime() - 3_600_000);
      const deadline = new Date(startOfDay(createdAt).getTime() + between(3, 14) * DAY);
      const assignee = pick(employees);
      const priority = pick<Priority>(['low', 'medium', 'medium', 'high']);

      // Work that was due a while ago is mostly finished; recent work is mostly open.
      const dueInPast = deadline < today;
      const roll = rand();
      let status: Status = 'todo';
      let startedAt: Date | null = null;
      let completedAt: Date | null = null;

      if (dueInPast ? roll < 0.75 : roll < 0.15) {
        status = 'done';
        // Most finish on or before the deadline; some run late.
        const offset = rand() < 0.75 ? -between(0, 3) : between(1, 4);
        completedAt = new Date(deadline.getTime() + offset * DAY + between(10, 17) * 3_600_000);
        if (completedAt <= createdAt) completedAt = new Date(createdAt.getTime() + 4 * 3_600_000);
        if (completedAt > now) completedAt = new Date(now.getTime() - 3_600_000);
      } else if (rand() < 0.5) {
        status = 'in_progress';
      }
      if (status !== 'todo') {
        const end = completedAt ?? now;
        startedAt = new Date(createdAt.getTime() + rand() * (end.getTime() - createdAt.getTime()) * 0.5);
      }

      const [task] = await db
        .insert(tasks)
        .values({
          title,
          description: pick(descriptions),
          assigneeId: assignee.id,
          projectId: project.id,
          priority,
          deadline: isoDate(deadline),
          status,
          completedAt,
          createdAt,
          updatedAt: completedAt ?? startedAt ?? createdAt,
        })
        .returning();

      const events: (typeof taskEvents.$inferInsert)[] = [
        {
          taskId: task.id,
          actorId: admin.id,
          type: 'created',
          data: { title, assigneeId: assignee.id, projectId: project.id, priority, deadline: task.deadline },
          createdAt,
        },
      ];
      if (startedAt) {
        events.push({ taskId: task.id, actorId: assignee.id, type: 'status_changed', data: { from: 'todo', to: 'in_progress' }, createdAt: startedAt });
      }
      if (completedAt) {
        events.push({ taskId: task.id, actorId: assignee.id, type: 'status_changed', data: { from: 'in_progress', to: 'done' }, createdAt: completedAt });
      }
      await db.insert(taskEvents).values(events);
    }
  }

  console.log(`Seed complete. All seeded accounts use the password "${DEFAULT_PASSWORD}".`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
