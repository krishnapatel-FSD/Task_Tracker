import cron from 'node-cron';
import { env } from '../lib/env.js';
import { withAdvisoryLock } from '../lib/locks.js';
import { mailEnabled } from '../lib/mailer.js';
import { runDueReminders } from './dueReminders.js';
import { runDailyEmailDigest, runEmailOutbox } from './emailOutbox.js';

type JobFn = () => Promise<unknown>;

/** Every job takes an advisory lock, so two server instances never double-send. */
function schedule(name: string, expression: string, fn: JobFn) {
  cron.schedule(
    expression,
    async () => {
      try {
        await withAdvisoryLock(`job:${name}`, fn);
      } catch (err) {
        console.error(`[jobs] ${name} failed`, err);
      }
    },
    { timezone: env.REPORT_TZ, name },
  );
}

const extraJobs: [string, string, JobFn][] = [];

/** Later milestones register their jobs here before startJobs() runs. */
export function registerJob(name: string, expression: string, fn: JobFn) {
  extraJobs.push([name, expression, fn]);
}

/** Started from index.ts only (never from app.ts), so tests don't run jobs. */
export function startJobs() {
  if (!env.JOBS_ENABLED) {
    console.log('[jobs] disabled (JOBS_ENABLED=false)');
    return;
  }
  schedule('email-outbox', '*/30 * * * * *', () => runEmailOutbox());
  schedule('due-reminders', '0 9 * * *', () => runDueReminders());
  schedule('daily-email-digest', '5 9 * * *', () => runDailyEmailDigest());
  for (const [name, expression, fn] of extraJobs) schedule(name, expression, fn);

  console.log(`[jobs] scheduled in ${env.REPORT_TZ}; email ${mailEnabled ? 'on' : 'off (SMTP_URL not set)'}`);
}
