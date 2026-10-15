// SupabaseStorage against a stand-in for the Supabase Storage HTTP API.
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';
import { SupabaseStorage } from '../src/lib/storage.js';

const files = new Map<string, Buffer>();
const seen: { method: string; url: string; auth: string | undefined }[] = [];
let base = '';

const body = (req: IncomingMessage) =>
  new Promise<Buffer>((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });

const server = createServer(async (req, res) => {
  seen.push({ method: req.method!, url: req.url!, auth: req.headers.authorization });
  const prefix = '/storage/v1/object/attachments';
  const key = decodeURIComponent(req.url!.slice(prefix.length + 1));
  if (req.method === 'POST') {
    if (files.has(key)) return res.writeHead(409).end('{"error":"Duplicate"}');
    files.set(key, await body(req));
    return res.writeHead(200).end('{}');
  }
  if (req.method === 'GET') {
    const f = files.get(key);
    return f ? res.writeHead(200).end(f) : res.writeHead(404).end();
  }
  if (req.method === 'DELETE') {
    const { prefixes } = JSON.parse((await body(req)).toString());
    for (const p of prefixes) files.delete(p);
    return res.writeHead(200).end('[]');
  }
  res.writeHead(405).end();
});

before(async () => {
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});
after(() => server.close());

const read = (s: NodeJS.ReadableStream) =>
  new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    s.on('data', (c: Buffer) => chunks.push(c));
    s.on('end', () => resolve(Buffer.concat(chunks)));
    s.on('error', reject);
  });

describe('SupabaseStorage', () => {
  test('uploads, streams back and deletes with the service key', async () => {
    const s = new SupabaseStorage(base, 'service-key', 'attachments');
    await s.put('2026/10/abc.pdf', Buffer.from('%PDF-hello'));
    assert.equal((await read(s.get('2026/10/abc.pdf'))).toString(), '%PDF-hello');
    await s.remove('2026/10/abc.pdf');
    assert.equal(files.size, 0);
    assert.ok(seen.every((r) => r.auth === 'Bearer service-key'));
  });

  test('a missing file becomes a stream error', async () => {
    const s = new SupabaseStorage(base, 'service-key', 'attachments');
    await assert.rejects(read(s.get('nope.pdf')), /404/);
  });

  test('refuses an upload over an existing key, and keys that climb out', async () => {
    const s = new SupabaseStorage(base, 'service-key', 'attachments');
    await s.put('k1', Buffer.from('a'));
    await assert.rejects(s.put('k1', Buffer.from('b')), /409/);
    await assert.rejects(s.put('../x', Buffer.from('c')), /Invalid storage key/);
  });

  test('needs a URL and key', () => {
    assert.throws(() => new SupabaseStorage('', '', 'attachments'), /SUPABASE_URL/);
  });
});
