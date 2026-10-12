import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { and, asc, count, eq, isNotNull, isNull, lt } from 'drizzle-orm';
import { fileTypeFromBuffer } from 'file-type';
import { db } from '../db/index.js';
import { attachments, tasks, users } from '../db/schema.js';
import { env } from '../lib/env.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import type { AuthUser } from '../lib/jwt.js';
import { storage } from '../lib/storage.js';
import { recordEvent } from './taskEvents.js';
import { loadTaskFor } from './taskService.js';

export const MAX_ATTACHMENTS_PER_TASK = 10;

/** Allowed extensions and the type their bytes must sniff as (null = plain text, no magic bytes). */
const ALLOWED: Record<string, { sniffed: string | null; mime: string }> = {
  pdf: { sniffed: 'pdf', mime: 'application/pdf' },
  png: { sniffed: 'png', mime: 'image/png' },
  jpg: { sniffed: 'jpg', mime: 'image/jpeg' },
  jpeg: { sniffed: 'jpg', mime: 'image/jpeg' },
  webp: { sniffed: 'webp', mime: 'image/webp' },
  gif: { sniffed: 'gif', mime: 'image/gif' },
  txt: { sniffed: null, mime: 'text/plain' },
  csv: { sniffed: null, mime: 'text/csv' },
  docx: { sniffed: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  xlsx: { sniffed: 'xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  pptx: { sniffed: 'pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  zip: { sniffed: 'zip', mime: 'application/zip' },
};

export const ALLOWED_EXTENSIONS = Object.keys(ALLOWED);

const attachmentFields = {
  id: attachments.id,
  fileName: attachments.fileName,
  mimeType: attachments.mimeType,
  sizeBytes: attachments.sizeBytes,
  createdAt: attachments.createdAt,
  uploader: { id: users.id, name: users.name },
};

/** Keeps a readable display name; the stored file never uses it. */
function sanitiseFileName(name: string) {
  const base = path.basename(name.replace(/\\/g, '/'));
  const cleaned = base.replace(/[\u0000-\u001f\u007f"<>|:*?]/g, '').trim();
  return (cleaned || 'file').slice(0, 200);
}

/** Checks extension and actual content. Browser-sent MIME types are ignored. */
async function detectType(fileName: string, data: Buffer) {
  const ext = path.extname(fileName).slice(1).toLowerCase();
  const rule = ALLOWED[ext];
  if (!rule) {
    throw badRequest(`That file type isn't allowed. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}.`);
  }
  const sniffed = await fileTypeFromBuffer(data);
  if (rule.sniffed === null) {
    // Plain text has no signature: reject anything that sniffs as binary or contains NUL bytes.
    if (sniffed || data.includes(0)) throw badRequest("The file's contents don't match its .txt/.csv extension.");
  } else if (sniffed?.ext !== rule.sniffed) {
    throw badRequest(`The file's contents don't match its .${ext} extension.`);
  }
  return rule.mime;
}

export async function listAttachments(caller: AuthUser, taskId: string) {
  await loadTaskFor(caller, taskId, 'hide');
  return db
    .select(attachmentFields)
    .from(attachments)
    .innerJoin(users, eq(users.id, attachments.uploaderId))
    .where(and(eq(attachments.taskId, taskId), isNull(attachments.deletedAt)))
    .orderBy(asc(attachments.createdAt));
}

export async function addAttachment(caller: AuthUser, taskId: string, file: { originalname: string; buffer: Buffer; size: number }) {
  await loadTaskFor(caller, taskId, 'forbid');
  if (file.size === 0) throw badRequest('That file is empty.');

  const fileName = sanitiseFileName(file.originalname);
  const mimeType = await detectType(fileName, file.buffer);

  const [{ live }] = await db
    .select({ live: count() })
    .from(attachments)
    .where(and(eq(attachments.taskId, taskId), isNull(attachments.deletedAt)));
  if (live >= MAX_ATTACHMENTS_PER_TASK) {
    throw badRequest(`A task can have up to ${MAX_ATTACHMENTS_PER_TASK} files. Remove one first.`);
  }

  const storageKey = `${taskId}/${randomUUID()}`;
  await storage.put(storageKey, file.buffer);
  try {
    const id = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(attachments)
        .values({ taskId, uploaderId: caller.id, fileName, storageKey, mimeType, sizeBytes: file.size })
        .returning({ id: attachments.id });
      await recordEvent(tx, { taskId, actorId: caller.id, type: 'attachment_added', data: { attachmentId: row.id, fileName } });
      return row.id;
    });
    const [created] = await db
      .select(attachmentFields)
      .from(attachments)
      .innerJoin(users, eq(users.id, attachments.uploaderId))
      .where(eq(attachments.id, id));
    return created;
  } catch (err) {
    await storage.remove(storageKey).catch(() => {});
    throw err;
  }
}

/** Loads a live attachment on a live task the caller can see; otherwise 404. */
async function loadAttachmentFor(caller: AuthUser, id: string) {
  const [row] = await db
    .select({
      id: attachments.id,
      taskId: attachments.taskId,
      uploaderId: attachments.uploaderId,
      fileName: attachments.fileName,
      storageKey: attachments.storageKey,
      mimeType: attachments.mimeType,
      sizeBytes: attachments.sizeBytes,
    })
    .from(attachments)
    .innerJoin(tasks, eq(tasks.id, attachments.taskId))
    .where(and(eq(attachments.id, id), isNull(attachments.deletedAt), isNull(tasks.archivedAt)))
    .limit(1);
  if (!row) throw notFound('File not found');
  await loadTaskFor(caller, row.taskId, 'hide').catch(() => {
    throw notFound('File not found');
  });
  return row;
}

export async function openDownload(caller: AuthUser, id: string) {
  const row = await loadAttachmentFor(caller, id);
  return { ...row, stream: storage.get(row.storageKey) };
}

export async function removeAttachment(caller: AuthUser, id: string) {
  const row = await loadAttachmentFor(caller, id);
  if (caller.role !== 'admin' && row.uploaderId !== caller.id) {
    throw forbidden('You can only remove files you uploaded');
  }
  await db.transaction(async (tx) => {
    await tx.update(attachments).set({ deletedAt: new Date() }).where(eq(attachments.id, id));
    await recordEvent(tx, {
      taskId: row.taskId,
      actorId: caller.id,
      type: 'attachment_removed',
      data: { attachmentId: id, fileName: row.fileName },
    });
  });
}

/** Nightly: deletes the bytes of files removed more than a day ago. */
export async function purgeDeletedFiles() {
  const rows = await db
    .select({ id: attachments.id, storageKey: attachments.storageKey })
    .from(attachments)
    .where(and(isNotNull(attachments.deletedAt), isNull(attachments.purgedAt), lt(attachments.deletedAt, new Date(Date.now() - 86_400_000))));
  for (const row of rows) {
    await storage.remove(row.storageKey);
    await db.update(attachments).set({ purgedAt: new Date() }).where(eq(attachments.id, row.id));
  }
  return { purged: rows.length };
}

export const maxUploadBytes = env.MAX_UPLOAD_MB * 1024 * 1024;
