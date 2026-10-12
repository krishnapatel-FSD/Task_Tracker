import { and, asc, eq, gt, inArray, isNull, lte, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { notificationPreferences, notifications, users } from '../db/schema.js';
import { appLink, mailEnabled, sendMail, type SendMail } from '../lib/mailer.js';
import { outboxCondition } from '../services/notificationService.js';

const BATCH = 50;

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/**
 * Sends instant emails for notifications created since the last run. Runs after the
 * API transaction has committed, so a mail failure never breaks a request; a failed
 * send stays unstamped and is retried on the next tick.
 */
export async function runEmailOutbox(send: SendMail = sendMail, opts: { force?: boolean } = {}) {
  if (!mailEnabled && !opts.force) return { sent: 0 };

  const pending = await db
    .select({ id: notifications.id, title: notifications.title, body: notifications.body, link: notifications.link, email: users.email })
    .from(notifications)
    .innerJoin(users, eq(users.id, notifications.userId))
    .leftJoin(notificationPreferences, eq(notificationPreferences.userId, notifications.userId))
    .where(and(outboxCondition(), sql`coalesce(${notificationPreferences.emailFrequency}, 'instant') = 'instant'`))
    .orderBy(asc(notifications.createdAt))
    .limit(BATCH);

  let sent = 0;
  for (const n of pending) {
    try {
      const url = appLink(n.link);
      await send({
        to: n.email,
        subject: n.title,
        text: `${n.title}\n${n.body ? `\n${n.body}\n` : ''}\nOpen Task Tracker: ${url}\n`,
        html: `<p style="font:600 16px system-ui,sans-serif;margin:0 0 8px">${escapeHtml(n.title)}</p>${
          n.body ? `<p style="font:14px system-ui,sans-serif;margin:0 0 16px;color:#465065">${escapeHtml(n.body)}</p>` : ''
        }<p style="font:14px system-ui,sans-serif"><a href="${url}">Open Task Tracker</a></p>`,
      });
      await db.update(notifications).set({ emailedAt: new Date() }).where(eq(notifications.id, n.id));
      sent++;
    } catch (err) {
      console.error(`[outbox] sending notification ${n.id} failed; will retry`, err);
    }
  }
  return { sent };
}

/** One email per person who chose a daily digest, covering the last day's notifications. */
export async function runDailyEmailDigest(send: SendMail = sendMail, opts: { force?: boolean } = {}) {
  if (!mailEnabled && !opts.force) return { sent: 0 };

  const rows = await db
    .select({ id: notifications.id, userId: notifications.userId, title: notifications.title, email: users.email, name: users.name })
    .from(notifications)
    .innerJoin(users, eq(users.id, notifications.userId))
    .innerJoin(notificationPreferences, eq(notificationPreferences.userId, notifications.userId))
    .where(
      and(
        isNull(notifications.emailedAt),
        lte(notifications.deliverAfter, new Date()),
        gt(notifications.createdAt, sql`now() - interval '1 day'`),
        eq(notificationPreferences.emailEnabled, true),
        eq(notificationPreferences.emailFrequency, 'daily'),
      ),
    )
    .orderBy(asc(notifications.createdAt));

  const byUser = new Map<string, typeof rows>();
  for (const row of rows) byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row]);

  let sent = 0;
  for (const list of byUser.values()) {
    try {
      await send({
        to: list[0].email,
        subject: `Your Task Tracker summary: ${list.length} update${list.length === 1 ? '' : 's'}`,
        text: `${list.map((n) => `- ${n.title}`).join('\n')}\n\nOpen Task Tracker: ${appLink('/')}\n`,
        html: `<ul style="font:14px system-ui,sans-serif">${list.map((n) => `<li>${escapeHtml(n.title)}</li>`).join('')}</ul><p style="font:14px system-ui,sans-serif"><a href="${appLink('/')}">Open Task Tracker</a></p>`,
      });
      await db.update(notifications).set({ emailedAt: new Date() }).where(inArray(notifications.id, list.map((n) => n.id)));
      sent++;
    } catch (err) {
      console.error('[digest] sending failed; will retry tomorrow', err);
    }
  }
  return { sent };
}
