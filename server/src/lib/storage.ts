import { createReadStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { env } from './env.js';

/** Where attachment bytes live. Routes only see this interface, so S3/R2 can replace disk later. */
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

export const storage: Storage = new LocalDiskStorage(env.UPLOAD_DIR);
