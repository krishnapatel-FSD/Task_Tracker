import { createApp } from './app.js';
import { pool } from './db/index.js';
import { registerJob, startJobs } from './jobs/index.js';
import { env } from './lib/env.js';
import { purgeDeletedFiles } from './services/attachmentService.js';
import { syncSignupDomains } from './services/authService.js';
import { runWeeklyReportJob } from './services/weeklyReportService.js';

registerJob('purge-deleted-files', '30 3 * * *', purgeDeletedFiles);
registerJob('weekly-report', '0 8 * * 1', runWeeklyReportJob);

// The Supabase sign-up hook reads the allowed domains from the database.
syncSignupDomains().catch((err) => console.error('Could not save the sign-up domains', err));

const server = createApp().listen(env.PORT, () => {
  console.log(`API listening on port ${env.PORT} (/api)`);
  startJobs();
});

// Hosts stop the old instance with SIGTERM on every deploy: finish open requests, then
// release the database connections, so nothing is cut off half way.
function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(0), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
