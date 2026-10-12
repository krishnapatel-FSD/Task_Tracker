import 'dotenv/config';
import path from 'node:path';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  DATABASE_URL: required('DATABASE_URL'),
  JWT_SECRET: required('JWT_SECRET'),
  PORT: Number(process.env.PORT ?? 4000),
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  /** Base URL of the web app, used for links in emails. */
  APP_URL: process.env.APP_URL ?? process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  /** Time zone for "today", reminders and report weeks. */
  REPORT_TZ: process.env.REPORT_TZ ?? 'Asia/Kolkata',
  /** Unset disables email: notifications stay in-app and sends are logged instead. */
  SMTP_URL: process.env.SMTP_URL ?? '',
  MAIL_FROM: process.env.MAIL_FROM ?? 'Task Tracker <no-reply@tasktracker.local>',
  /** Scheduled jobs run in the server process. Off for tests and extra API-only instances. */
  JOBS_ENABLED: (process.env.JOBS_ENABLED ?? 'true') === 'true',
  UPLOAD_DIR: path.resolve(process.env.UPLOAD_DIR ?? 'uploads'),
  MAX_UPLOAD_MB: Number(process.env.MAX_UPLOAD_MB ?? 10),
};
