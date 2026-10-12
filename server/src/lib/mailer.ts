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

/** False when SMTP_URL is unset: email is off and notifications stay in-app. */
export const mailEnabled = Boolean(transport);

export const sendMail: SendMail = async (message) => {
  if (!transport) {
    console.log(`[mail disabled] would send "${message.subject}" to ${message.to}`);
    return;
  }
  await transport.sendMail({ from: env.MAIL_FROM, ...message });
};

/** Absolute link into the web app, for email bodies. */
export const appLink = (path: string | null | undefined) => `${env.APP_URL.replace(/\/$/, '')}${path ?? '/'}`;
