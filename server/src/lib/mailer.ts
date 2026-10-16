import nodemailer from 'nodemailer';
import { env } from './env.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: { filename: string; content: string | Buffer; contentType?: string }[];
}

export type SendMail = (message: MailMessage) => Promise<void>;

const transport = env.SMTP_URL ? nodemailer.createTransport(env.SMTP_URL) : null;

/**
 * False when SMTP_URL is unset: email is off and notifications stay in-app. (Sign-up codes
 * don't depend on this; Supabase Auth sends those.)
 */
export const mailEnabled = Boolean(transport);

// Reserved for examples and tests (RFC 2606): never deliverable, so never sent.
const UNDELIVERABLE = /@(?:[^@]+\.)?(example\.(com|net|org)|[^@]+\.(test|example|invalid|localhost))$/i;

export const sendMail: SendMail = async (message) => {
  if (!transport || UNDELIVERABLE.test(message.to)) {
    console.log(`[mail not sent] "${message.subject}" to ${message.to}`);
    return;
  }
  await transport.sendMail({ from: env.MAIL_FROM, ...message });
};

/** Absolute link into the web app, for email bodies. */
export const appLink = (path: string | null | undefined) => `${env.APP_URL.replace(/\/$/, '')}${path ?? '/'}`;
