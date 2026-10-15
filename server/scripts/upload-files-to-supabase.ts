// One-time copy of local attachment files (UPLOAD_DIR) into the Supabase bucket, keeping
// the same keys so existing attachment rows keep working. Safe to rerun: files already in
// the bucket are skipped.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../src/lib/env.js';
import { SupabaseStorage } from '../src/lib/storage.js';

const target = new SupabaseStorage(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, env.SUPABASE_BUCKET);

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

let copied = 0;
let skipped = 0;
for await (const file of walk(env.UPLOAD_DIR)) {
  const key = path.relative(env.UPLOAD_DIR, file).split(path.sep).join('/');
  try {
    await target.put(key, await readFile(file));
    copied++;
  } catch (err) {
    if (String(err).includes('409') || String(err).toLowerCase().includes('already exists')) skipped++;
    else throw err;
  }
}
console.log(`Copied ${copied} file(s) to the "${env.SUPABASE_BUCKET}" bucket; ${skipped} were already there.`);
