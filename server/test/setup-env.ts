// Loaded before every test file: tests run on the local Docker database and local disk,
// never on the real (Supabase) database or bucket the app is configured for.
import 'dotenv/config';

if (!process.env.TEST_DATABASE_URL) {
  throw new Error('Set TEST_DATABASE_URL in server/.env (the local Docker database) before running tests');
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.DATABASE_SSL = 'false';
process.env.STORAGE_DRIVER = 'local';
// Sign-up and Google sign-in, with a domain only the tests use.
process.env.SIGNUP_EMAIL_DOMAINS = 'signup.test';
process.env.SIGNUP_CODES_IN_LOG = 'true';
process.env.GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
