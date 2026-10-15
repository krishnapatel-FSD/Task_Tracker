import { createReadStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import { env } from './env.js';

/** Where attachment bytes live. Routes only see this interface, so disk and Supabase are interchangeable. */
export interface Storage {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Readable;
  remove(key: string): Promise<void>;
}

export class LocalDiskStorage implements Storage {
  constructor(private readonly root: string) {}

  private pathFor(key: string) {
    // Keys are generated server-side, but never let one escape the upload root.
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root) + path.sep)) throw new Error('Invalid storage key');
    return full;
  }

  async put(key: string, data: Buffer) {
    const full = this.pathFor(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data, { flag: 'wx' });
  }

  get(key: string) {
    return createReadStream(this.pathFor(key));
  }

  async remove(key: string) {
    await rm(this.pathFor(key), { force: true });
  }
}

/**
 * A private Supabase Storage bucket, reached through its HTTP API with the service-role key.
 * Downloads still go through our API, so every permission check stays on our server.
 */
export class SupabaseStorage implements Storage {
  constructor(
    private readonly baseUrl: string,
    private readonly serviceKey: string,
    private readonly bucket: string,
  ) {
    if (!baseUrl || !serviceKey) throw new Error('STORAGE_DRIVER=supabase needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  }

  private headers(extra: Record<string, string> = {}) {
    return { Authorization: `Bearer ${this.serviceKey}`, apikey: this.serviceKey, ...extra };
  }

  private objectUrl(key: string) {
    if (key.includes('..')) throw new Error('Invalid storage key');
    return `${this.baseUrl}/storage/v1/object/${encodeURIComponent(this.bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`;
  }

  async put(key: string, data: Buffer) {
    const res = await fetch(this.objectUrl(key), {
      method: 'POST',
      headers: this.headers({ 'Content-Type': 'application/octet-stream', 'x-upsert': 'false' }),
      body: new Uint8Array(data),
    });
    if (!res.ok) throw new Error(`Supabase upload failed (${res.status}): ${await res.text()}`);
  }

  get(key: string) {
    // The route pipes this straight to the browser; a failed fetch surfaces as a stream error.
    const out = new PassThrough();
    fetch(this.objectUrl(key), { headers: this.headers() })
      .then((res) => {
        if (!res.ok || !res.body) throw new Error(`Supabase download failed (${res.status})`);
        Readable.fromWeb(res.body as import('node:stream/web').ReadableStream).pipe(out);
      })
      .catch((err) => out.destroy(err));
    return out;
  }

  async remove(key: string) {
    const res = await fetch(`${this.baseUrl}/storage/v1/object/${encodeURIComponent(this.bucket)}`, {
      method: 'DELETE',
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ prefixes: [key] }),
    });
    if (!res.ok && res.status !== 404) throw new Error(`Supabase delete failed (${res.status})`);
  }
}

export const storage: Storage =
  env.STORAGE_DRIVER === 'supabase'
    ? new SupabaseStorage(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, env.SUPABASE_BUCKET)
    : new LocalDiskStorage(env.UPLOAD_DIR);
