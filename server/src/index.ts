import { createApp } from './app.js';
import { registerJob, startJobs } from './jobs/index.js';
import { env } from './lib/env.js';
import { purgeDeletedFiles } from './services/attachmentService.js';
import { runRecurringTasks } from './services/templateService.js';
import { runWeeklyReportJob } from './services/weeklyReportService.js';

registerJob('purge-deleted-files', '30 3 * * *', purgeDeletedFiles);
registerJob('weekly-report', '0 8 * * 1', runWeeklyReportJob);
// Hourly: new schedules start promptly, and a missed night is caught up within the hour.
// Safe to repeat: a template can never make two tasks for one deadline.
registerJob('recurring-tasks', '15 * * * *', runRecurringTasks);

createApp().listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}/api`);
  startJobs();
});
