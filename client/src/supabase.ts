import { createClient } from '@supabase/supabase-js';

// Sign-in runs on Supabase Auth: passwords, the emailed sign-up code and authenticator 2FA.
// The key is the public (publishable) one; it only allows what Supabase Auth lets anyone do.
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && key);

export const supabase = createClient(url || 'http://supabase-not-configured.invalid', key || 'missing-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'task-tracker-auth' },
});
