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

/** "Task Tracker <no-reply@x.com>" → name and address. */
function parseFrom(from: string) {
  const match = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return match ? { name: match[1].replace(/^"|"$/g, '') || undefined, email: match[2] } : { email: from.trim() };
}

/**
 * Brevo's HTTP API. Hosts like Railway block SMTP on smaller plans, so a web API is the
 * dependable way out. The sender (MAIL_FROM) must be verified in Brevo.
 */
async function sendWithBrevo(message: MailMessage) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env.BREVO_API_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: parseFrom(env.MAIL_FROM),
      to: [{ email: message.to }],
      subject: message.subject,
      textContent: message.text,
      ...(message.html && { htmlContent: message.html }),
      ...(message.attachments?.length && {
        attachment: message.attachments.map((a) => ({ name: a.filename, content: Buffer.from(a.content).toString('base64') })),
      }),
    }),
  });
  if (!res.ok) throw new Error(`Brevo send failed (${res.status}): ${await res.text()}`);
}

const transport = !env.BREVO_API_KEY && env.SMTP_URL ? nodemailer.createTransport(env.SMTP_URL) : null;

/** False when neither BREVO_API_KEY nor SMTP_URL is set: email is off and notifications stay in-app. */
export const mailEnabled = Boolean(env.BREVO_API_KEY || transport);

// Reserved for examples and tests (RFC 2606): never deliverable, so never sent.
const UNDELIVERABLE = /@(?:[^@]+\.)?(example\.(com|net|org)|[^@]+\.(test|example|invalid|localhost))$/i;

export const sendMail: SendMail = async (message) => {
  if (!mailEnabled || UNDELIVERABLE.test(message.to)) {
    console.log(`[mail not sent] "${message.subject}" to ${message.to}`);
    return;
  }
  if (env.BREVO_API_KEY) return sendWithBrevo(message);
  await transport!.sendMail({ from: env.MAIL_FROM, ...message });
};

/** Absolute link into the web app, for email bodies. */
export const appLink = (path: string | null | undefined) => `${env.APP_URL.replace(/\/$/, '')}${path ?? '/'}`;
