import 'dotenv/config';
import path from 'node:path';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const DATABASE_URL = required('DATABASE_URL');

const CLIENT_ORIGINS = (process.env.CLIENT_ORIGIN ?? 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);

/** Supabase (and most hosted Postgres) needs TLS; local Docker doesn't. */
function databaseSsl(): boolean {
  const flag = process.env.DATABASE_SSL;
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return /supabase\.(co|com)/.test(DATABASE_URL);
}

export const env = {
  DATABASE_URL,
  DATABASE_SSL: databaseSsl(),
  /** Optional path to the database's CA certificate (Supabase: Settings > Database > SSL). Verifies the server when set. */
  DATABASE_SSL_CA: process.env.DATABASE_SSL_CA ?? '',
  JWT_SECRET: required('JWT_SECRET'),
  PORT: Number(process.env.PORT ?? 4000),
  /** Web app addresses allowed to call the API, comma-separated (production, previews). */
  CLIENT_ORIGINS: CLIENT_ORIGINS,
  /** Base URL of the web app, used for links in emails. */
  APP_URL: (process.env.APP_URL ?? CLIENT_ORIGINS[0]).replace(/\/+$/, ''),
  /**
   * Proxies in front of the API (Railway has one). Needed so rate limits see the visitor's
   * address. Defaults to 1 on Railway and 0 elsewhere.
   */
  TRUST_PROXY: Number(process.env.TRUST_PROXY ?? (process.env.RAILWAY_ENVIRONMENT_NAME || process.env.RAILWAY_ENVIRONMENT ? 1 : 0)),
  /** Time zone for "today", reminders and report weeks. */
  REPORT_TZ: process.env.REPORT_TZ ?? 'Asia/Kolkata',
  /** Unset disables email: notifications stay in-app and sends are logged instead. */
  SMTP_URL: process.env.SMTP_URL ?? '',
  MAIL_FROM: process.env.MAIL_FROM ?? 'Task Tracker <no-reply@tasktracker.local>',
  /** Brevo API key: sends all email over HTTPS instead of SMTP (which Railway blocks on smaller plans). */
  BREVO_API_KEY: process.env.BREVO_API_KEY ?? '',
  /**
   * Local development only: print sign-up codes in the server log, so sign-up works without
   * email. Never set this on a host: without real email, sign-up there stays closed.
   */
  SIGNUP_CODES_IN_LOG: process.env.SIGNUP_CODES_IN_LOG === 'true',
  /** Scheduled jobs run in the server process. Off for tests and extra API-only instances. */
  JOBS_ENABLED: (process.env.JOBS_ENABLED ?? 'true') === 'true',
  UPLOAD_DIR: path.resolve(process.env.UPLOAD_DIR ?? 'uploads'),
  /** Where attachment bytes live: 'local' (UPLOAD_DIR) or 'supabase' (a private Storage bucket). */
  STORAGE_DRIVER: (process.env.STORAGE_DRIVER ?? 'local') as 'local' | 'supabase',
  SUPABASE_URL: (process.env.SUPABASE_URL ?? '').replace(/\/+$/, ''),
  /** Server only. Never send this to the browser. */
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  SUPABASE_BUCKET: process.env.SUPABASE_BUCKET ?? 'attachments',
  MAX_UPLOAD_MB: Number(process.env.MAX_UPLOAD_MB ?? 10),
  /**
   * Email domains that may create their own account (sign-up page and Google), comma-separated,
   * e.g. "decacorpus.com". Empty turns self sign-up off; the admin can still add people.
   */
  SIGNUP_EMAIL_DOMAINS: (process.env.SIGNUP_EMAIL_DOMAINS ?? '')
    .split(',')
    .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean),
  /** OAuth client ID from Google Cloud (Web application). Empty hides "Continue with Google". */
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? '',
};
